import io
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
from urllib.parse import urlparse, parse_qs

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tools'))
import publish_audio_1080 as p
import run_full_audio as f
from test_run_full_audio import FakeR2, Collision


class ConditionalR2(FakeR2):
    def __init__(self):
        super().__init__()
        self.race = False
        self.written = []

    def get_object(self, **args):
        result = super().get_object(**args)
        result['ETag'] = '"' + f.sha(self.items[args['Key']][0]) + '"'
        return result

    def put_object(self, **args):
        if 'IfMatch' in args:
            key = args['Key']
            if self.race:
                data = f.encode({'release_id': 'f' * 64})
                self.items[key] = (data, {'sha256': f.sha(data)})
            if self.get_object(Bucket=args['Bucket'], Key=key)['ETag'] != args['IfMatch']:
                raise Collision()
            self.items[key] = (args['Body'], args['Metadata'])
            self.writes += 1
        else:
            super().put_object(**args)
        self.written.append(args['Key'])


class PublicationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.jobs, cls.trial, cls.pilot, cls.bulk = p.target()

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.client = ConditionalR2()
        self.store = f.Store(self.client)
        self.ledger = {}
        for job in self.jobs:
            data = b'audio-' + job['asset_id'].encode()
            entry = dict(status='generated', asset_id=job['asset_id'], bytes=len(data),
                         file_sha256=f.sha(data), duration_seconds=1.25)
            self.ledger[job['asset_id']] = entry
            self.seed(job['object_key'], data)
            if job not in self.trial['jobs']:
                self.seed(f.keys(job)[2], f.encode(entry))
        prefix = f'backups/audio-trials/{f.SOURCE_RUN}/'
        self.seed(prefix + 'plan.json', f.encode(self.trial))
        self.seed(prefix + 'state.json', f.encode(dict(plan_sha256=f.plan_hash(self.trial),
            entries={j['asset_id']: self.ledger[j['asset_id']] for j in self.trial['jobs']})))
        self.seed(p.PILOT_KEY, f.encode(dict(kind='fixed_generation_pilot', questions=10, files=20, jobs=self.pilot)))
        self.seed(p.PLAN_KEY, f.encode(dict(kind='fixed_1000_word_audio', target_sha256=p.TARGET_SHA, jobs=self.bulk)))
        self.old, manifests = p.build(self.trial['jobs'], self.ledger)
        self.new, self.manifests = p.build(self.jobs, self.ledger)
        self.addCleanup(patch.stopall)
        patch.object(p, 'PREVIOUS_RELEASE', self.old).start()
        for mode, manifest in manifests.items():
            self.seed(f'audio/junior/releases/{self.old}/{mode}.json', f.encode(manifest))
        self.seed(p.POINTER, f.encode({'release_id': self.old}))

    def seed(self, key, data):
        self.client.items[key] = (data, {'sha256': f.sha(data)})

    def fetch(self, url):
        query = parse_qs(urlparse(url).query)
        mode = query['mode'][0]
        release = json.loads(self.store.read(p.POINTER))['release_id']
        if '/manifest?' in url:
            manifest = json.loads(self.store.read(f'audio/junior/releases/{release}/{mode}.json'))
            manifest.pop('kind')
            for item in manifest['entries'].values():
                for voice in item['voices'].values():
                    voice.pop('status')
            return f.encode(manifest)
        key = f"audio/junior/{query['voice'][0]}/{mode}/{query['key'][0]}/{query['asset'][0]}.mp3"
        return self.store.read(key)

    def execute(self, action='publish'):
        return p.execute(self.store, self.root, action,
            lambda jobs, ledger, manifests: p.smoke(jobs, ledger, manifests, self.fetch))

    def test_publication_preserves_trial_and_publishes_exact_pairs(self):
        result = self.execute()
        self.assertEqual(result['status'], 'published_and_verified')
        self.assertEqual(result['paid_api_calls'], 0)
        self.assertEqual(result['r2_files_verified'], 1080)
        self.assertEqual(self.client.written[-1], p.POINTER)
        self.assertEqual({m: len(v['entries']) for m, v in self.manifests.items()},
                         dict(word=522, chunk=6, phrase=6, definition=6))
        self.assertEqual(len((self.root / 'audio-keys.csv').read_text(encoding='utf-8-sig').splitlines()), 1081)
        writes = self.client.writes
        self.execute()
        self.assertEqual(self.client.writes, writes)

    def test_missing_or_corrupt_last_mp3_never_switches(self):
        key = self.bulk[-1]['object_key']
        for data in (None, b'wrong'):
            if data is None:
                del self.client.items[key]
            else:
                self.seed(key, data)
            with self.assertRaises(ValueError):
                self.execute()
            self.assertEqual(self.client.writes, 0)

    def test_changed_generation_plan_blocks_writes(self):
        self.seed(p.PLAN_KEY, b'{}')
        with self.assertRaisesRegex(ValueError, 'generation plan'):
            self.execute()
        self.assertEqual(self.client.writes, 0)

    def test_other_release_is_never_overwritten(self):
        self.seed(p.POINTER, f.encode({'release_id': 'e' * 64}))
        with self.assertRaisesRegex(ValueError, 'Unrecognized'):
            self.execute()
        self.assertEqual(self.client.writes, 0)

    def test_concurrent_pointer_change_rejects_cas(self):
        self.client.race = True
        with self.assertRaises(Collision):
            self.execute()
        self.assertEqual(json.loads(self.store.read(p.POINTER))['release_id'], 'f' * 64)

    def test_manifest_collision_leaves_current_pointer(self):
        self.seed(f'audio/junior/releases/{self.new}/word.json', b'bad manifest')
        with self.assertRaises(ValueError):
            self.execute()
        self.assertEqual(json.loads(self.store.read(p.POINTER))['release_id'], self.old)

    def test_delivery_failure_records_already_published_state(self):
        with self.assertRaises(OSError):
            p.execute(self.store, self.root, check=lambda *args: (_ for _ in ()).throw(OSError()))
        report = json.loads((self.root / 'result.json').read_bytes())
        self.assertEqual(report['status'], 'published_delivery_check_pending')
        self.assertEqual(json.loads(self.store.read(p.POINTER))['release_id'], self.new)

    def test_rollback_works_when_new_audio_is_missing(self):
        self.execute()
        del self.client.items[self.bulk[-1]['object_key']]
        result = self.execute('rollback')
        self.assertEqual(result['status'], 'rolled_back')
        self.assertEqual(json.loads(self.store.read(p.POINTER))['release_id'], self.old)
        writes = self.client.writes
        self.execute('rollback')
        self.assertEqual(self.client.writes, writes)

    def test_public_voice_mismatch_is_detected(self):
        self.execute()
        with self.assertRaisesRegex(ValueError, 'Public playback'):
            p.smoke(self.jobs, self.ledger, self.manifests,
                    lambda url: self.fetch(url) if '/manifest?' in url else b'wrong voice')

    def test_offline_default_never_connects(self):
        with patch.object(sys, 'argv', ['publish', '--output', str(self.root)]), \
                patch.object(p, 'connect', side_effect=AssertionError('Unexpected network')):
            p.main()


if __name__ == '__main__':
    unittest.main()
