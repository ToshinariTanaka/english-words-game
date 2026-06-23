const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const source = fs.readFileSync('study-app/script.js', 'utf8');
const start = source.indexOf('const MODES =');
const end = source.indexOf('function answer');
const snippet = source.slice(start, end);

let audioPlayCalls = [];
let spokenTexts = [];
let cancelled = 0;
const storage = new Map();

function makeEl(extra = {}) {
  return {
    textContent: '',
    className: '',
    hidden: false,
    disabled: false,
    checked: false,
    value: '',
    innerHTML: '',
    classList: { toggle: () => {} },
    appendChild(child) { this.children = this.children || []; this.children.push(child); },
    addEventListener() {},
    ...extra,
  };
}

const elements = {
  modeDescription: makeEl(), correctCount: makeEl(), answeredCount: makeEl(), accuracyRate: makeEl(),
  modeLabel: makeEl(), progressLabel: makeEl(), questionText: makeEl(), choices: makeEl(), feedback: makeEl(),
  nextButton: makeEl(), reviewSummary: makeEl(), reviewButton: makeEl(), fileInput: makeEl(), uploadStatus: makeEl(),
  questionCount: makeEl({ options: [{ value: '10' }, { value: 'all' }] }), levelStart: makeEl(), levelEnd: makeEl(),
  randomOrder: makeEl(), startQuizButton: makeEl(), settingsStatus: makeEl(), hostingStatus: makeEl(), autoSpeak: makeEl(),
  soundEffects: makeEl(), speakQuestionButton: makeEl(), voiceSelect: makeEl(), voiceStatus: makeEl(),
  voiceCandidateCount: makeEl(), backToSettingsButton: makeEl(), weakChecked: makeEl(), clearLearningStatsButton: makeEl(),
  studyCountsSummary: makeEl(), studyCountToday: makeEl(), studyCountMonth: makeEl(), studyCountYear: makeEl(), studyCountTotal: makeEl(),
};

class MockUtterance { constructor(text) { this.text = text; } }
class MockAudio {
  constructor(src) { this.src = src; this.listeners = {}; audioPlayCalls.push(src); }
  addEventListener(type, cb) { this.listeners[type] = cb; }
  play() { return Promise.resolve(); }
  pause() { cancelled += 1; }
  removeAttribute() {}
  load() {}
}

const sandbox = {
  console,
  setTimeout,
  clearTimeout,
  localStorage: {
    getItem: (key) => storage.has(key) ? storage.get(key) : null,
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: (key) => storage.delete(key),
  },
  document: {
    querySelectorAll: () => [],
    querySelector: () => makeEl(),
    getElementById: (id) => elements[id] || makeEl(),
    createElement: (tag) => makeEl({ tag, type: '', addEventListener() {} }),
  },
  window: {
    location: { origin: 'http://localhost', hostname: 'localhost' },
    speechSynthesis: { cancel: () => { cancelled += 1; }, getVoices: () => [], speak: (u) => spokenTexts.push(u.text) },
  },
  SpeechSynthesisUtterance: MockUtterance,
  Audio: MockAudio,
};

vm.createContext(sandbox);
vm.runInContext(`${snippet};
this.state = state;
this.showQuestion = showQuestion;
this.speakCurrentQuestion = speakCurrentQuestion;
this.handleManualSpeakQuestionClick = handleManualSpeakQuestionClick;
this.stopQuestionPlayback = stopQuestionPlayback;
this.setupAutoSpeakSetting = setupAutoSpeakSetting;
`, sandbox);

function resetForQuestion(storedAutoSpeak) {
  storage.clear();
  if (storedAutoSpeak !== undefined) storage.set('englishWordsGame.studyApp.autoSpeak', String(storedAutoSpeak));
  audioPlayCalls = [];
  spokenTexts = [];
  cancelled = 0;
  elements.choices.children = [];
  elements.voiceStatus.textContent = '';
  sandbox.state.questions = [{ question: 'automatic question', correct: '正解', choices: ['正解', '誤答1', '誤答2', '誤答3'], questionKey: 'w000001', id: '1' }];
  sandbox.state.index = 0;
}

(async () => {
  resetForQuestion(undefined);
  vm.runInContext('autoSpeakEnabled = loadStoredBoolean(AUTO_SPEAK_STORAGE_KEY, true);', sandbox);
  sandbox.showQuestion();
  await Promise.resolve();
  assert.deepStrictEqual(audioPlayCalls, ['http://localhost/audio/w000001.mp3'], '初期ONでは問題表示時に音声再生関数経由でMP3再生を試す');

  resetForQuestion(false);
  vm.runInContext('autoSpeakEnabled = loadStoredBoolean(AUTO_SPEAK_STORAGE_KEY, true);', sandbox);
  sandbox.showQuestion();
  await Promise.resolve();
  assert.deepStrictEqual(audioPlayCalls, [], '自動読上げOFFでは問題表示時に音声再生しない');
  assert.strictEqual(elements.voiceStatus.textContent, '自動読上げOFF');
  assert.strictEqual(elements.speakQuestionButton.disabled, false, '自動読上げOFFでも現在の問題があれば手動スピーカーボタンは有効');

  await sandbox.handleManualSpeakQuestionClick();
  await Promise.resolve();
  assert.deepStrictEqual(audioPlayCalls, ['http://localhost/audio/w000001.mp3'], '自動読上げOFFでもスピーカーボタンクリック相当の手動再生はできる');
  assert.strictEqual(elements.voiceStatus.textContent, '手動再生：MP3を再生しています', '手動再生時は状態表示に手動再生プレフィックスを付ける');

  resetForQuestion(true);
  const firstPlayback = sandbox.speakCurrentQuestion();
  sandbox.stopQuestionPlayback();
  await firstPlayback;
  assert.ok(cancelled > 0, '問題切り替え時に前のMP3/Web Speech停止処理が呼ばれる');

  console.log('tests_study_app_auto_speak: OK');
})().catch((error) => { console.error(error); process.exit(1); });
