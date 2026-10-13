#!/usr/bin/env python3
"""Fixed, resumable completion of the 9185-question catalog approved 2026-10-14."""
import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import re
import shutil
import threading
import time

import publish_audio_1080 as prior
from run_full_audio import (load_plan, connect as basic_connect, Store, encode, sha, keys, completed,
                            run_jobs, request_audio, process, PREFIX, BUCKET)
from run_audio_pilot import preflight, MODEL, SHUTDOWN
from upload_audio_trial import error_code

ROOT = 'backups/audio-all/v1/'
AUTHORIZATION = ROOT + 'authorization.json'
INITIAL_RELEASE = '27c5bdf16774a72c000c4357bf661ef183c183189ab5c4d354d86681d6cfbddf'
TARGET_SHA = 'd519a19ef61343c27484cd730fcd6b858c39a83e662a7ceaa33e87712003ea71'
FULL_SHA = 'd09bc97c9349d22b36919c86c401c713e6ea2071b3a7b1ea79e35744fe66b442'
WORKERS = 4
BATCH_SIZE = 500
BATCH_COUNT = 35


def transient(error):
    return (isinstance(error, (TimeoutError, ConnectionError, OSError))
            or type(error).__name__ in ('EndpointConnectionError', 'ReadTimeoutError',
                'ConnectTimeoutError', 'ConnectionClosedError', 'HTTPClientError')
            or error_code(error) in ('429', '500', '502', '503', '504', 'SlowDown',
                'InternalError', 'ServiceUnavailable', 'RequestTimeout'))


class DurableStore(Store):
    """Retry transient R2 operations only; reconcile conditional writes by checksum."""
    def read(self, key):
        for attempt in range(3):
            try:
                return super().read(key)
            except Exception as error:
                if not transient(error) or attempt == 2:
                    raise
                time.sleep(.5 * (attempt + 1))

    def create(self, key, data, content_type='application/json'):
        uncertain_write = False
        for attempt in range(3):
            try:
                self.client.put_object(Bucket=BUCKET, Key=key, Body=data,
                    ContentType=content_type, Metadata={'sha256': sha(data)}, IfNoneMatch='*')
            except Exception as error:
                if error_code(error) in ('PreconditionFailed', '412'):
                    return uncertain_write and self.read(key) == data
                if not transient(error):
                    raise
                uncertain_write = True
                saved = self.read(key)
                if saved is not None:
                    return saved == data
                if attempt == 2:
                    raise
                time.sleep(.5 * (attempt + 1))
            else:
                if self.read(key) != data:
                    raise ValueError('R2 readback differs')
                return True


def connect():
    return DurableStore(basic_connect().client)


def plan():
    full, _, _, _, _ = load_plan()
    existing, trial, pilot, bulk = prior.target()
    excluded = {job['asset_id'] for job in existing}
    remaining = [job for job in full['jobs'] if job['asset_id'] not in excluded]
    remaining.sort(key=lambda j: (prior.MODES.index(j['mode']), j['question_key'], j['voice'] != 'nova'))
    if (len(remaining) != 17290 or sha(encode(remaining)) != TARGET_SHA
            or len(full['jobs']) != 18370 or sha(encode(full['jobs'])) != FULL_SHA
            or any(j['pronunciation_review'] or j['model'] != MODEL for j in remaining)):
        raise ValueError('Approved complete target changed; review required')
    batches = [remaining[i:i + BATCH_SIZE] for i in range(0, len(remaining), BATCH_SIZE)]
    if len(batches) != BATCH_COUNT:
        raise ValueError('Unexpected batch count')
    return full['jobs'], remaining, batches, (existing, trial, pilot, bulk)


def authorization():
    return dict(kind='approved_full_catalog', approved_date_jst='2026-10-14',
        questions=9185, existing_files=1080, additional_files=17290, full_sha256=FULL_SHA,
        target_sha256=TARGET_SHA, model=MODEL, previous_release=INITIAL_RELEASE)


def model_guard():
    if datetime.now(timezone.utc).date() >= SHUTDOWN:
        raise ValueError('Reviewed model shutdown date reached')


def inventory(store, prefix):
    found, token = set(), None
    while True:
        params = dict(Bucket=BUCKET, Prefix=prefix, MaxKeys=1000)
        if token:
            params['ContinuationToken'] = token
        result = store.client.list_objects_v2(**params)
        found.update(item['Key'] for item in result.get('Contents', []))
        if len(found) > 150000:
            raise ValueError('Unexpected inventory size')
        if not result.get('IsTruncated'):
            return found
        next_token = result.get('NextContinuationToken')
        if not next_token or next_token == token:
            raise ValueError('Invalid inventory pagination')
        token = next_token


def audit_resume(store, remaining):
    # Discover any prior uncertain paid request across ALL batches before new spend.
    # Per-file reads still recheck these conditions before acquiring each request.
    saved = inventory(store, PREFIX)
    audio = inventory(store, 'audio/junior/')
    for job in remaining:
        request, raw, done = keys(job)
        if done in saved:
            continue
        if request in saved and raw not in saved:
            raise ValueError('Uncertain prior request: ' + job['question_key'] + '/' + job['voice'])
        if raw in saved and request not in saved:
            raise ValueError('Untracked raw audio requires recovery')
        if job['object_key'] in audio and raw not in saved:
            raise ValueError('Untracked processed audio requires recovery')


