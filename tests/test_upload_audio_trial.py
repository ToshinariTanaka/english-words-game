import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('upload', Path(__file__).resolve().parents[1] / 'tools/upload_audio_trial.py')
u = importlib.util.module_from_spec(spec)
spec.loader.exec_module(u)

class Missing(Exception):
    response = {'Error': {'Code': 'NoSuchKey'}}

class FakeR2:
    def __init__(self):
        self.items = {}
        self.writes = 0
        self.corrupt = False
    def get_object(self, Bucket, Key):
        assert Bucket == 'up-words-audio'
        if Key not in self.items:
            raise Missing()
        data, metadata = self.items[Key]
        return {'Body': io.BytesIO(b'bad' if self.corrupt else data), 'Metadata': metadata}
    def put_object(self, **kwargs):
        assert kwargs['IfNoneMatch'] == '*'
        self.writes += 1
        self.items[kwargs['Key']] = (kwargs['Body'], kwargs['Metadata'])

class UploadTests(unittest.TestCase):
    def test_resume_reads_existing_without_rewriting(self):
        with tempfile.TemporaryDirectory() as d:
            client = FakeR2()
            objects = [('audio/test.mp3', b'audio', 'audio/mpeg')]
            report = Path(d)/'report.json'
            u.transfer(client, objects, report)
            u.transfer(client, objects, report)
            self.assertEqual(client.writes, 1)
            self.assertTrue(json.loads(report.read_text())['complete'])

    def test_existing_mismatch_never_overwritten(self):
        with tempfile.TemporaryDirectory() as d:
            client = FakeR2()
            client.items['key'] = (b'old', {'sha256': u.sha(b'old')})
            with self.assertRaises(ValueError):
                u.transfer(client, [('key', b'new', 'audio/mpeg')], Path(d)/'report.json')
            self.assertEqual(client.writes, 0)

    def test_bad_readback_fails_and_records_partial_report(self):
        with tempfile.TemporaryDirectory() as d:
            client = FakeR2()
            client.corrupt = True
            p = Path(d)/'report.json'
            with self.assertRaises(ValueError):
                u.transfer(client, [('key', b'new', 'audio/mpeg')], p)
            self.assertEqual(json.loads(p.read_text())['verified_objects'], 0)

    def test_rejects_different_plan_before_network(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            (root/'plan.json').write_text('{}')
            with self.assertRaisesRegex(ValueError, 'approved trial'):
                u.prepare(root, {'jobs': []})

    def test_credential_failure_not_treated_as_missing(self):
        class Forbidden(Exception):
            response = {'Error': {'Code': 'AccessDenied'}}
        class Denied(FakeR2):
            def get_object(self, **kwargs):
                raise Forbidden()
        with tempfile.TemporaryDirectory() as d:
            client = Denied()
            with self.assertRaises(Forbidden):
                u.transfer(client, [('key', b'new', 'audio/mpeg')], Path(d)/'report.json')
            self.assertEqual(client.writes, 0)

if __name__ == '__main__':
    unittest.main()
