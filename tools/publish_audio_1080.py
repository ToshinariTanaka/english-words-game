#!/usr/bin/env python3
"""Publish exactly the completed trial + pilot + fixed 1000, without generation."""
import argparse
from concurrent.futures import ThreadPoolExecutor
import csv
import json
from pathlib import Path
import re
import subprocess

from run_full_audio import (load_plan, connect, completed, verify_trial, encode, sha,
                            BUCKET, MAX_BYTES)
from run_audio_1000 import select_jobs, PLAN_KEY, TARGET_SHA
from run_audio_pilot import PLAN_KEY as PILOT_KEY
from publish_audio_trial import MODES, POINTER, BASE

PREVIOUS_RELEASE = 'a01720fabd3cabcaca2e24aea6cd49cf2d57a17d8b7a29660d72441057a4ab81'
TRANSITION = 'backups/audio-publications/fixed-1080/transition.json'


def target():
    plan, _, _, _, trial = load_plan()
    bulk, pilot = select_jobs(plan, trial)
    jobs = trial['jobs'] + pilot + bulk
    if len(jobs) != 1080 or len({j['asset_id'] for j in jobs}) != 1080:
        raise ValueError('Expected exactly 1080 distinct existing assets')
    return jobs, trial, pilot, bulk


def build(jobs, ledger):
    entries = {mode: {} for mode in MODES}
    for job in jobs:
        mode, key, voice = job['mode'], job['question_key'], job['voice']
        if sha(job['text'].encode()) != job['text_sha256']:
            raise ValueError('Text checksum mismatch')
        entry = ledger[job['asset_id']]
        item = entries[mode].setdefault(key, {'text_sha256': job['text_sha256'], 'voices': {}})
        if item['text_sha256'] != job['text_sha256'] or voice in item['voices']:
            raise ValueError('Duplicate voice or conflicting English text')
        item['voices'][voice] = dict(asset_id=job['asset_id'], file_sha256=entry['file_sha256'],
            bytes=entry['bytes'], duration_ms=round(entry['duration_seconds'] * 1000), status='verified')
    if any(set(item['voices']) != {'nova', 'ash'} for group in entries.values() for item in group.values()):
        raise ValueError('Incomplete voice pair')
    release = sha(encode(entries))
    manifests = {mode: dict(schema_version=1, kind='published_audio', mode=mode,
                            release_id=release, entries=entries[mode]) for mode in MODES}
    return release, manifests


def pointer_snapshot(store):
    response = store.client.get_object(Bucket=BUCKET, Key=POINTER)
    body = response['Body']
    try:
        data = body.read(4097)
    finally:
        body.close()
    if len(data) > 4096 or response.get('Metadata', {}).get('sha256') != sha(data):
        raise ValueError('Invalid current pointer')
    value = json.loads(data)
    if set(value) != {'release_id'} or not response.get('ETag'):
        raise ValueError('Pointer requires a release and ETag')
    return data, response['ETag']


def switch(store, expected, destination):
    """Atomic compare-and-swap. Never overwrite a release changed by another writer."""
    data, etag = pointer_snapshot(store)
    current = json.loads(data)['release_id']
    if current == destination:
        return False
    if current != expected:
        raise ValueError('Current release changed; refusing to overwrite')
    saved = f'backups/audio-publications/{destination}/previous-pointer.json'
    store.ensure(saved, data)
    new = encode({'release_id': destination})
    store.client.put_object(Bucket=BUCKET, Key=POINTER, Body=new,
        ContentType='application/json', CacheControl='no-store',
        Metadata={'sha256': sha(new)}, IfMatch=etag)
    if store.read(POINTER) != new:
        raise ValueError('Pointer readback mismatch; inspect before retrying')
    return True


def verify_original(store, trial):
    ledger = verify_trial(store, trial)
    old, old_manifests = build(trial['jobs'], ledger)
    if old != PREVIOUS_RELEASE:
        raise ValueError('Original trial no longer matches the approved release')
    for mode, manifest in old_manifests.items():
        if store.read(f'audio/junior/releases/{old}/{mode}.json') != encode(manifest):
            raise ValueError('Existing trial manifest changed')
    return ledger, old_manifests


def verify_existing(store, jobs, trial, pilot, bulk):
    # Fixed plans must match the completed jobs; there is deliberately no requester.
    expected = [(PILOT_KEY, dict(kind='fixed_generation_pilot', questions=10, files=20, jobs=pilot)),
                (PLAN_KEY, dict(kind='fixed_1000_word_audio', target_sha256=TARGET_SHA, jobs=bulk))]
    for key, value in expected:
        raw = store.read(key)
        if raw is None or json.loads(raw) != value:
            raise ValueError('Stored generation plan is missing or changed')
    ledger, _ = verify_original(store, trial)
    def one(job):
        entry = completed(store, job)
        if entry is None:
            raise ValueError('Generated audio is missing; publication cannot generate it')
        return job['asset_id'], entry
    with ThreadPoolExecutor(max_workers=8) as pool:
        for index, (asset, entry) in enumerate(pool.map(one, pilot + bulk), 1):
            ledger[asset] = entry
            if index % 100 == 0:
                print(f'R2 audio verified: {index + 60}/1080', flush=True)
    return ledger


def export_keys(jobs, root):
    root.mkdir(parents=True, exist_ok=True)
    with (root / 'audio-keys.csv').open('w', encoding='utf-8-sig', newline='') as file:
        fields = ('mode', 'question_key', 'text', 'voice', 'asset_id', 'object_key', 'text_sha256')
        writer = csv.DictWriter(file, fieldnames=fields)
        writer.writeheader()
        writer.writerows({k: job[k] for k in fields} for job in jobs)


