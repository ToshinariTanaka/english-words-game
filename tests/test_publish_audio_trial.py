import copy
import io
import json
from pathlib import Path
import sys
import tempfile
import unittest
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tools'))
from publish_audio_trial import build, publish, POINTER
from upload_audio_trial import sha, plan_hash

class Missing(Exception):
    response = {'Error': {'Code': 'NoSuchKey'}}

class Store:
    def __init__(self, objects):
        self.objects = {k: v for k, v, _ in objects}
        self.writes = []
    def get_object(self, Bucket, Key):
        if Key not in self.objects:
            raise Missing()
        data = self.objects[Key]
        return {'Body': io.BytesIO(data), 'Metadata': {'sha256': sha(data)}}
    def put_object(self, Bucket, Key, Body, **kw):
        assert kw['IfNoneMatch'] == '*'
        assert Key not in self.objects
        self.objects[Key] = Body
        self.writes.append(Key)

class PublicationTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.plan = json.loads(Path('tools/audio-sample-plan.json').read_text())
        (self.root / 'mp3').mkdir()
        (self.root / 'raw').mkdir()
        entries = {}
        for job in self.plan['jobs']:
            asset = job['asset_id']
            data = ('fixture-' + asset).encode()
            for folder in ('mp3', 'raw'):
                (self.root / folder / (asset + '.mp3')).write_bytes(data)
            entries[asset] = dict(status='generated', bytes=len(data), file_sha256=sha(data), duration_seconds=1.25)
        (self.root / 'plan.json').write_text(json.dumps(self.plan))
        (self.root / 'state.json').write_text(json.dumps(dict(plan_sha256=plan_hash(self.plan), entries=entries)))
        (self.root / 'summary.json').write_text('{"generated":60}')
        self.audio, self.manifests, self.pointer = build(self.root, self.plan)
    def run_publish(self, store):
        publish(store, self.audio, self.manifests, self.pointer, self.root / 'report')
    def test_contract_and_pointer_last(self):
        store = Store(self.audio)
        self.run_publish(store)
        self.assertEqual(store.writes[-1], POINTER)
        self.assertEqual(len(store.writes), 5)
        self.assertEqual(len(self.audio), 60)
        for _, data, _ in self.manifests:
            manifest = json.loads(data)
            self.assertEqual(manifest['release_id'], json.loads(self.pointer)['release_id'])
            for item in manifest['entries'].values():
                self.assertEqual(set(item['voices']), {'nova', 'ash'})
                self.assertEqual(item['voices']['nova']['duration_ms'], 1250)
    def test_rerun_does_not_rewrite(self):
        store = Store(self.audio)
        self.run_publish(store)
        self.run_publish(store)
        self.assertEqual(len(store.writes), 5)
    def test_missing_audio_prevents_publication(self):
        store = Store(self.audio[:-1])
        with self.assertRaises(Missing):
            self.run_publish(store)
        self.assertEqual(store.writes, [])
    def test_corrupt_audio_prevents_publication(self):
        store = Store(self.audio)
        store.objects[self.audio[-1][0]] = b'corrupt'
        with self.assertRaises(ValueError):
            self.run_publish(store)
        self.assertEqual(store.writes, [])
    def test_other_release_not_replaced(self):
        store = Store(self.audio)
        store.objects[POINTER] = b'{"release_id":"other"}'
        with self.assertRaises(ValueError):
            self.run_publish(store)
        self.assertEqual(store.writes, [])
    def test_manifest_collision_prevents_pointer(self):
        store = Store(self.audio)
        store.objects[self.manifests[0][0]] = b'other'
        with self.assertRaises(ValueError):
            self.run_publish(store)
        self.assertNotIn(POINTER, store.objects)
    def test_altered_artifact_rejected(self):
        (self.root / 'mp3' / (self.plan['jobs'][0]['asset_id'] + '.mp3')).write_bytes(b'changed')
        with self.assertRaises(ValueError):
            build(self.root, self.plan)

if __name__ == '__main__':
    unittest.main()
