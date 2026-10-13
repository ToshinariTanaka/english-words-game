#!/usr/bin/env python3
"""Generate only the fixed 10-question/20-file pilot, then verify zero-call reuse."""
import argparse
from datetime import date, datetime, timezone
import json
import os
from pathlib import Path
import shutil

from run_full_audio import (load_plan, connect, run_jobs, request_audio, process, completed,
                            keys, encode, PREFIX, verify_trial, verify_audio)
from run_audio_sample import review_page

TARGETS = dict(zip((f'w{n:06}' for n in range(2, 12)), (
    'aardvark', 'abaft', 'abalone', 'abandon', 'abandoned',
    'abash', 'abashed', 'abate', 'abatement', 'abbreviate')))
MODEL = 'gpt-4o-mini-tts-2025-12-15'
SHUTDOWN = date(2027, 1, 6)
PLAN_KEY = PREFIX + 'pilot-20261013/plan.json'


def select_jobs(plan):
    jobs = [j for j in plan['jobs'] if j['question_key'] in TARGETS]
    pairs = {(j['question_key'], j['voice']) for j in jobs}
    expected = {(key, voice) for key in TARGETS for voice in ('nova', 'ash')}
    if len(jobs) != 20 or pairs != expected:
        raise ValueError('Pilot must contain exactly the fixed 10 voice pairs')
    for job in jobs:
        if (job['text'] != TARGETS[job['question_key']] or job['mode'] != 'word'
                or job['model'] != MODEL or job.get('pronunciation_review')):
            raise ValueError('Pilot text/model/pronunciation changed')
    return sorted(jobs, key=lambda j: (j['question_key'], j['voice'] != 'nova'))


def reject_request(job):
    raise AssertionError('Reuse verification must never call the paid API')


def preflight(store, jobs):
    """Stop on any uncertain prior request before starting any new paid request."""
    for job in jobs:
        if completed(store, job):
            continue
        request_key, raw_key, _ = keys(job)
        marker, raw = store.read(request_key), store.read(raw_key)
        if marker is not None and json.loads(marker).get('asset_id') != job['asset_id']:
            raise ValueError('Prior request record differs')
        if marker is not None and raw is None:
            raise ValueError('Prior request outcome uncertain; manual recovery required')
        if marker is None and (raw is not None or store.read(job['object_key']) is not None):
            raise ValueError('Untracked audio exists; manual recovery required')


def export_listening(store, jobs, root):
    (root / 'mp3').mkdir(parents=True, exist_ok=True)
    ledger = {}
    for job in jobs:
        entry = completed(store, job)
        if entry is None:
            raise ValueError('Pilot incomplete')
        data = store.read(job['object_key'])
        verify_audio(data, entry)
        (root / 'mp3' / (job['asset_id'] + '.mp3')).write_bytes(data)
        ledger[job['asset_id']] = entry
    review_page(root, jobs, ledger)
    (root / 'ledger.json').write_text(json.dumps(ledger, indent=2))
    return ledger


def execute(store, trial, jobs, root, requester=request_audio, processor=process):
    # Test injection cannot change which questions the production entry point permits.
    jobs = select_jobs({'jobs': jobs})
    verify_trial(store, trial)
    preflight(store, jobs)
    root.mkdir(parents=True, exist_ok=True)
    plan = {'kind': 'fixed_generation_pilot', 'questions': 10, 'files': 20, 'jobs': jobs}
    (root / 'plan.json').write_bytes(encode(plan))
    store.ensure(PLAN_KEY, encode(plan))
    first = run_jobs(store, jobs, root, 20, requester, processor)
    # A second full pass proves completed files can be reused without another API call.
    again = run_jobs(store, jobs, root / 'reuse-check', 20, reject_request, processor)
    if again['requested'] != 0 or again['reused'] != 20:
        raise ValueError('Zero-call reuse check failed')
    ledger = export_listening(store, jobs, root)
    result = {'target_files': 20, 'requested_this_run': first['requested'],
              'reused_this_run': first['reused'], 'reuse_check_requests': again['requested'],
              'reuse_check_files': again['reused'],
              'audio_seconds': sum(e['duration_seconds'] for e in ledger.values()),
              'billing_cost_usd': None, 'billing_note': 'Read actual cost in OpenAI Usage; duration is not an invoice.',
              'publication': 'unchanged'}
    (root / 'result.json').write_text(json.dumps(result, indent=2))
    print(json.dumps(result))
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--generate', action='store_true')
    parser.add_argument('--output', type=Path, default=Path('audio-preparation/pilot-20'))
    args = parser.parse_args()
    plan, _, _, _, trial = load_plan()
    jobs = select_jobs(plan)
    print(json.dumps({'questions': list(TARGETS.values()), 'files': len(jobs),
                      'model': MODEL, 'generation_requested': args.generate}))
    if not args.generate:
        print('Offline validation only; no API calls or R2 writes.')
        return
    if datetime.now(timezone.utc).date() >= SHUTDOWN:
        raise ValueError('Reviewed model shutdown date reached; review a replacement before generation')
    if not os.environ.get('OPENAI_API_KEY', '').strip():
        raise ValueError('OPENAI_API_KEY missing')
    if not all(shutil.which(tool) for tool in ('ffmpeg', 'ffprobe')):
        raise ValueError('ffmpeg and ffprobe are required before starting paid requests')
    execute(connect(), trial, jobs, args.output)


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print('Pilot stopped:', str(error) if isinstance(error, ValueError) else type(error).__name__)
        print('Do not delete request records or retry uncertain API outcomes. Local rescue audio is saved when available.')
        raise SystemExit(1)
