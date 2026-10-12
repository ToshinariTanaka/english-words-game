#!/usr/bin/env python3
"""Publish the approved trial only, after checking every R2 playback object."""
import argparse
import json
import os
from pathlib import Path
import urllib.request
from upload_audio_trial import ACCOUNT, BUCKET, prepare, sha, transfer, verify_response, error_code

MODES = ('word', 'chunk', 'phrase', 'definition')
POINTER = 'audio/junior/current.json'
BASE = 'https://up-junior-words-preview.pages.dev'


def encode(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode()


def build(root, plan):
    objects = prepare(root, plan)
    state = json.loads((root / 'state.json').read_text())
    entries = {mode: {} for mode in MODES}
    for job in plan['jobs']:
        mode, key = job['mode'], job['question_key']
        if not key.startswith(dict(word='w', chunk='c', phrase='p', definition='s')[mode]):
            raise ValueError('Mode/key mismatch')
        if sha(job['text'].encode()) != job['text_sha256']:
            raise ValueError('Text checksum mismatch')
        item = entries[mode].setdefault(key, {'text_sha256': job['text_sha256'], 'voices': {}})
        if item['text_sha256'] != job['text_sha256']:
            raise ValueError('Voice text mismatch')
        entry = state['entries'][job['asset_id']]
        item['voices'][job['voice']] = dict(asset_id=job['asset_id'],
            file_sha256=entry['file_sha256'], bytes=entry['bytes'],
            duration_ms=round(entry['duration_seconds'] * 1000), status='verified')
    if sum(len(v) for v in entries.values()) != 30 or any(
            set(item['voices']) != {'nova', 'ash'} for group in entries.values() for item in group.values()):
        raise ValueError('Expected 30 complete voice pairs')
    release = sha(encode(entries))
    manifests = [(f'audio/junior/releases/{release}/{mode}.json', encode(dict(
        schema_version=1, kind='published_audio', mode=mode, release_id=release,
        entries=entries[mode])), 'application/json') for mode in MODES]
    return [o for o in objects if o[0].startswith('audio/junior/')], manifests, encode({'release_id': release})


def publish(client, audio, manifests, pointer, report_dir):
    # Initial publication only. Never replace another release, even on a rerun.
    try:
        existing = client.get_object(Bucket=BUCKET, Key=POINTER)
    except Exception as error:
        if error_code(error) not in ('NoSuchKey', '404'):
            raise
    else:
        verify_response(existing, pointer)
    # Missing/corrupt audio aborts before writing any publication metadata.
    for key, data, _ in audio:
        verify_response(client.get_object(Bucket=BUCKET, Key=key), data)
    transfer(client, manifests, report_dir / 'manifests.json')
    # transfer uses IfNoneMatch:*, so a concurrent publication cannot be overwritten.
    transfer(client, [(POINTER, pointer, 'application/json')], report_dir / 'pointer.json')


def smoke(audio, manifests):
    for key, data, _ in manifests:
        expected = json.loads(data)
        with urllib.request.urlopen(BASE + '/api/audio/manifest?mode=' + expected['mode'], timeout=30) as response:
            actual = json.load(response)
        # The public API deliberately omits internal status/kind fields.
        for item in expected['entries'].values():
            for voice in item['voices'].values():
                voice.pop('status')
        expected.pop('kind')
        if actual != expected:
            raise ValueError('Published manifest mismatch')
    for key, data, _ in audio:
        _, _, voice, mode, question, filename = key.split('/')
        url = BASE + f'/api/audio/file?mode={mode}&key={question}&voice={voice}&asset={filename[:-4]}'
        with urllib.request.urlopen(url, timeout=30) as response:
            if response.read(len(data) + 1) != data:
                raise ValueError('Public playback bytes mismatch')
    print('Verified 4 public manifests and all 60 playback files through the app.')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--publish', action='store_true')
    parser.add_argument('--source', type=Path, default=Path('audio-preparation/trial'))
    args = parser.parse_args()
    plan = json.loads(Path('tools/audio-sample-plan.json').read_text())
    audio, manifests, pointer = build(args.source, plan)
    print('Validated 30 questions, 60 audio files and 4 manifests.')
    if not args.publish:
        print('Validation only; no network or publication.')
        return
    if os.environ.get('R2_ACCOUNT_ID', '').strip() != ACCOUNT:
        raise ValueError('Unexpected R2 account')
    import boto3
    from botocore.config import Config
    client = boto3.client('s3', endpoint_url=f'https://{ACCOUNT}.r2.cloudflarestorage.com', region_name='auto',
        aws_access_key_id=os.environ['R2_ACCESS_KEY_ID'].strip(),
        aws_secret_access_key=os.environ['R2_SECRET_ACCESS_KEY'].strip(),
        config=Config(signature_version='s3v4', retries={'mode': 'standard', 'max_attempts': 2},
            connect_timeout=10, read_timeout=60, request_checksum_calculation='when_required',
            response_checksum_validation='when_required'))
    publish(client, audio, manifests, pointer, Path('audio-preparation/publication-report'))
    print('Published the trial pointer. Checking delivery through the app next.')
    smoke(audio, manifests)


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print('Publication/check stopped:', type(error).__name__)
        print('If the pointer was already published, it remains published. Rerunning rechecks the same release; no audio is generated.')
        raise SystemExit(1)