def prepare(store, once=False):
    model_guard()
    _, remaining, _, previous = plan()
    saved = store.read(AUTHORIZATION)
    if saved is not None and saved != encode(authorization()):
        raise ValueError('Stored approval differs')
    if once and saved is not None:
        print('Automatic start skipped: this fixed request has already been started.')
        return False
    ledger = prior.verify_existing(store, *previous)
    release, _ = prior.build(previous[0], ledger)
    current, _ = prior.pointer_snapshot(store)
    if release != INITIAL_RELEASE or json.loads(current)['release_id'] != INITIAL_RELEASE:
        raise ValueError('Expected the verified 1080-file release before generation')
    audit_resume(store, remaining)
    if saved is None and not store.create(AUTHORIZATION, encode(authorization())):
        raise ValueError('Another execution claimed this approval')
    return True


def stop_key(run):
    if not re.fullmatch(r'[0-9]+-[0-9]+', run):
        raise ValueError('Run identity must be GitHub run ID and attempt')
    return ROOT + f'runs/{run}/stop.json'


class Pace:
    """At most one new API request per second per runner, across its four threads."""
    def __init__(self):
        self.lock = threading.Lock()
        self.next = 0

    def wait(self):
        with self.lock:
            now = time.monotonic()
            wait = max(0, self.next - now)
            self.next = max(now, self.next) + 1
        if wait:
            time.sleep(wait)


def generate(store, jobs, root, run, batch, requester=request_audio, processor=process,
             deadline=None, pace=None):
    halt_key = stop_key(run)
    root.mkdir(parents=True, exist_ok=True)
    if (root / 'progress').exists():
        raise ValueError('Use a fresh local output directory; resume data is in R2')
    if store.read(AUTHORIZATION) != encode(authorization()):
        raise ValueError('Full catalog approval record is missing or changed')
    stopped = threading.Event()
    lock = threading.Lock()
    done_count = 0
    report = dict(batch=batch, target_files=len(jobs), status='checking', publication='unchanged')

    def check_stop():
        if stopped.is_set() or store.read(halt_key) is not None:
            raise ValueError('This attempt stopped after an error; inspect reports before resuming')
        if deadline is not None and time.monotonic() >= deadline:
            raise ValueError('Batch time limit reached; rerun failed jobs to resume saved work')

    def request(job):
        if pace:
            pace.wait()
        # run_jobs already owns a request record here. Finish this in-flight
        # operation even if another worker stops, so no empty claim is abandoned.
        # No automatic retry, including network timeouts: avoid duplicate paid audio.
        return requester(job)

    def one(job):
        nonlocal done_count
        if stopped.is_set():
            return
        try:
            check_stop()
            run_jobs(store, [job], root / 'progress' / job['asset_id'], 1, request, processor)
            with lock:
                done_count += 1
                if done_count % 25 == 0:
                    print(f'Batch {batch}: {done_count}/{len(jobs)} audio files ready', flush=True)
        except Exception:
            stopped.set()
            # Global signal stops queued jobs; in-flight requests finish saving safely.
            store.create(halt_key, encode(dict(status='stopped', batch=batch,
                question_key=job['question_key'], voice=job['voice'])))
            raise

    try:
        check_stop()
        with ThreadPoolExecutor(max_workers=WORKERS) as pool:
            list(pool.map(lambda job: preflight(store, [job]), jobs))
        report['status'] = 'generating'
        with ThreadPoolExecutor(max_workers=WORKERS) as pool:
            list(pool.map(one, jobs))
        # run_jobs verifies every completion, including reused bytes. No second full GET pass.
        if done_count != len(jobs):
            raise ValueError('Batch incomplete')
        report['status'] = 'complete'
        return report
    except Exception:
        report['status'] = 'stopped'
        store.create(halt_key, encode(dict(status='stopped', batch=batch)))
        raise
    finally:
        sums = [json.loads(p.read_bytes()) for p in (root / 'progress').glob('*/summary.json')]
        report.update(requested_this_run=sum(s['requested'] for s in sums),
            reused_this_run=sum(s['reused'] for s in sums), completed_this_run=sum(s['completed'] for s in sums))
        (root / 'result.json').write_bytes(encode(report))
        store.ensure(ROOT + f'runs/{run}/batch-{batch:02}.json', encode(report))
        print(json.dumps(report), flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--action', choices=('validate', 'start-once', 'start', 'generate'), default='validate')
    parser.add_argument('--batch', type=int, default=1)
    parser.add_argument('--run', default='0-0')
    parser.add_argument('--output', type=Path, default=Path('audio-preparation/all-9185'))
    args = parser.parse_args()
    full, remaining, batches, _ = plan()
    if not 1 <= args.batch <= len(batches):
        raise ValueError('Invalid fixed batch')
    args.output.mkdir(parents=True, exist_ok=True)
    if args.action == 'validate':
        prior.export_keys(full, args.output)
        print(json.dumps(dict(questions=9185, files=18370, additional_files=len(remaining),
            batches=len(batches), target_sha256=TARGET_SHA, paid_api_calls=0)))
        return
    model_guard()
    if args.action in ('start', 'start-once'):
        active = prepare(connect(), once=args.action == 'start-once')
        if os.environ.get('GITHUB_OUTPUT'):
            with open(os.environ['GITHUB_OUTPUT'], 'a') as f:
                f.write('run=' + str(active).lower() + '\n')
                f.write('matrix=' + json.dumps(list(range(1, BATCH_COUNT + 1))) + '\n')
        return
    if not os.environ.get('OPENAI_API_KEY', '').strip():
        raise ValueError('OPENAI_API_KEY missing')
    if not all(shutil.which(t) for t in ('ffmpeg', 'ffprobe')):
        raise ValueError('Audio processing tools missing')
    generate(connect(), batches[args.batch - 1], args.output, args.run, args.batch,
             deadline=time.monotonic() + 150 * 60, pace=Pace())


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print('Full generation stopped:', str(error) if isinstance(error, ValueError) else type(error).__name__)
        print('Do not delete request records. Saved raw/processed files remain reusable.')
        raise SystemExit(1)
