import io
import json
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tools'))
import run_full_audio as f


class Missing(Exception):
    response = {'Error': {'Code': 'NoSuchKey'}}


class Collision(Exception):
    response = {'Error': {'Code': 'PreconditionFailed'}}


class FakeR2:
    def __init__(self):
        self.items = {}
        self.writes = 0
        self.fail_suffix = None

    def get_object(self, Bucket, Key):
        if Key not in self.items:
            raise Missing()
        data, metadata = self.items[Key]
        return {'Body': io.BytesIO(data), 'Metadata': metadata}

    def put_object(self, **args):
        assert args['IfNoneMatch'] == '*'
        if self.fail_suffix and args['Key'].endswith(self.fail_suffix):
            raise OSError('Simulated connection interruption')
        if args['Key'] in self.items:
            raise Collision()
        self.items[args['Key']] = (args['Body'], args['Metadata'])
        self.writes += 1


def process(raw, target):
    data = raw.read_bytes() + b'-normalized'
    target.write_bytes(data)
    return {'bytes': len(data), 'file_sha256': f.sha(data), 'duration_seconds': 1.0, 'gain_db': 2.0}


class FullTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.plan, cls.batches, cls.reuse, cls.report, cls.trial = f.load_plan()

    def setUp(self):
        self.client = FakeR2()
        self.store = f.Store(self.client)
        self.calls = 0
        self.job = self.batches[0][0]

    def request(self, job):
        self.calls += 1
        return b'raw-audio'

    def test_snapshot_yields_all_jobs_and_original_trial_assets(self):
        self.assertEqual(self.report['total_files'], 18370)
        self.assertEqual(self.report['new_files_if_reuse_verified'], 18310)
        self.assertEqual(len(self.batches), 37)
        self.assertEqual(set(self.reuse), {j['asset_id'] for j in self.trial['jobs']})

    def seed_trial(self):
        prefix = f'backups/audio-trials/{f.SOURCE_RUN}/'
        entries = {}
        for job in self.trial['jobs']:
            data = b'original-trial-' + job['asset_id'].encode()
            entries[job['asset_id']] = {'status': 'generated', 'bytes': len(data),
                'file_sha256': f.sha(data), 'duration_seconds': 1.0}
            self.store.ensure(job['object_key'], data, 'audio/mpeg')
        self.store.ensure(prefix + 'plan.json', f.encode(self.trial))
        self.store.ensure(prefix + 'state.json', f.encode({'plan_sha256': f.plan_hash(self.trial),
                                                         'entries': entries}))

    def test_trial_audit_verifies_all_sixty_without_writes(self):
        self.seed_trial()
        before = self.client.writes
        self.assertEqual(len(f.verify_trial(self.store, self.trial)), 60)
        self.assertEqual(self.client.writes, before)

    def test_one_missing_trial_file_fails_without_regeneration(self):
        self.seed_trial()
        del self.client.items[self.trial['jobs'][-1]['object_key']]
        with self.assertRaisesRegex(ValueError, 'ledger differ'):
            f.verify_trial(self.store, self.trial)
        self.assertEqual(self.calls, 0)

    def test_success_and_rerun_never_regenerates(self):
        with tempfile.TemporaryDirectory() as d:
            f.run_jobs(self.store, [self.job], Path(d), 1, self.request, process)
            result = f.run_jobs(self.store, [self.job], Path(d), 1, self.request, process)
        self.assertEqual(self.calls, 1)
        self.assertEqual(result['reused'], 1)
        self.assertEqual(self.client.writes, 4)

    def test_timeout_blocks_automatic_retry(self):
        def timeout(job):
            self.calls += 1
            raise TimeoutError()
        with tempfile.TemporaryDirectory() as d:
            with self.assertRaises(TimeoutError):
                f.run_jobs(self.store, [self.job], Path(d), 1, timeout, process)
            with self.assertRaisesRegex(ValueError, 'uncertain'):
                f.run_jobs(self.store, [self.job], Path(d), 1, self.request, process)
        self.assertEqual(self.calls, 1)

    def test_raw_survives_processing_failure_and_resumes_without_request(self):
        def broken(raw, target):
            raise OSError()
        with tempfile.TemporaryDirectory() as d:
            with self.assertRaises(OSError):
                f.run_jobs(self.store, [self.job], Path(d), 1, self.request, broken)
            f.run_jobs(self.store, [self.job], Path(d), 1, self.request, process)
        self.assertEqual(self.calls, 1)

    def test_failure_after_final_upload_resumes_without_request(self):
        self.client.fail_suffix = '/complete.json'
        with tempfile.TemporaryDirectory() as d:
            with self.assertRaises(OSError):
                f.run_jobs(self.store, [self.job], Path(d), 1, self.request, process)
            self.client.fail_suffix = None
            f.run_jobs(self.store, [self.job], Path(d), 1, self.request, process)
        self.assertEqual(self.calls, 1)

    def test_request_reservation_collision_never_calls_api(self):
        class CompetingStore(f.Store):
            def create(self, key, data, content_type='application/json'):
                return False
        with tempfile.TemporaryDirectory() as d, self.assertRaisesRegex(ValueError, 'claimed'):
            f.run_jobs(CompetingStore(self.client), [self.job], Path(d), 1, self.request, process)
        self.assertEqual(self.calls, 0)

    def test_raw_upload_failure_keeps_local_rescue_copy_and_blocks_retry(self):
        self.client.fail_suffix = '/raw.mp3'
        with tempfile.TemporaryDirectory() as d:
            with self.assertRaises(OSError):
                f.run_jobs(self.store, [self.job], Path(d), 1, self.request, process)
            self.assertEqual((Path(d) / (self.job['asset_id'] + '.raw.mp3')).read_bytes(), b'raw-audio')
            self.client.fail_suffix = None
            with self.assertRaisesRegex(ValueError, 'uncertain'):
                f.run_jobs(self.store, [self.job], Path(d), 1, self.request, process)
        self.assertEqual(self.calls, 1)

    def test_count_limit_stops_before_next_request(self):
        with tempfile.TemporaryDirectory() as d:
            result = f.run_jobs(self.store, self.batches[0][:4], Path(d), 2, self.request, process)
        self.assertEqual(self.calls, 2)
        self.assertTrue(result['limit_reached'])

    def test_corrupt_completed_audio_does_not_trigger_regeneration(self):
        with tempfile.TemporaryDirectory() as d:
            f.run_jobs(self.store, [self.job], Path(d), 1, self.request, process)
            self.client.items[self.job['object_key']] = (b'changed', {'sha256': f.sha(b'changed')})
            with self.assertRaisesRegex(ValueError, 'ledger differ'):
                f.run_jobs(self.store, [self.job], Path(d), 1, self.request, process)
        self.assertEqual(self.calls, 1)

    def test_read_permission_error_is_not_missing(self):
        class Denied(FakeR2):
            def get_object(self, **args):
                raise PermissionError()
        with self.assertRaises(PermissionError):
            f.Store(Denied()).read('key')

    def test_cli_paid_generation_is_disabled(self):
        from unittest.mock import patch
        with patch.object(sys, 'argv', ['run_full_audio', '--mode', 'generate']), \
                patch.object(f, 'connect', side_effect=AssertionError('must not connect')), \
                self.assertRaisesRegex(ValueError, 'not enabled'):
            f.main()


if __name__ == '__main__':
    unittest.main()
