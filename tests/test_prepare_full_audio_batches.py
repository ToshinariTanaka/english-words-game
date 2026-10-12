import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('batches', ROOT / 'tools/prepare_full_audio_batches.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


class PreparationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.trial = json.loads((ROOT / 'tools/audio-sample-plan.json').read_text())
        jobs = copy.deepcopy(cls.trial['jobs'])
        for mode, count in m.COUNTS.items():
            existing = {j['question_key'] for j in jobs if j['mode'] == mode}
            template = next(j for j in jobs if j['mode'] == mode)
            for n in range(1, count + 100):
                if len(existing) == count:
                    break
                key = m.PREFIXES[mode] + f'{n:06}'
                if key in existing:
                    continue
                existing.add(key)
                for voice in ('nova', 'ash'):
                    j = {**template, 'question_key': key, 'voice': voice,
                         'processing': 'mono-mp3-96k-review-v1'}
                    j['asset_id'] = m.asset_id(j)
                    j['object_key'] = m.object_key(j)
                    jobs.append(j)
        cls.full = {**cls.trial, 'jobs': jobs}

    def test_reuse_and_partition(self):
        plan, batches, reuse, report = m.prepare(self.full, self.trial)
        self.assertEqual((report['total_files'], len(reuse), report['new_files_if_reuse_verified']),
                         (18370, 60, 18310))
        self.assertEqual(len(batches), 37)
        indexed = {j['asset_id']: j for j in plan['jobs']}
        for job in self.trial['jobs']:
            self.assertEqual(indexed[job['asset_id']], job)
        pending = [j for batch in batches for j in batch]
        self.assertFalse(set(reuse) & {j['asset_id'] for j in pending})
        self.assertEqual(len({j['asset_id'] for j in pending}), 18310)
        for batch in batches:
            self.assertLessEqual(len(batch), 500)
            self.assertEqual(len({j['question_key'] for j in batch}) * 2, len(batch))
            self.assertTrue(all(j['processing'] == m.PROCESSING for j in batch))

    def test_changed_source_rejected(self):
        with self.assertRaises(ValueError):
            m.prepare({**self.full, 'source_sha256': 'different'}, self.trial)

    def test_changed_trial_text_rejected(self):
        trial = copy.deepcopy(self.trial)
        for job in trial['jobs'][:2]:
            job['text'] = 'different'
            job['text_sha256'] = hashlib.sha256(b'different').hexdigest()
            job['asset_id'] = m.asset_id(job)
            job['object_key'] = m.object_key(job)
        with self.assertRaisesRegex(ValueError, 'Trial text differs'):
            m.prepare(self.full, trial)

    def test_missing_voice_rejected(self):
        with self.assertRaises(ValueError):
            m.prepare({**self.full, 'jobs': self.full['jobs'][1:]}, self.trial)

    def test_unresolved_pronunciation_rejected(self):
        jobs = list(self.full['jobs'])
        jobs[-1] = {**jobs[-1], 'pronunciation_review': True}
        with self.assertRaisesRegex(ValueError, 'Unresolved'):
            m.prepare({**self.full, 'jobs': jobs}, self.trial)


if __name__ == '__main__':
    unittest.main()