def public_read(url):
    # curl uses the same HTTPS endpoint as the app, with normal TLS verification.
    result = subprocess.run(['curl', '--fail', '--silent', '--show-error',
        '--connect-timeout', '10', '--max-time', '45', '--retry', '2',
        '--max-filesize', str(MAX_BYTES), url], capture_output=True, check=True)
    return result.stdout


def smoke(jobs, ledger, manifests, fetch=public_read):
    for mode, manifest in manifests.items():
        expected = json.loads(encode(manifest))
        expected.pop('kind')
        for item in expected['entries'].values():
            for voice in item['voices'].values():
                voice.pop('status')
        if json.loads(fetch(BASE + '/api/audio/manifest?mode=' + mode)) != expected:
            raise ValueError('Public manifest differs from the verified release')
    # First/middle/last pair of every mode plus both ends of each added batch.
    samples = {}
    for mode in MODES:
        group = sorted({j['question_key'] for j in jobs if j['mode'] == mode})
        chosen = {group[0], group[len(group) // 2], group[-1]}
        for job in jobs:
            if job['mode'] == mode and job['question_key'] in chosen:
                samples[job['asset_id']] = job
    for group in (jobs[60:80], jobs[80:]):
        for job in group[:2] + group[-2:]:
            samples[job['asset_id']] = job
    def one(job):
        url = BASE + '/api/audio/file?' + '&'.join((f"mode={job['mode']}",
            f"key={job['question_key']}", f"voice={job['voice']}", f"asset={job['asset_id']}"))
        data = fetch(url)
        entry = ledger[job['asset_id']]
        if len(data) != entry['bytes'] or sha(data) != entry['file_sha256']:
            raise ValueError('Public playback checksum differs')
    with ThreadPoolExecutor(max_workers=4) as pool:
        list(pool.map(one, samples.values()))
    return len(samples)


def execute(store, root, action='publish', check=smoke):
    jobs, trial, pilot, bulk = target()
    export_keys(jobs, root)
    report = dict(status='verifying', paid_api_calls=0, files=1080, questions=540)
    try:
        if action == 'publish-once' and store.read(TRANSITION) is not None:
            # This durable record is written before the first pointer change and is
            # never removed by rollback. Later code/test pushes cannot republish.
            report.update(status='automatic_publication_skipped',
                          reason='A prior publication attempt exists; use explicit publish to resume or republish')
            return report
        if action == 'rollback':
            # Recovery must work even if a newly published MP3 is damaged or missing.
            saved = store.read(TRANSITION)
            transition = json.loads(saved) if saved else {}
            release = transition.get('to', '')
            if (transition.get('from') != PREVIOUS_RELEASE or not re.fullmatch('[a-f0-9]{64}', release)
                    or transition.get('target_sha256') != TARGET_SHA):
                raise ValueError('Verified transition record required for rollback')
            old_ledger, old_manifests = verify_original(store, trial)
            switch(store, release, PREVIOUS_RELEASE)
            report.update(status='rolled_back_delivery_check_pending', active_release_id=PREVIOUS_RELEASE,
                          files=60, questions=30, r2_files_verified=60)
            report['public_audio_samples'] = check(trial['jobs'], old_ledger, old_manifests)
            report['status'] = 'rolled_back'
            return report
        ledger = verify_existing(store, jobs, trial, pilot, bulk)
        release, manifests = build(jobs, ledger)
        report.update(release_id=release, previous_release_id=PREVIOUS_RELEASE, r2_files_verified=1080)
        if {m: len(v['entries']) for m, v in manifests.items()} != dict(word=522, chunk=6, phrase=6, definition=6):
            raise ValueError('Unexpected question counts')
        # Check before any publication metadata write, as well as immediately at CAS.
        current, _ = pointer_snapshot(store)
        if json.loads(current)['release_id'] not in (PREVIOUS_RELEASE, release):
            raise ValueError('Unrecognized current release; no publication writes allowed')
        for mode, manifest in manifests.items():
            data = encode(manifest)
            store.ensure(f'audio/junior/releases/{release}/{mode}.json', data)
            (root / f'{mode}.json').write_bytes(data)
        store.ensure(TRANSITION, encode({'from': PREVIOUS_RELEASE, 'to': release, 'target_sha256': TARGET_SHA}))
        switch(store, PREVIOUS_RELEASE, release)
        report.update(status='published_delivery_check_pending', active_release_id=release)
        (root / 'ledger.json').write_bytes(encode(ledger))
        report['public_audio_samples'] = check(jobs, ledger, manifests)
        report['status'] = 'published_and_verified'
        return report
    finally:
        (root / 'result.json').write_bytes(encode(report))
        print(json.dumps(report), flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--action', choices=('validate', 'publish', 'publish-once', 'rollback'), default='validate')
    parser.add_argument('--output', type=Path, default=Path('audio-preparation/publication-1080'))
    args = parser.parse_args()
    jobs, _, _, _ = target()
    export_keys(jobs, args.output)
    if args.action == 'validate':
        print('Offline: 540 questions / 1080 existing audio files. No generation, no network.')
        return
    execute(connect(), args.output, args.action)


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print('Publication stopped:', str(error) if isinstance(error, ValueError) else type(error).__name__)
        print('No audio is generated. Read result.json for publication state before retrying.')
        raise SystemExit(1)
