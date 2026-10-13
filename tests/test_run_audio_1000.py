import contextlib
import copy
import io
import json
from pathlib import Path
import sys
import tempfile
import threading
import time
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tools'))
import run_audio_1000 as b
import run_full_audio as f
import run_audio_pilot as p
from test_run_full_audio import FakeR2, process


class BulkTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.plan, _, _, _, cls.trial = f.load_plan()
        cls.jobs, cls.pilot = b.select_jobs(cls.plan, cls.trial)

    def setUp(self):
        self.store = f.Store(FakeR2())
        self.calls = []
        self.lock = threading.Lock()

    def request(self, job):
        with self.lock:
            self.calls.append(job['asset_id'])
        return b'raw-' + job['asset_id'].encode()

    def seed_prior(self):
        entries = {}
        for job in self.trial['jobs']:
            data = b'trial-' + job['asset_id'].encode()
            self.store.ensure(job['object_key'], data, 'audio/mpeg')
            entries[job['asset_id']] = dict(status='generated', bytes=len(data),
                file_sha256=f.sha(data), duration_seconds=1.0)
        prefix = f'backups/audio-trials/{f.SOURCE_RUN}/'
        self.store.ensure(prefix + 'plan.json', f.encode(self.trial))
        self.store.ensure(prefix + 'state.json', f.encode(dict(plan_sha256=f.plan_hash(self.trial), entries=entries)))
        with tempfile.TemporaryDirectory() as d:
            f.run_jobs(self.store, self.pilot, Path(d), 20, lambda j: b'pilot', process)
        manifest = dict(kind='fixed_generation_pilot', questions=10, files=20, jobs=self.pilot)
        self.store.ensure(p.PLAN_KEY, f.encode(manifest))

    def test_exact_target_excludes_existing_eighty_and_locks_recipe(self):
        self.assertEqual(len(self.jobs), 1000)
        self.assertEqual(len({j['question_key'] for j in self.jobs}), 500)
        self.assertFalse({j['asset_id'] for j in self.jobs} &
                         {j['asset_id'] for j in self.trial['jobs'] + self.pilot})
        for field in ('text', 'instructions', 'model', 'object_key'):
            changed = copy.deepcopy(self.plan)
            next(j for j in changed['jobs'] if j['asset_id'] == self.jobs[0]['asset_id'])[field] = 'changed'
            with self.assertRaises(ValueError):
                b.select_jobs(changed, self.trial)

    def test_thousand_complete_and_rerun_no_new_requests(self):
        self.seed_prior()
        before = dict(self.store.client.items)
        with tempfile.TemporaryDirectory() as d:
            result = b.execute(self.store, self.plan, self.trial, Path(d) / 'first', self.request, process)
            self.assertEqual(result['requested_this_run'], 1000)
            self.assertEqual(result['reuse_check_requests'], 0)
            self.assertEqual(result['reuse_check_files'], 1000)
            self.assertEqual(len(list((Path(d) / 'first/mp3').glob('*.mp3'))), 1000)
            rerun = b.execute(self.store, self.plan, self.trial, Path(d) / 'second', self.request, process)
            self.assertEqual(rerun['requested_this_run'], 0)
            self.assertEqual(rerun['reused_this_run'], 1000)
        self.assertEqual(len(self.calls), 1000)
        self.assertEqual(len(set(self.calls)), 1000)
        self.assertTrue(all(self.store.client.items[k] == v for k, v in before.items()))
        self.assertNotIn('audio/junior/current.json', self.store.client.items)

    def test_uncertain_last_target_blocks_all_paid_calls_and_writes(self):
        self.seed_prior()
        last = self.jobs[-1]
        self.store.ensure(f.keys(last)[0], f.encode({'asset_id': last['asset_id']}))
        writes = self.store.client.writes
        with tempfile.TemporaryDirectory() as d, self.assertRaisesRegex(ValueError, 'uncertain'):
            b.execute(self.store, self.plan, self.trial, Path(d), self.request, process)
        self.assertEqual(self.calls, [])
        self.assertEqual(self.store.client.writes, writes)

    def test_missing_existing_pilot_does_not_regenerate_it(self):
        self.seed_prior()
        del self.store.client.items[self.pilot[-1]['object_key']]
        with tempfile.TemporaryDirectory() as d, self.assertRaises(ValueError):
            b.execute(self.store, self.plan, self.trial, Path(d), self.request, process)
        self.assertEqual(self.calls, [])

    def test_parallelism_is_two_and_error_stops_queued_work(self):
        barrier = threading.Barrier(2)
        def failing(job):
            self.request(job)
            barrier.wait(timeout=5)
            raise TimeoutError()
        with tempfile.TemporaryDirectory() as d:
            with self.assertRaises(TimeoutError):
                b.generate_fixed(self.store, self.jobs[:20], Path(d), failing, process)
            self.assertEqual(len(self.calls), 2)
            with self.assertRaisesRegex(ValueError, 'uncertain'):
                p.preflight(self.store, self.jobs[:20])
            summaries = [json.loads(x.read_text()) for x in Path(d).glob('progress/*/summary.json')]
            self.assertEqual(sum(s['requested'] for s in summaries), 2)

    def test_processing_failure_resumes_from_raw_without_duplicate_calls(self):
        self.seed_prior()
        def broken(raw, target):
            raise OSError()
        with tempfile.TemporaryDirectory() as d:
            with self.assertRaises(OSError):
                b.generate_fixed(self.store, self.jobs, Path(d) / 'partial', self.request, broken)
            self.assertTrue(1 <= len(self.calls) <= 2)
            result = b.execute(self.store, self.plan, self.trial, Path(d) / 'resume', self.request, process)
            self.assertEqual(result['status'], 'complete')
        self.assertEqual(len(self.calls), 1000)
        self.assertEqual(len(set(self.calls)), 1000)

    def test_deadline_stops_before_creating_paid_request_records(self):
        with tempfile.TemporaryDirectory() as d, self.assertRaisesRegex(ValueError, 'Time limit'):
            b.generate_fixed(self.store, self.jobs, Path(d), self.request, process, time.monotonic() - 1)
        self.assertEqual(self.calls, [])
        self.assertEqual(self.store.client.writes, 0)

    def test_cli_defaults_to_offline_and_missing_key_cannot_connect(self):
        with patch.object(sys, 'argv', ['fixed']), patch.object(b, 'connect', side_effect=AssertionError()):
            b.main()
        with patch.object(sys, 'argv', ['fixed', '--generate']), \
                patch.dict(b.os.environ, {'OPENAI_API_KEY': ''}), \
                patch.object(b, 'connect', side_effect=AssertionError()), \
                self.assertRaisesRegex(ValueError, 'OPENAI_API_KEY'):
            b.main()


if __name__ == '__main__':
    unittest.main()
