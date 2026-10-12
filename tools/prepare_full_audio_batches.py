#!/usr/bin/env python3
"""Offline preparation only: reconcile the full plan with the approved trial."""
import argparse
import hashlib
import json
from collections import Counter
from pathlib import Path
import re

RECIPE_FIELDS = ('mode', 'question_key', 'text_sha256', 'voice', 'model',
                 'instructions', 'profile', 'processing')
PROCESSING = 'mono-mp3-96k-mean20-peak1p5-gain12-v1'
COUNTS = {'word': 7489, 'chunk': 856, 'phrase': 441, 'definition': 399}
PREFIXES = dict(zip(COUNTS, ('w', 'c', 'p', 's')))


def asset_id(job):
    recipe = {key: job[key] for key in RECIPE_FIELDS}
    return hashlib.sha256(json.dumps(recipe, ensure_ascii=False, sort_keys=True,
                                     separators=(',', ':')).encode()).hexdigest()


def object_key(job):
    return f"audio/junior/{job['voice']}/{job['mode']}/{job['question_key']}/{job['asset_id']}.mp3"


def validate_jobs(plan):
    result = {}
    for job in plan['jobs']:
        mode, key, voice = job['mode'], job['question_key'], job['voice']
        pair = (key, voice)
        if mode not in PREFIXES or not re.fullmatch(PREFIXES[mode] + r'\d{6}', key):
            raise ValueError('Invalid mode or question key')
        if voice not in ('nova', 'ash') or pair in result:
            raise ValueError('Duplicate job or invalid voice')
        if not 0 < len(job['text']) <= 4096:
            raise ValueError('Invalid text length')
        if hashlib.sha256(job['text'].encode()).hexdigest() != job['text_sha256']:
            raise ValueError('Text hash mismatch')
        if asset_id(job) != job['asset_id'] or object_key(job) != job['object_key']:
            raise ValueError('Recipe identity mismatch')
        result[pair] = job
    for (key, voice), job in result.items():
        other = result.get((key, 'ash' if voice == 'nova' else 'nova'))
        if not other or any(job[field] != other[field] for field in
                            ('mode', 'text', 'text_sha256', 'instructions', 'model', 'profile', 'processing')):
            raise ValueError('Voice pair missing or inconsistent')
    return result


def prepare(full, trial, batch_questions=250):
    if not 1 <= batch_questions <= 250:
        raise ValueError('Batch size must be 1..250 questions')
    if full['source_sha256'] != trial['source_sha256']:
        raise ValueError('Trial and full source differ')
    original, approved = validate_jobs(full), validate_jobs(trial)
    counts = Counter(j['mode'] for j in original.values() if j['voice'] == 'nova')
    if dict(counts) != COUNTS or len(approved) != 60:
        raise ValueError('Unexpected catalog or trial size')
    if not set(approved).issubset(original):
        raise ValueError('Trial question missing from catalog')
    configs = {(j['model'], j['profile'], j['processing']) for j in approved.values()}
    if len(configs) != 1 or next(iter(configs))[2] != PROCESSING:
        raise ValueError('Unexpected trial processing configuration')
    model, profile, _ = next(iter(configs))
    jobs, candidates, pending = [], [], []
    for pair, old in original.items():
        if (old['model'], old['profile']) != (model, profile):
            raise ValueError('Model/profile changed; review required')
        job = dict(old)
        if pair in approved:
            existing = approved[pair]
            if any(existing[k] != old[k] for k in ('mode', 'text', 'text_sha256')):
                raise ValueError('Trial text differs from catalog')
            job = dict(existing)
            candidates.append(job['asset_id'])
        else:
            job['processing'] = PROCESSING
            job['asset_id'] = asset_id(job)
            job['object_key'] = object_key(job)
        if job.get('pronunciation_review'):
            raise ValueError('Unresolved flagged pronunciation')
        job['status'] = 'planned'
        jobs.append(job)
        if pair not in approved:
            pending.append(job)
    # Keep both voices together; never split a question between batches.
    pending.sort(key=lambda j: (list(COUNTS).index(j['mode']), j['question_key'], j['voice']))
    batches = [pending[i:i + batch_questions * 2]
               for i in range(0, len(pending), batch_questions * 2)]
    plan = {**full, 'jobs': jobs, 'question_count': len(jobs) // 2,
            'job_count': len(jobs), 'requires_model_and_budget_check': True}
    report = {'questions': len(jobs) // 2, 'total_files': len(jobs),
              'trial_reuse_candidates': len(candidates), 'new_files_if_reuse_verified': len(pending),
              'batches': len(batches), 'max_files_per_batch': batch_questions * 2,
              'new_input_characters': sum(len(j['text']) for j in pending),
              'paid_api_calls': 0, 'published': False,
              'reuse_note': 'Verify all 60 existing R2 objects against the original trial ledger before excluding them from generation.',
              'execution_note': 'This is a plan, not a generation runner. No API or upload is performed.',
              'review_note': 'Existing flagged pronunciations resolved by the trial; this is not a full linguistic audit.',
              'requires_model_and_budget_check': True}
    return plan, batches, candidates, report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--full-plan', type=Path, required=True)
    parser.add_argument('--trial-plan', type=Path, default=Path('tools/audio-sample-plan.json'))
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    plan, batches, candidates, report = prepare(json.loads(args.full_plan.read_text()),
                                                json.loads(args.trial_plan.read_text()))
    # Refuse mixed/stale output from an earlier plan.
    args.output.mkdir(parents=True, exist_ok=False)
    files = {'generation-plan.json': plan, 'reuse-candidates.json': candidates, 'summary.json': report}
    for index, jobs in enumerate(batches, 1):
        files[f'batch-{index:03}.json'] = {'schema_version': 1, 'kind': 'generation_batch',
            'source_sha256': plan['source_sha256'], 'requires_model_and_budget_check': True,
            'job_count': len(jobs), 'jobs': jobs}
    for name, data in files.items():
        (args.output / name).write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
