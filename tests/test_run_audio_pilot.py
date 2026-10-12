import copy
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tools'))
import run_audio_pilot as p
import run_full_audio as f
from test_run_full_audio import FakeR2, process


class PilotTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        plan, _, _, _, cls.trial = f.load_plan()
        cls.jobs = p.select_jobs(plan)

    def setUp(self):
        self.client = FakeR2()
        self.store = f.Store(self.client)
        self.calls = 0

    def request(self, job):
        self.calls += 1
        return b'audio-' + job['asset_id'].encode()

    def seed_trial(self):
        entries = {}
        for job in self.trial['jobs']:
            data = b'trial-' + job['asset_id'].encode()
            self.store.ensure(job['object_key'], data, 'audio/mpeg')
            entries[job['asset_id']] = {'status': 'generated', 'bytes': len(data),
                'file_sha256': f.sha(data), 'duration_seconds': 1.0}
        prefix = f'backups/audio-trials/{f.SOURCE_RUN}/'
        self.store.ensure(prefix + 'plan.json', f.encode(self.trial))
        self.store.ensure(prefix + 'state.json', f.encode({'plan_sha256': f.plan_hash(self.trial), 'entries': entries}))

    def test_fixed_twenty_do_not_include_any_trial_asset(self):
        self.assertEqual(len(self.jobs), 20)
        self.assertEqual(self.jobs[0]['voice'], 'nova')
        self.assertFalse({j['asset_id'] for j in self.jobs} & {j['asset_id'] for j in self.trial['jobs']})
        changed = copy.deepcopy(self.jobs)
        changed[0]['text'] = 'changed'
        with self.assertRaises(ValueError):
            p.select_jobs({'jobs': changed})
        with self.assertRaises(ValueError):
            p.select_jobs({'jobs': self.jobs[:-1]})

    def test_complete_pilot_and_second_execution_request_only_twenty_total(self):
        self.seed_trial()
        with tempfile.TemporaryDirectory() as d:
            first = p.execute(self.store, self.trial, self.jobs, Path(d), self.request, process)
            self.assertEqual(first['requested_this_run'], 20)
            self.assertEqual(first['reuse_check_requests'], 0)
            self.assertEqual(first['reuse_check_files'], 20)
            self.assertEqual(len(list((Path(d) / 'mp3').glob('*.mp3'))), 20)
            self.assertTrue((Path(d) / 'listen.html').exists())
            second = p.execute(self.store, self.trial, self.jobs, Path(d), self.request, process)
            self.assertEqual(second['requested_this_run'], 0)
            self.assertEqual(second['reused_this_run'], 20)
        self.assertEqual(self.calls, 20)

    def test_uncertain_last_job_stops_before_any_new_request(self):
        self.seed_trial()
        job = self.jobs[-1]
        self.store.ensure(f.keys(job)[0], f.encode({'asset_id': job['asset_id']}))
        before = self.client.writes
        with tempfile.TemporaryDirectory() as d, self.assertRaisesRegex(ValueError, 'uncertain'):
            p.execute(self.store, self.trial, self.jobs, Path(d), self.request, process)
        self.assertEqual(self.calls, 0)
        self.assertEqual(self.client.writes, before)

    def test_missing_trial_aborts_before_paid_or_r2_writes(self):
        with tempfile.TemporaryDirectory() as d, self.assertRaises(ValueError):
            p.execute(self.store, self.trial, self.jobs, Path(d), self.request, process)
        self.assertEqual(self.calls, 0)
        self.assertEqual(self.client.writes, 0)

    def test_default_cli_does_not_connect(self):
        with patch.object(sys, 'argv', ['pilot']), patch.object(p, 'connect', side_effect=AssertionError()):
            p.main()

    def test_missing_key_fails_before_r2_connection(self):
        with patch.object(sys, 'argv', ['pilot', '--generate']), \
                patch.dict(p.os.environ, {'OPENAI_API_KEY': ''}), \
                patch.object(p, 'connect', side_effect=AssertionError()), \
                self.assertRaisesRegex(ValueError, 'OPENAI_API_KEY'):
            p.main()


if __name__ == '__main__':
    unittest.main()
