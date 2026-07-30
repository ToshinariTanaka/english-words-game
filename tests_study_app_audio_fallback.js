const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const source = fs.readFileSync('study-app/script.js', 'utf8');
const start = source.indexOf('const MODES =');
const end = source.indexOf('function setLoadingState');
const snippet = source.slice(start, end);

const voiceStatus = { textContent: '' };
let audioPlayReject = false;
let audioPlayPending = false;
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
    MockAudio.last = this;
  }
  addEventListener(type, callback) { this.listeners[type] = callback; }
  play() {
    if (audioPlayPending) return new Promise(() => {});
    return audioPlayReject ? Promise.reject(new Error('blocked')) : Promise.resolve();
  }
  pause() {}
  removeAttribute() {}
  load() {}
}

const sandbox = {
  console,
  setTimeout,
  clearTimeout,
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
  audioPlayCalls = [];
  spokenTexts = [];
  cancelled = 0;
  audioPlayReject = false;
  audioPlayPending = false;
  voiceStatus.textContent = '';
}

(async () => {
  await reset({ question: 'reconnaissance', questionKey: 'w000001' });
  await sandbox.speakCurrentQuestion();
  assert.deepStrictEqual(audioPlayCalls, ['http://localhost/audio/w000001.mp3'], 'MP3 URLが存在する場合はMP3再生を試す');
  assert.deepStrictEqual(spokenTexts, [], 'MP3再生成功時はWeb Speechへフォールバックしない');
  assert.strictEqual(voiceStatus.textContent, 'MP3を再生しています');

  await reset({ question: 'auto status', questionKey: 'w000010' });
  await sandbox.speakCurrentQuestion({ statusPrefix: '自動読上げ：' });
  assert.strictEqual(voiceStatus.textContent, '自動読上げ：MP3を再生しています', '自動読上げ時は状態を区別して表示する');


  await reset({ question: 'question without key' });
  await sandbox.speakCurrentQuestion();
  assert.deepStrictEqual(audioPlayCalls, [], 'question_keyがない場合はMP3再生しない');
  assert.deepStrictEqual(spokenTexts, ['question without key'], 'question_keyがない場合はWeb Speech APIへフォールバックする');

  await reset({ question: 'play reject', questionKey: 'w000002' });
  audioPlayReject = true;
  await sandbox.speakCurrentQuestion();
  await Promise.resolve();
  assert.deepStrictEqual(audioPlayCalls, ['http://localhost/audio/w000002.mp3'], 'MP3 URLが存在する場合は再生を試す');
  assert.deepStrictEqual(spokenTexts, ['play reject'], 'audio.play()が失敗した場合もWeb Speech APIへフォールバックする');
  assert.strictEqual(cancelled, 1, 'Safari対策としてMP3開始時だけcancelし、フォールバック直前には重ねてcancelしない');

  await reset({ question: 'error event', questionKey: 'w000003' });
  audioPlayPending = true;
  const errorEventPromise = sandbox.speakCurrentQuestion();
  await Promise.resolve();
  sandbox.Audio.last.listeners.error();
  await errorEventPromise;
  await Promise.resolve();
  assert.deepStrictEqual(audioPlayCalls, ['http://localhost/audio/w000003.mp3'], 'HEAD確認なしでMP3再生を実際に試す');
  assert.deepStrictEqual(spokenTexts, ['error event'], 'errorイベント時もWeb Speech APIへフォールバックする');

  console.log('tests_study_app_audio_fallback: OK');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
