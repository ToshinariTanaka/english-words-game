#!/usr/bin/env python3
"""Publish all verified 18370 assets, or restore the known 1080-file release."""
import argparse
from concurrent.futures import ThreadPoolExecutor
import json
from pathlib import Path
import re

import publish_audio_1080 as prior
import run_audio_all as all_audio
from run_full_audio import completed, encode
from run_audio_all import connect

TRANSITION = all_audio.ROOT + 'publication.json'
MAX_MANIFEST = 8 * 1024 * 1024


def existing_ledger(store, previous):
    ledger = prior.verify_existing(store, *previous)
    release, manifests = prior.build(previous[0], ledger)
    if release != all_audio.INITIAL_RELEASE:
        raise ValueError('Existing 1080-file release differs')
    for mode, manifest in manifests.items():
        if store.read(f'audio/junior/releases/{release}/{mode}.json') != encode(manifest):
            raise ValueError('Original 1080-file manifest is missing or changed')
    return ledger, manifests


def publish(store, root, rollback=False, check=prior.smoke):
    jobs, remaining, _, previous = all_audio.plan()
    root.mkdir(parents=True, exist_ok=True)
    prior.export_keys(jobs, root)
    result = dict(status='verifying', paid_api_calls=0, questions=9185, files=18370)
    try:
        if store.read(all_audio.AUTHORIZATION) != encode(all_audio.authorization()):
            raise ValueError('Full catalog approval is missing or changed')
        ledger, old_manifests = existing_ledger(store, previous)
        if rollback:
            raw = store.read(TRANSITION)
            change = json.loads(raw) if raw else {}
            release = change.get('to', '')
            if (change.get('from') != all_audio.INITIAL_RELEASE or change.get('target_sha256') != all_audio.TARGET_SHA
                    or not re.fullmatch('[a-f0-9]{64}', release)):
                raise ValueError('Valid full publication record required')
            result['status'] = 'rollback_switch_pending'
            prior.switch(store, release, all_audio.INITIAL_RELEASE)
            result.update(status='rolled_back_delivery_check_pending', active_release_id=all_audio.INITIAL_RELEASE,
                          questions=540, files=1080)
            result['public_audio_samples'] = check(previous[0], ledger, old_manifests)
            result['status'] = 'rolled_back'
            return result
        def one(job):
            entry = completed(store, job)
            if entry is None:
                raise ValueError('Incomplete full catalog; no publication')
            return job['asset_id'], entry
        with ThreadPoolExecutor(max_workers=8) as pool:
            for n, (asset, entry) in enumerate(pool.map(one, remaining), 1):
                ledger[asset] = entry
                if n % 500 == 0:
                    print(f'Publication verification: {n + 1080}/18370 files', flush=True)
        release, manifests = prior.build(jobs, ledger)
        if {m: len(v['entries']) for m, v in manifests.items()} != dict(word=7489, chunk=856, phrase=441, definition=399):
            raise ValueError('Full manifest counts differ')
        for mode, old in old_manifests.items():
            if any(manifests[mode]['entries'].get(key) != item for key, item in old['entries'].items()):
                raise ValueError('Existing published audio changed')
        result.update(release_id=release, r2_files_verified=len(ledger))
        current, _ = prior.pointer_snapshot(store)
        if json.loads(current)['release_id'] not in (all_audio.INITIAL_RELEASE, release):
            raise ValueError('Another release is active; refusing to replace it')
        data = {mode: encode(manifest) for mode, manifest in manifests.items()}
        if any(len(value) > MAX_MANIFEST for value in data.values()):
            raise ValueError('App manifest size limit exceeded')
        for mode, value in data.items():
            store.ensure(f'audio/junior/releases/{release}/{mode}.json', value)
            (root / (mode + '.json')).write_bytes(value)
        store.ensure(TRANSITION, encode(dict(to=release, target_sha256=all_audio.TARGET_SHA,
                                             **{'from': all_audio.INITIAL_RELEASE})))
        result['status'] = 'publication_switch_pending'
        prior.switch(store, all_audio.INITIAL_RELEASE, release)
        result.update(status='published_delivery_check_pending', active_release_id=release)
        result['public_audio_samples'] = check(jobs, ledger, manifests)
        result['status'] = 'published_and_verified'
        return result
    finally:
        (root / 'result.json').write_bytes(encode(result))
        print(json.dumps(result), flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--rollback', action='store_true')
    parser.add_argument('--output', type=Path, default=Path('audio-preparation/all-publication'))
    args = parser.parse_args()
    publish(connect(), args.output, args.rollback)


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print('Full publication stopped:', str(error) if isinstance(error, ValueError) else type(error).__name__)
        print('Check result.json: publication may already have occurred. No audio is generated here.')
        raise SystemExit(1)
