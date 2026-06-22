const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const source = fs.readFileSync('study-app/script.js', 'utf8');
const start = source.indexOf('const MODES =');
const end = source.indexOf('function setLoadingState');
const snippet = source.slice(start, end);

const voiceStatus = { textContent: '' };
let fetchCalls = [];
let fetchOk = true;
let fetchReject = false;
let audioPlayReject = false;
let audioPlayCalls = [];
let spokenTexts = [];
let cancelled = 0;

class MockUtterance {
  constructor(text) {
    this.text = text;
    this.lang = '';
    this.rate = 1;
    this.pitch = 1;
    this.voice = null;
  }
}

class MockAudio {
  constructor(src) {
    this.src = src;
    this.listeners = {};
    this.preload = '';
    this.crossOrigin = '';
    audioPlayCalls.push(src);
  }
  addEventListener(type, callback) { this.listeners[type] = callback; }
  play() {
    return audioPlayReject ? Promise.reject(new Error('blocked')) : Promise.resolve();
  }
  pause() {}
  removeAttribute() {}
  load() {}
}

const sandbox = {
  console,
  localStorage: { getItem: () => null, setItem: () => {} },
  document: {
    querySelectorAll: () => [],
    getElementById: (id) => (id === 'voiceStatus' ? voiceStatus : {}),
    createElement: (tag) => ({ tag, value: '', textContent: '' }),
  },
  window: {
    location: { origin: 'http://localhost', hostname: 'localhost' },
    speechSynthesis: {
      cancel: () => { cancelled += 1; },
      getVoices: () => [],
      speak: (utterance) => { spokenTexts.push(utterance.text); },
    },
  },
  SpeechSynthesisUtterance: MockUtterance,
  Audio: MockAudio,
  fetch: async (url, options) => {
    fetchCalls.push({ url, options });
    if (fetchReject) throw new Error('network');
    return { ok: fetchOk, status: fetchOk ? 200 : 404 };
  },
};

vm.createContext(sandbox);
vm.runInContext(`${snippet};
this.state = state;
this.speakCurrentQuestion = speakCurrentQuestion;
this.getCurrentQuestionAudioUrl = getCurrentQuestionAudioUrl;
`, sandbox);

async function reset(question) {
  sandbox.state.questions = [question];
  sandbox.state.index = 0;
  fetchCalls = [];
  audioPlayCalls = [];
  spokenTexts = [];
  cancelled = 0;
  fetchOk = true;
  fetchReject = false;
  audioPlayReject = false;
  voiceStatus.textContent = '';
}

(async () => {
  await reset({ question: 'reconnaissance', questionKey: 'w000001' });
  await sandbox.speakCurrentQuestion();
  assert.deepStrictEqual(fetchCalls.map((call) => call.options.method), ['HEAD'], 'MP3 URLの存在確認はHEADで行う');
  assert.strictEqual(fetchCalls[0].url, 'http://localhost/audio/w000001.mp3');
  assert.deepStrictEqual(audioPlayCalls, ['http://localhost/audio/w000001.mp3'], 'MP3 URLが存在する場合はMP3再生を試す');
  assert.deepStrictEqual(spokenTexts, [], 'MP3再生成功時はWeb Speechへフォールバックしない');
  assert.strictEqual(voiceStatus.textContent, 'MP3を再生しています');

  await reset({ question: 'uncreated word', questionKey: 'w999999' });
  fetchOk = false;
  await sandbox.speakCurrentQuestion();
  assert.deepStrictEqual(audioPlayCalls, [], '404の場合はMP3再生を試さない');
  assert.deepStrictEqual(spokenTexts, ['uncreated word'], 'MP3 URLが404の場合はWeb Speech APIへフォールバックする');
  assert.ok(voiceStatus.textContent.startsWith('MP3が未作成のため、ブラウザ音声で読み上げます'), 'フォールバック状態を表示する');

  await reset({ question: 'question without key' });
  await sandbox.speakCurrentQuestion();
  assert.deepStrictEqual(fetchCalls, [], 'question_keyがない場合はMP3確認を行わない');
  assert.deepStrictEqual(audioPlayCalls, [], 'question_keyがない場合はMP3再生しない');
  assert.deepStrictEqual(spokenTexts, ['question without key'], 'question_keyがない場合はWeb Speech APIへフォールバックする');

  await reset({ question: 'play reject', questionKey: 'w000002' });
  audioPlayReject = true;
  await sandbox.speakCurrentQuestion();
  await Promise.resolve();
  assert.deepStrictEqual(audioPlayCalls, ['http://localhost/audio/w000002.mp3'], 'MP3 URLが存在する場合は再生を試す');
  assert.deepStrictEqual(spokenTexts, ['play reject'], 'audio.play()が失敗した場合もWeb Speech APIへフォールバックする');

  await reset({ question: 'network fail', questionKey: 'w000003' });
  fetchReject = true;
  await sandbox.speakCurrentQuestion();
  assert.deepStrictEqual(audioPlayCalls, [], 'fetch失敗時はMP3再生しない');
  assert.deepStrictEqual(spokenTexts, ['network fail'], 'fetch失敗時もWeb Speech APIへフォールバックする');

  console.log('tests_study_app_audio_fallback: OK');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
