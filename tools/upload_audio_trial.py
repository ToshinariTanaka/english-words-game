#!/usr/bin/env python3
"""Copy the approved trial to private R2. No OpenAI calls or playback publication."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re

BUCKET = 'up-words-audio'
SOURCE_RUN = '38191239119'
ACCOUNT = '2ce273613ba26f65be237a2dd5c07685'


def sha(data):
    return hashlib.sha256(data).hexdigest()


def plan_hash(plan):
    return sha(json.dumps(plan, sort_keys=True, ensure_ascii=False).encode())


def read_file(root, relative):
    path = root / relative
    if path.is_symlink() or not path.resolve().is_relative_to(root.resolve()):
        raise ValueError('Unsafe artifact path')
    data = path.read_bytes()
    if not 0 < len(data) <= 10_000_000:
        raise ValueError('Unexpected artifact size')
    return data


def prepare(root, expected):
    plan_bytes = read_file(root, 'plan.json')
    plan = json.loads(plan_bytes)
    if plan != expected:
        raise ValueError('Artifact plan does not match the approved trial')
    state_bytes = read_file(root, 'state.json')
    state = json.loads(state_bytes)
    if state['plan_sha256'] != plan_hash(plan):
        raise ValueError('Ledger and plan do not match')
    jobs = plan['jobs']
    if len(jobs) != 60 or len({(j['question_key'], j['voice']) for j in jobs}) != 60:
        raise ValueError('Expected 60 distinct trial jobs')
    result = []
    prefix = f'backups/audio-trials/{SOURCE_RUN}/'
    for job in jobs:
        asset = job['asset_id']
        if not re.fullmatch('[0-9a-f]{64}', asset):
            raise ValueError('Invalid asset ID')
        key = f"audio/junior/{job['voice']}/{job['mode']}/{job['question_key']}/{asset}.mp3"
        if key != job['object_key'] or not re.fullmatch(r'audio/junior/(nova|ash)/(word|chunk|phrase|definition)/[wcps][0-9]{6}/[a-f0-9]{64}\.mp3', key):
            raise ValueError('Invalid destination path')
        entry = state['entries'][asset]
        data = read_file(root, 'mp3/' + asset + '.mp3')
        if entry['status'] != 'generated' or entry['bytes'] != len(data) or entry['file_sha256'] != sha(data):
            raise ValueError('MP3 does not match generation ledger')
        if not 0.1 <= entry['duration_seconds'] <= 120:
            raise ValueError('Invalid audio duration')
        result.append((key, data, 'audio/mpeg'))
        result.append((prefix + 'raw/' + asset + '.mp3', read_file(root, 'raw/' + asset + '.mp3'), 'audio/mpeg'))
    summary_bytes = read_file(root, 'summary.json')
    if json.loads(summary_bytes)['generated'] != 60:
        raise ValueError('Incomplete trial')
    result.extend([(prefix + 'plan.json', plan_bytes, 'application/json'),
                   (prefix + 'state.json', state_bytes, 'application/json'),
                   (prefix + 'summary.json', summary_bytes, 'application/json')])
    return result


def error_code(error):
    return str(getattr(error, 'response', {}).get('Error', {}).get('Code', ''))


def verify_response(response, data):
    body = response['Body']
    try:
        received = body.read(len(data) + 1)
    finally:
        body.close()
    if received != data or response.get('Metadata', {}).get('sha256') != sha(data):
        raise ValueError('R2 file or checksum metadata mismatch')


def transfer(client, objects, report_path):
    report = {'source_run': SOURCE_RUN, 'bucket': BUCKET, 'publication': 'not published', 'objects': []}
    try:
        for key, data, content_type in objects:
            try:
                remote = client.get_object(Bucket=BUCKET, Key=key)
            except Exception as error:
                if error_code(error) not in ('NoSuchKey', '404'):
                    raise
                # Conditional creation also protects against another writer racing this job.
                try:
                    client.put_object(Bucket=BUCKET, Key=key, Body=data, ContentType=content_type,
                                      Metadata={'sha256': sha(data)}, IfNoneMatch='*')
                    action = 'uploaded'
                except Exception as collision:
                    if error_code(collision) not in ('PreconditionFailed', '412'):
                        raise
                    action = 'already present'
                remote = client.get_object(Bucket=BUCKET, Key=key)
            else:
                action = 'already present'
            verify_response(remote, data)
            report['objects'].append({'key': key, 'sha256': sha(data), 'bytes': len(data), 'status': action})
        report['complete'] = True
    finally:
        report['verified_objects'] = len(report['objects'])
        report_path.parent.mkdir(parents=True, exist_ok=True)
        report_path.write_text(json.dumps(report, indent=2), encoding='utf-8')
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, default=Path('audio-preparation/trial'))
    parser.add_argument('--upload', action='store_true')
    args = parser.parse_args()
    expected = json.loads(Path('tools/audio-sample-plan.json').read_text(encoding='utf-8'))
    objects = prepare(args.source, expected)
    print(f'Validated 60 MP3 + 60 originals + 3 records ({len(objects)} objects).')
    if not args.upload:
        print('Validation only: no R2 writes.')
        return
    if os.environ.get('R2_ACCOUNT_ID', '').strip() != ACCOUNT:
        raise ValueError('Unexpected R2 account')
    import boto3
    from botocore.config import Config
    client = boto3.client('s3', endpoint_url=f'https://{ACCOUNT}.r2.cloudflarestorage.com', region_name='auto',
        aws_access_key_id=os.environ['R2_ACCESS_KEY_ID'].strip(),
        aws_secret_access_key=os.environ['R2_SECRET_ACCESS_KEY'].strip(),
        config=Config(signature_version='s3v4', retries={'mode': 'standard', 'max_attempts': 2},
                      connect_timeout=10, read_timeout=60,
                      request_checksum_calculation='when_required', response_checksum_validation='when_required'))
    report = transfer(client, objects, Path('audio-preparation/r2-report.json'))
    print(f"Verified {report['verified_objects']} objects in R2. Playback publication is a separate step.")


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        # Do not expose request headers, response bodies or credentials.
        print('Upload stopped:', type(error).__name__)
        raise SystemExit(1)
