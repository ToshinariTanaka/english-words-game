import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('trial', Path(__file__).resolve().parents[1] / 'tools/run_audio_sample.py')
trial = importlib.util.module_from_spec(spec)
spec.loader.exec_module(trial)
PLAN = json.loads((Path(__file__).resolve().parents[1] / 'tools/audio-sample-plan.json').read_text())

class TrialTests(unittest.TestCase):
    def test_dry_run_never_calls_api(self):
        with tempfile.TemporaryDirectory() as d:
            with patch.object(trial.urllib.request, 'urlopen', side_effect=AssertionError('network')):
                trial.run(PLAN, Path(d))
            self.assertEqual(json.loads((Path(d)/'summary.json').read_text())['generated'], 0)
            self.assertTrue((Path(d)/'listen.html').exists())

    def test_scope_guard(self):
        bad = {**PLAN, 'jobs': PLAN['jobs'] * 2}
        with self.assertRaises(ValueError):
            trial.validate(bad)

    def test_uncertain_request_never_retried(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            trial.run(PLAN, root)
            state = json.loads((root/'state.json').read_text())
            state['entries'][PLAN['jobs'][0]['asset_id']] = {'status': 'request_started'}
            trial.save(root/'state.json', state)
            with self.assertRaisesRegex(ValueError, 'uncertain'):
                trial.run(PLAN, root, True, opener=lambda *a, **k: self.fail('must not retry'))

    def test_decode_and_normalize(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            trial.subprocess.run(['ffmpeg', '-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1', str(root/'raw.mp3')], check=True)
            info = trial.process(root/'raw.mp3', root/'out.mp3')
            self.assertGreater(info['duration_seconds'], 0.9)
            self.assertLessEqual(info['gain_db'], 12)

if __name__ == '__main__':
    unittest.main()
