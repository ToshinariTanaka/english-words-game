#!/usr/bin/env python3
"""Generate a fixed additional 500 word pairs; never advance on rerun."""
import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import shutil
import threading
import time

from run_full_audio import (load_plan, connect, run_jobs, request_audio, process,
                            completed, encode, PREFIX, verify_trial, sha)
from run_audio_pilot import (select_jobs as select_pilot, preflight, export_listening,
                             reject_request, MODEL, SHUTDOWN, PLAN_KEY as PILOT_KEY)

COUNT = 1000
WORKERS = 2
TARGET_SHA = '3db196876b6d33135f5d2c724e54ba0043df0cb0803ec5c5eb1a0ee6c2aa3925'
PLAN_KEY = PREFIX + 'fixed-1000-20261014/plan.json'


def select_jobs(plan, trial):
    pilot = select_pilot(plan)
    excluded = {j['asset_id'] for j in trial['jobs'] + pilot}
    jobs = sorted((j for j in plan['jobs'] if j['mode'] == 'word'
                   and j['asset_id'] not in excluded),
                  key=lambda j: (j['question_key'], j['voice'] != 'nova'))[:COUNT]
    pairs = {(j['question_key'], j['voice']) for j in jobs}
    questions = {j['question_key'] for j in jobs}
    if (len(jobs) != COUNT or len(questions) != 500
            or pairs != {(k, v) for k in questions for v in ('nova', 'ash')}
            or any(j['model'] != MODEL or j.get('pronunciation_review') for j in jobs)
            or sha(encode(jobs)) != TARGET_SHA):
        raise ValueError('Fixed 1000-file target changed; review required')
    return jobs, pilot


def verify_prior(store, trial, pilot):
    verify_trial(store, trial)
    expected = {'kind': 'fixed_generation_pilot', 'questions': 10, 'files': 20, 'jobs': pilot}
    data = store.read(PILOT_KEY)
    if data is None or json.loads(data) != expected:
        raise ValueError('Approved 20-file pilot plan is missing or different')
    for job in pilot:
        if completed(store, job) is None:
            raise ValueError('Approved 20-file pilot incomplete; do not regenerate here')


def generate_fixed(store, jobs, root, requester=request_audio, processor=process,
                   deadline=None):
    """Two in-flight files at most. First failure prevents queued files starting."""
    stopped = threading.Event()
    progress_lock = threading.Lock()
    finished = 0

    def one(job):
        nonlocal finished
        if stopped.is_set():
            return
        try:
            if deadline is not None and time.monotonic() >= deadline:
                raise ValueError('Time limit reached; resume this same fixed target')
            # A separate directory prevents workers overwriting summaries/rescue copies.
            run_jobs(store, [job], root / 'progress' / job['asset_id'], 1, requester, processor)
            with progress_lock:
                finished += 1
                if finished % 25 == 0:
                    print(f'Progress: {finished}/{len(jobs)} files ready', flush=True)
        except Exception:
            stopped.set()
            raise

    # The second internal block starts automatically only after the first succeeds.
    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        for start in range(0, len(jobs), 500):
            print(f'Internal block {start // 500 + 1}: starting', flush=True)
            list(pool.map(one, jobs[start:start + 500]))


def execute(store, plan, trial, root, requester=request_audio, processor=process,
            deadline=None):
    jobs, pilot = select_jobs(plan, trial)
    root.mkdir(parents=True, exist_ok=True)
    # Fresh invocation output avoids counting previous local reports on a rerun.
    if (root / 'progress').exists() or (root / 'result.json').exists():
        raise ValueError('Use a fresh local output directory; R2 still supplies resume state')
    result = {'target_files': COUNT, 'questions': 500, 'max_parallel_files': WORKERS,
              'status': 'preflight', 'publication': 'unchanged', 'billing_cost_usd': None}
    try:
        verify_prior(store, trial, pilot)
        # Inspect every target before spending anything, including late uncertain records.
        with ThreadPoolExecutor(max_workers=WORKERS) as pool:
            list(pool.map(lambda job: preflight(store, [job]), jobs))
        manifest = {'kind': 'fixed_1000_word_audio', 'target_sha256': TARGET_SHA, 'jobs': jobs}
        (root / 'plan.json').write_bytes(encode(manifest))
        store.ensure(PLAN_KEY, encode(manifest))
        result['status'] = 'generating'
        generate_fixed(store, jobs, root, requester, processor, deadline)
        # This real second pass has a requester that always rejects paid calls.
        with ThreadPoolExecutor(max_workers=WORKERS) as pool:
            passes = list(pool.map(lambda i: run_jobs(store, jobs[i:i + 500],
                root / 'reuse-check' / str(i), 500, reject_request, processor), (0, 500)))
        if sum(p['requested'] for p in passes) or sum(p['reused'] for p in passes) != COUNT:
            raise ValueError('Zero-call reuse check failed')
        ledger = export_listening(store, jobs, root)
        result.update(status='complete', reuse_check_requests=0, reuse_check_files=COUNT,
                      audio_seconds=sum(e['duration_seconds'] for e in ledger.values()))
        return result
    except Exception:
        result['status'] = 'stopped'
        raise
    finally:
        summaries = [json.loads(p.read_text()) for p in (root / 'progress').glob('*/summary.json')]
        result.update(requested_this_run=sum(s['requested'] for s in summaries),
                      reused_this_run=sum(s['reused'] for s in summaries),
                      completed_this_run=sum(s['completed'] for s in summaries))
        (root / 'result.json').write_text(json.dumps(result, indent=2))
        print(json.dumps(result), flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--generate', action='store_true')
    parser.add_argument('--output', type=Path, default=Path('audio-preparation/fixed-1000'))
    args = parser.parse_args()
    plan, _, _, _, trial = load_plan()
    jobs, _ = select_jobs(plan, trial)
    print(json.dumps({'files': COUNT, 'questions': 500, 'target_sha256': TARGET_SHA,
                      'first_word': jobs[0]['text'], 'last_word': jobs[-1]['text'],
                      'generation_requested': args.generate, 'model': MODEL}))
    if not args.generate:
        print('Offline validation only; no API calls or R2 writes.')
        return
    if datetime.now(timezone.utc).date() >= SHUTDOWN:
        raise ValueError('Reviewed model shutdown date reached; review replacement first')
    if not os.environ.get('OPENAI_API_KEY', '').strip():
        raise ValueError('OPENAI_API_KEY missing')
    if not all(shutil.which(tool) for tool in ('ffmpeg', 'ffprobe')):
        raise ValueError('ffmpeg and ffprobe required before paid requests')
    # Leaves 30 minutes for verification and artifact upload before the workflow timeout.
    execute(connect(), plan, trial, args.output, deadline=time.monotonic() + 150 * 60)


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print('Fixed 1000 stopped:', str(error) if isinstance(error, ValueError) else type(error).__name__)
        print('Saved files remain in R2. Never delete request records; uncertain outcomes require recovery.')
        raise SystemExit(1)
