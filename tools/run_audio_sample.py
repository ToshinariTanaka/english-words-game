#!/usr/bin/env python3
"""Generate the reviewed 60-job trial. No automatic retries or publication."""
import argparse
import hashlib
import html
import json
import os
from pathlib import Path
import re
import subprocess
import urllib.request


def save(path, value):
    temporary = path.with_suffix(path.suffix + '.tmp')
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding='utf-8')
    temporary.replace(path)


def validate(plan):
    jobs = plan['jobs']
    if len(jobs) != 60 or len({j['question_key'] for j in jobs}) != 30:
        raise ValueError('This runner only accepts the 30-question, 60-file trial.')
    seen = set()
    for j in jobs:
        if j.get('pronunciation_review'):
            raise ValueError('Resolve pronunciation guidance before generation')
        pair = (j['question_key'], j['voice'])
        if pair in seen or j['voice'] not in ('nova', 'ash'):
            raise ValueError('Invalid voice or duplicate job')
        seen.add(pair)
        if not re.fullmatch('[0-9a-f]{64}', j['asset_id']):
            raise ValueError('Invalid asset ID')
        if not 0 < len(j['text']) <= 4096:
            raise ValueError('Invalid input length')
        if hashlib.sha256(j['text'].encode()).hexdigest() != j['text_sha256']:
            raise ValueError('Text hash mismatch')
        if j['model'] != 'gpt-4o-mini-tts-2025-12-15':
            raise ValueError('Model must be reviewed before changing')
    if sum(len(j['text']) for j in jobs) > 4000:
        raise ValueError('Trial input limit exceeded')
    return jobs


def process(raw, target):
    # Preserve raw MP3; constrain gain to avoid excessive amplification of short words.
    measured = subprocess.run(['ffmpeg', '-hide_banner', '-i', str(raw), '-af',
                              'volumedetect', '-f', 'null', '-'], capture_output=True, text=True, check=True)
    mean = re.search(r'mean_volume: (-?[\d.]+) dB', measured.stderr)
    peak = re.search(r'max_volume: (-?[\d.]+) dB', measured.stderr)
    if not mean or not peak:
        raise ValueError('Silent or invalid source audio')
    gain = min(12.0, -20.0 - float(mean[1]), -1.5 - float(peak[1]))
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(raw), '-af', f'volume={gain}dB',
                    '-ac', '1', '-ar', '44100', '-codec:a', 'libmp3lame', '-b:a', '96k', str(target)], check=True)
    duration = float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries',
                     'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', str(target)], text=True))
    if not 0.1 <= duration <= 120:
        raise ValueError('Audio duration needs manual investigation')
    return {'duration_seconds': duration, 'gain_db': gain,
            'bytes': target.stat().st_size, 'file_sha256': hashlib.sha256(target.read_bytes()).hexdigest()}


def review_page(root, jobs, ledger):
    rows = []
    for j in jobs:
        entry = ledger.get(j['asset_id'], {})
        control = f'<audio controls preload="none" src="mp3/{j["asset_id"]}.mp3"></audio>' if entry.get('status') == 'generated' else html.escape(entry.get('status', 'not started'))
        rows.append('<tr><td>' + html.escape(j['mode'] + ' / ' + j['question_key']) + '</td><td>' +
                    html.escape(j['text']) + '</td><td>' + j['voice'] + '</td><td>' + control + '</td></tr>')
    (root / 'listen.html').write_text('<!doctype html><meta charset="utf-8"><title>Nova / Ash 試聴</title>'
        '<style>body{font:18px sans-serif;margin:24px}td{padding:12px;border-bottom:1px solid #ccc}audio{width:280px}</style>'
        '<h1>Nova / Ash 音声試作</h1><p>AIで生成した音声です。発音・速さ・音量・語頭と語尾を確認してください。</p>'
        '<table>' + ''.join(rows) + '</table>', encoding='utf-8')


def run(plan, root, generate=False, opener=urllib.request.urlopen):
    jobs = validate(plan)
    root.mkdir(parents=True, exist_ok=True)
    for name in ('raw', 'mp3'):
        (root / name).mkdir(exist_ok=True)
    digest = hashlib.sha256(json.dumps(plan, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
    state_path = root / 'state.json'
    state = json.loads(state_path.read_text()) if state_path.exists() else {'plan_sha256': digest, 'entries': {}}
    if state['plan_sha256'] != digest:
        raise ValueError('Resume plan differs from saved plan')
    save(root / 'plan.json', plan)
    ledger = state['entries']
    try:
        for j in jobs:
            asset = j['asset_id']
            raw, target = root / 'raw' / (asset + '.mp3'), root / 'mp3' / (asset + '.mp3')
            entry = ledger.get(asset, {})
            if entry.get('status') == 'generated':
                if not target.exists() or hashlib.sha256(target.read_bytes()).hexdigest() != entry['file_sha256']:
                    raise ValueError('Saved output missing or changed; restore original artifact')
                continue
            if not raw.exists():
                if entry:
                    raise ValueError('Previous request outcome uncertain; do not retry automatically')
                if not generate:
                    continue
                key = os.environ.get('OPENAI_API_KEY')
                if not key:
                    raise ValueError('OPENAI_API_KEY is required')
                ledger[asset] = {'status': 'request_started'}
                save(state_path, state)
                payload = {k: j[k] for k in ('model', 'voice', 'instructions')}
                payload.update(input=j['text'], response_format='mp3')
                request = urllib.request.Request('https://api.openai.com/v1/audio/speech',
                    data=json.dumps(payload).encode(), headers={'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json'})
                with opener(request, timeout=120) as response:
                    data = response.read(10_000_001)
                    request_id = response.headers.get('x-request-id')
                if not data or len(data) > 10_000_000:
                    raise ValueError('Unexpected audio response size')
                temporary = raw.with_suffix('.tmp')
                temporary.write_bytes(data)
                temporary.replace(raw)
                ledger[asset] = {'status': 'raw_saved', 'request_id': request_id}
                save(state_path, state)
            details = process(raw, target)
            ledger[asset] = {**ledger.get(asset, {}), **details, 'status': 'generated', 'listening_review': 'pending'}
            save(state_path, state)
            print('Generated', j['question_key'], j['voice'], flush=True)
    finally:
        save(state_path, state)
        review_page(root, jobs, ledger)
        save(root / 'summary.json', {'planned': len(jobs), 'generated': sum(e.get('status') == 'generated' for e in ledger.values()),
            'audio_seconds': sum(e.get('duration_seconds', 0) for e in ledger.values()),
            'billing_cost_usd': None, 'billing_note': 'Check OpenAI Usage filtered to up-words-audio; audio duration is not an invoice.',
            'publication': 'not published'})


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--plan', type=Path, default=Path('tools/audio-sample-plan.json'))
    parser.add_argument('--output', type=Path, default=Path('audio-preparation/trial'))
    parser.add_argument('--generate', action='store_true')
    args = parser.parse_args()
    try:
        run(json.loads(args.plan.read_text(encoding='utf-8')), args.output, args.generate)
    except Exception as error:
        # Never print response bodies, request headers or secret values.
        print('Stopped safely:', type(error).__name__)
        raise SystemExit(1)
