#!/usr/bin/env python3
"""Prepare or audit all audio; paid generation remains disabled pending review."""
import argparse
import base64
import gzip
import hashlib
import json
import os
from pathlib import Path
import tempfile
import urllib.request
import uuid

from prepare_study_audio import make_plan
from prepare_full_audio_batches import prepare
from run_audio_sample import process
from upload_audio_trial import ACCOUNT, BUCKET, SOURCE_RUN, error_code, plan_hash, sha

ROOT = Path(__file__).resolve().parents[1]
CATALOG_SHA = '82456f9561f54ecfa8d3d1bb794cb73eaaa24770aa076744c09bbd19d5c22255'
PREFIX = 'backups/audio-full/v1/'
MAX_BYTES = 10_000_000


def encode(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode()


def load_plan():
    raw = gzip.decompress(base64.b64decode((ROOT / 'tools/audio-full-catalog.json.gz.b64').read_bytes()))
    if sha(raw) != CATALOG_SHA:
        raise ValueError('Catalog changed; review required')
    catalog = json.loads(raw)
    trial = json.loads((ROOT / 'tools/audio-sample-plan.json').read_text())
    items = [dict(mode=mode, question_key=key, text=text, text_sha256=sha(text.encode()),
                  excel_row=row, pronunciation_review=review)
             for mode, key, text, row, review in catalog['rows']]
    full = make_plan(items, catalog['source_sha256'])
    return (*prepare(full, trial), trial)


class Store:
    def __init__(self, client):
        self.client = client

    def read(self, key):
        try:
            response = self.client.get_object(Bucket=BUCKET, Key=key)
        except Exception as error:
            if error_code(error) in ('NoSuchKey', '404'):
                return None
            raise
        body = response['Body']
        try:
            data = body.read(MAX_BYTES + 1)
        finally:
            body.close()
        if not data or len(data) > MAX_BYTES or response.get('Metadata', {}).get('sha256') != sha(data):
            raise ValueError('R2 checksum/size verification failed')
        return data

    def create(self, key, data, content_type='application/json'):
        """Never overwrite. Return False when another writer already owns this key."""
        try:
            self.client.put_object(Bucket=BUCKET, Key=key, Body=data, ContentType=content_type,
                                   Metadata={'sha256': sha(data)}, IfNoneMatch='*')
        except Exception as error:
            if error_code(error) in ('PreconditionFailed', '412'):
                return False
            raise
        if self.read(key) != data:
            raise ValueError('R2 readback differs')
        return True

    def ensure(self, key, data, content_type='application/json'):
        existing = self.read(key)
        if existing is None:
            self.create(key, data, content_type)
            existing = self.read(key)
        if existing != data:
            raise ValueError('Existing object differs; refusing overwrite')


def verify_audio(data, entry):
    if data is None or len(data) != entry['bytes'] or sha(data) != entry['file_sha256']:
        raise ValueError('Audio and ledger differ')
    if not 0.1 <= entry['duration_seconds'] <= 120:
        raise ValueError('Invalid audio duration')


def verify_trial(store, trial):
    prefix = f'backups/audio-trials/{SOURCE_RUN}/'
    saved = store.read(prefix + 'plan.json')
    ledger = store.read(prefix + 'state.json')
    if saved is None or ledger is None or json.loads(saved) != trial:
        raise ValueError('Approved trial backup is missing or different')
    state = json.loads(ledger)
    if state['plan_sha256'] != plan_hash(trial):
        raise ValueError('Trial ledger belongs to another plan')
    for job in trial['jobs']:
        entry = state['entries'][job['asset_id']]
        if entry['status'] != 'generated':
            raise ValueError('Trial incomplete')
        verify_audio(store.read(job['object_key']), entry)
    return state['entries']


def keys(job):
    stem = PREFIX + job['asset_id']
    return stem + '/request.json', stem + '/raw.mp3', stem + '/complete.json'


def completed(store, job):
    _, _, complete = keys(job)
    data = store.read(complete)
    if data is None:
        return None
    entry = json.loads(data)
    if entry['asset_id'] != job['asset_id'] or entry['status'] != 'generated':
        raise ValueError('Invalid completion record')
    verify_audio(store.read(job['object_key']), entry)
    return entry


def request_audio(job):
    secret = os.environ['OPENAI_API_KEY'].strip()
    payload = {k: job[k] for k in ('model', 'voice', 'instructions')}
    payload.update(input=job['text'], response_format='mp3')
    request = urllib.request.Request('https://api.openai.com/v1/audio/speech',
        data=encode(payload), headers={'Authorization': 'Bearer ' + secret, 'Content-Type': 'application/json'})
    # No automatic retry: a timeout may still have incurred a charge.
    with urllib.request.urlopen(request, timeout=120) as response:
        data = response.read(MAX_BYTES + 1)
    if not data or len(data) > MAX_BYTES:
        raise ValueError('Unexpected audio response size')
    return data


def run_jobs(store, jobs, root, max_requests, requester=request_audio, processor=process):
    if not 1 <= max_requests <= 500:
        raise ValueError('Request limit must be 1..500')
    root.mkdir(parents=True, exist_ok=True)
    report = {'requested': 0, 'reused': 0, 'completed': 0, 'limit_reached': False,
              'publication': 'unchanged', 'billing_cost_usd': None}
    try:
        for job in jobs:
            if completed(store, job):
                report['reused'] += 1
                continue
            request_key, raw_key, complete_key = keys(job)
            marker, raw = store.read(request_key), store.read(raw_key)
            if marker is not None and json.loads(marker).get('asset_id') != job['asset_id']:
                raise ValueError('Request record differs')
            if raw is not None and marker is None:
                raise ValueError('Raw audio lacks request record')
            if raw is None:
                if marker is not None:
                    raise ValueError('Prior request outcome uncertain; manual recovery required')
                if store.read(job['object_key']) is not None:
                    raise ValueError('Untracked output exists; manual recovery required')
                if report['requested'] >= max_requests:
                    report['limit_reached'] = True
                    break
                marker = encode({'asset_id': job['asset_id'], 'attempt_id': str(uuid.uuid4()),
                                 'status': 'request_started'})
                if not store.create(request_key, marker):
                    raise ValueError('Another process already claimed this request')
                report['requested'] += 1
                raw = requester(job)
                if not raw or len(raw) > MAX_BYTES:
                    raise ValueError('Unexpected audio response size')
                # Local rescue copy precedes remote writes. Workflow always uploads this directory.
                (root / (job['asset_id'] + '.raw.mp3')).write_bytes(raw)
                store.ensure(raw_key, raw, 'audio/mpeg')
            with tempfile.TemporaryDirectory() as directory:
                raw_path, target = Path(directory) / 'raw.mp3', Path(directory) / 'processed.mp3'
                raw_path.write_bytes(raw)
                details = processor(raw_path, target)
                output = target.read_bytes()
                verify_audio(output, details)
                if len(output) > MAX_BYTES:
                    raise ValueError('Processed audio too large')
                store.ensure(job['object_key'], output, 'audio/mpeg')
            entry = {**details, 'asset_id': job['asset_id'], 'status': 'generated', 'listening_review': 'pending'}
            store.ensure(complete_key, encode(entry))
            completed(store, job)
            report['completed'] += 1
            print('Saved', job['question_key'], job['voice'], flush=True)
        return report
    finally:
        (root / 'summary.json').write_text(json.dumps(report, indent=2))


def connect():
    if os.environ.get('R2_ACCOUNT_ID', '').strip() != ACCOUNT:
        raise ValueError('Unexpected R2 account')
    import boto3
    from botocore.config import Config
    return Store(boto3.client('s3', endpoint_url=f'https://{ACCOUNT}.r2.cloudflarestorage.com', region_name='auto',
        aws_access_key_id=os.environ['R2_ACCESS_KEY_ID'].strip(),
        aws_secret_access_key=os.environ['R2_SECRET_ACCESS_KEY'].strip(),
        config=Config(signature_version='s3v4', retries={'mode': 'standard', 'total_max_attempts': 1},
                      connect_timeout=10, read_timeout=60,
                      request_checksum_calculation='when_required', response_checksum_validation='when_required')))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--mode', choices=('validate', 'audit', 'generate'), default='validate')
    parser.add_argument('--batch', type=int, default=1)
    parser.add_argument('--max-requests', type=int, default=20)
    parser.add_argument('--output', type=Path, default=Path('audio-preparation/full-run'))
    args = parser.parse_args()
    plan, batches, reuse, report, trial = load_plan()
    if not 1 <= args.batch <= len(batches):
        raise ValueError('Invalid batch number')
    if not 1 <= args.max_requests <= 500:
        raise ValueError('Invalid request limit')
    print(json.dumps(report, ensure_ascii=False))
    if args.mode == 'validate':
        return
    if args.mode == 'generate':
        # Enabling requires a reviewed code change, not just an accidental workflow click.
        raise ValueError('Paid full generation is not enabled: model, pronunciation and budget review required')
    store = connect()
    verify_trial(store, trial)
    statuses = {'complete': 0, 'raw_saved': 0, 'uncertain': 0, 'not_started': 0}
    for job in batches[args.batch - 1]:
        if completed(store, job):
            statuses['complete'] += 1
            continue
        request_key, raw_key, _ = keys(job)
        marker, raw = store.read(request_key), store.read(raw_key)
        if raw is not None and marker is None:
            raise ValueError('Untracked raw object')
        status = 'raw_saved' if raw is not None else 'uncertain' if marker is not None else 'not_started'
        statuses[status] += 1
    args.output.mkdir(parents=True, exist_ok=True)
    result = {'batch': args.batch, 'trial_files_verified': len(reuse), 'states': statuses,
              'paid_api_calls': 0, 'r2_writes': 0}
    (args.output / 'audit.json').write_text(json.dumps(result, indent=2))
    print(json.dumps(result))


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        # These validation messages are ours; never print network error bodies or credentials.
        print('Stopped:', str(error) if isinstance(error, ValueError) else type(error).__name__)
        raise SystemExit(1)
