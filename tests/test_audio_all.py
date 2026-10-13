import contextlib
import io
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tools'))
import run_audio_all as a
import publish_audio_all as p
import publish_audio_1080 as prior
import run_full_audio as f
from test_publish_audio_1080 import ConditionalR2
from test_run_full_audio import process


class InventoryR2(ConditionalR2):
    def list_objects_v2(self, Bucket, Prefix, MaxKeys, ContinuationToken=None):
        keys = sorted(k for k in self.items if k.startswith(Prefix))
        offset = int(ContinuationToken or 0)
        page = keys[offset:offset + MaxKeys]
        more = offset + MaxKeys < len(keys)
        return dict(Contents=[{'Key': k} for k in page], IsTruncated=more,
                    NextContinuationToken=str(offset + MaxKeys) if more else None)


class AllAudioTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.full, cls.remaining, cls.batches, cls.previous = a.plan()

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.client = InventoryR2()
        self.store = f.Store(self.client)
        self.ledger = {}
        self.calls = []
        # Avoid confusing test fixture output with actual production counts in Actions.
        self.quiet = contextlib.redirect_stdout(io.StringIO())
        self.quiet.__enter__()
        self.addCleanup(self.quiet.__exit__, None, None, None)

    def seed(self, key, value):
        self.client.items[key] = (value, {'sha256': f.sha(value)})

    def seed_audio(self, jobs, completed=True):
        for job in jobs:
            data = b'fixture-' + job['asset_id'].encode()
            entry = dict(status='generated', asset_id=job['asset_id'], bytes=len(data),
                         file_sha256=f.sha(data), duration_seconds=1.5)
            self.ledger[job['asset_id']] = entry
            self.seed(job['object_key'], data)
            if completed:
                self.seed(f.keys(job)[2], f.encode(entry))

    def seed_previous(self):
        old, trial, pilot, bulk = self.previous
        self.seed_audio(old)
        prefix = f'backups/audio-trials/{f.SOURCE_RUN}/'
        self.seed(prefix + 'plan.json', f.encode(trial))
        self.seed(prefix + 'state.json', f.encode(dict(plan_sha256=f.plan_hash(trial), entries=self.ledger)))
        self.seed(prior.PILOT_KEY, f.encode(dict(kind='fixed_generation_pilot', questions=10, files=20, jobs=pilot)))
        self.seed(prior.PLAN_KEY, f.encode(dict(kind='fixed_1000_word_audio', target_sha256=prior.TARGET_SHA, jobs=bulk)))
        for jobs, module, field in ((trial['jobs'], prior, 'PREVIOUS_RELEASE'), (old, a, 'INITIAL_RELEASE')):
            release, manifests = prior.build(jobs, self.ledger)
            patcher = patch.object(module, field, release)
            patcher.start()
            self.addCleanup(patcher.stop)
            for mode, manifest in manifests.items():
                self.seed(f'audio/junior/releases/{release}/{mode}.json', f.encode(manifest))
        self.seed(prior.POINTER, f.encode({'release_id': a.INITIAL_RELEASE}))

    def request(self, job):
        self.calls.append(job['asset_id'])
        return b'raw-' + job['asset_id'].encode()

    def authorized(self):
        self.seed(a.AUTHORIZATION, f.encode(a.authorization()))

    def generate(self, jobs, run='123-1', requester=None, processor=process, **kwargs):
        return a.generate(self.store, jobs, self.root / run, run, 1,
                          requester or self.request, processor, **kwargs)

    def test_complete_fixed_scope_and_voice_pairs(self):
        self.assertEqual(len(self.remaining), 17290)
        self.assertEqual(len(self.batches), 35)
        self.assertEqual(len(self.batches[-1]), 290)
        self.assertFalse({j['asset_id'] for j in self.previous[0]} & {j['asset_id'] for j in self.remaining})
        for batch in self.batches:
            self.assertLessEqual(len(batch), 500)
            for i in range(0, len(batch), 2):
                self.assertEqual(batch[i]['question_key'], batch[i + 1]['question_key'])
                self.assertEqual((batch[i]['voice'], batch[i + 1]['voice']), ('nova', 'ash'))

    def test_start_verifies_previous_and_never_autostarts_again(self):
        self.seed_previous()
        self.assertTrue(a.prepare(self.store, once=True))
        writes = self.client.writes
        self.assertFalse(a.prepare(self.store, once=True))
        self.assertEqual(self.client.writes, writes)
        self.assertTrue(a.prepare(self.store))

    def test_uncertain_last_file_blocks_start_before_any_writes(self):
        self.seed_previous()
        self.seed(f.keys(self.remaining[-1])[0], f.encode({'asset_id': self.remaining[-1]['asset_id']}))
        with self.assertRaisesRegex(ValueError, 'Uncertain'):
            a.prepare(self.store)
        self.assertEqual(self.client.writes, 0)

    def test_untracked_output_blocks_start(self):
        self.seed_previous()
        self.seed(self.remaining[-1]['object_key'], b'untracked')
        with self.assertRaisesRegex(ValueError, 'Untracked'):
            a.prepare(self.store)
        self.assertEqual(self.client.writes, 0)

    def test_generated_files_reused_without_new_calls(self):
        self.authorized()
        jobs = self.remaining[:8]
        first = self.generate(jobs)
        self.assertEqual(first['requested_this_run'], 8)
        second = self.generate(jobs, '123-2')
        self.assertEqual(second['reused_this_run'], 8)
        self.assertEqual(second['requested_this_run'], 0)
        self.assertEqual(len(self.calls), 8)
        self.assertNotIn(prior.POINTER, self.client.items)

    def test_global_stop_prevents_other_queued_batch_calls(self):
        self.authorized()
        self.seed(a.stop_key('123-1'), b'{}')
        with self.assertRaises(ValueError):
            self.generate(self.remaining[:8])
        self.assertEqual(self.calls, [])

    def test_lost_r2_claim_response_reconciles_without_duplicate_api_call(self):
        self.authorized()
        self.store = a.DurableStore(self.client)
        original = self.client.put_object
        claim = f.keys(self.remaining[0])[0]
        def uncertain(**kwargs):
            original(**kwargs)
            if kwargs['Key'] == claim:
                raise TimeoutError()
        with patch.object(self.client, 'put_object', side_effect=uncertain):
            result = self.generate(self.remaining[:1])
        self.assertEqual(result['completed_this_run'], 1)
        self.assertEqual(len(self.calls), 1)

    def test_r2_retry_preserves_collisions_and_rejects_corruption(self):
        self.store = a.DurableStore(self.client)
        self.seed('claim', b'other-owner')
        self.assertFalse(self.store.create('claim', b'new-owner'))
        self.client.items['broken'] = (b'corrupt', {'sha256': 'wrong'})
        with self.assertRaisesRegex(ValueError, 'checksum'):
            self.store.read('broken')

    def test_uncertain_request_is_not_retried_on_new_attempt(self):
        self.authorized()
        job = self.remaining[0]
        def uncertain(j):
            self.request(j)
            raise TimeoutError()
        with self.assertRaises(TimeoutError):
            self.generate([job], requester=uncertain)
        with self.assertRaisesRegex(ValueError, 'uncertain'):
            self.generate([job], '123-2')
        self.assertEqual(len(self.calls), 1)

    def test_saved_raw_resumes_after_processing_failure(self):
        self.authorized()
        def broken(*args):
            raise OSError()
        with self.assertRaises(OSError):
            self.generate(self.remaining[:1], processor=broken)
        result = self.generate(self.remaining[:1], '123-2')
        self.assertEqual(result['completed_this_run'], 1)
        self.assertEqual(len(self.calls), 1)

    def test_expired_deadline_does_not_claim_paid_request(self):
        self.authorized()
        with self.assertRaisesRegex(ValueError, 'time limit'):
            self.generate(self.remaining[:1], deadline=0)
        self.assertNotIn(f.keys(self.remaining[0])[0], self.client.items)
        self.assertEqual(self.calls, [])

    def test_missing_last_audio_prevents_publication(self):
        self.seed_previous()
        self.authorized()
        self.seed_audio(self.remaining[:-1])
        with self.assertRaisesRegex(ValueError, 'Incomplete'):
            p.publish(self.store, self.root, check=lambda *args: 32)
        self.assertEqual(self.client.writes, 0)

    def test_all_published_preserve_prior_and_can_rollback_with_missing_new_audio(self):
        self.seed_previous()
        self.authorized()
        self.seed_audio(self.remaining)
        result = p.publish(self.store, self.root, check=lambda *args: 32)
        self.assertEqual(result['status'], 'published_and_verified')
        self.assertEqual(result['r2_files_verified'], 18370)
        self.assertEqual(result['paid_api_calls'], 0)
        self.assertEqual(self.client.written[-1], prior.POINTER)
        for mode, count in dict(word=7489, chunk=856, phrase=441, definition=399).items():
            raw = (self.root / (mode + '.json')).read_bytes()
            self.assertLess(len(raw), p.MAX_MANIFEST)
            self.assertEqual(len(json.loads(raw)['entries']), count)
        writes = self.client.writes
        p.publish(self.store, self.root, check=lambda *args: 32)
        self.assertEqual(self.client.writes, writes)
        del self.client.items[self.remaining[-1]['object_key']]
        result = p.publish(self.store, self.root, rollback=True, check=lambda *args: 32)
        self.assertEqual(result['status'], 'rolled_back')
        self.assertEqual(result['active_release_id'], a.INITIAL_RELEASE)

    def test_offline_validation_has_no_network(self):
        with patch.object(sys, 'argv', ['all', '--output', str(self.root)]), \
                patch.object(a, 'connect', side_effect=AssertionError('network')):
            a.main()


if __name__ == '__main__':
    unittest.main()
