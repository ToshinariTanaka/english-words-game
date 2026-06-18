const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const source = fs.readFileSync('study-app/script.js', 'utf8');
const start = source.indexOf('const MODES =');
const end = source.indexOf('function setLoadingState');
const snippet = source.slice(start, end);

const stored = new Map();
const options = [];
const voiceSelect = {
  value: '',
  _innerHTML: '',
  get innerHTML() { return this._innerHTML; },
  set innerHTML(value) { this._innerHTML = value; options.length = 0; },
  appendChild(option) { options.push(option); },
  addEventListener() {},
};
const voiceStatus = { textContent: '' };
const voiceCandidateCount = { textContent: '' };
let availableVoices = [];

const sandbox = {
  console,
  Math,
  localStorage: {
    getItem: (key) => (stored.has(key) ? stored.get(key) : null),
    setItem: (key, value) => stored.set(key, String(value)),
  },
  document: {
    querySelectorAll: () => [],
    getElementById: (id) => {
      if (id === 'voiceSelect') return voiceSelect;
      if (id === 'voiceStatus') return voiceStatus;
      if (id === 'voiceCandidateCount') return voiceCandidateCount;
      return {};
    },
    createElement: (tag) => ({ tag, value: '', textContent: '' }),
  },
  window: {
    location: { origin: 'http://localhost', hostname: 'localhost' },
    speechSynthesis: {
      getVoices: () => availableVoices,
    },
  },
};
vm.createContext(sandbox);
vm.runInContext(`${snippet}; this.VOICE_STORAGE_KEY = VOICE_STORAGE_KEY; this.ALLOWED_STUDY_VOICES = ALLOWED_STUDY_VOICES; this.isSingingVoice = isSingingVoice; this.filterNarrationVoices = filterNarrationVoices; this.getDisplayVoices = getDisplayVoices; this.getRecommendedVoices = getRecommendedVoices; this.getSelectedVoice = getSelectedVoice; this.getVoiceOptionValue = getVoiceOptionValue; this.populateVoiceSelect = populateVoiceSelect; this.getAvailableVoiceCandidates = getAvailableVoiceCandidates; this.getAutoVoiceCandidate = getAutoVoiceCandidate; this.pickRandomVoice = pickRandomVoice;`, sandbox);

const voiceURIs = (voices) => Array.from(voices, (voice) => voice.voiceURI);
const optionLabels = () => options.map((option) => option.textContent);

const allowedVoices = [
  { name: 'Junior', lang: 'en-US', voiceURI: 'junior' },
  { name: 'Kathy', lang: 'en-US', voiceURI: 'kathy' },
  { name: 'Ralph', lang: 'en-US', voiceURI: 'ralph' },
  { name: 'Samantha', lang: 'en-US', voiceURI: 'samantha' },
  { name: 'Daniel', lang: 'en-GB', voiceURI: 'daniel' },
  { name: 'Karen', lang: 'en-AU', voiceURI: 'karen' },
  { name: 'Moria', lang: 'en-IE', voiceURI: 'moria' },
  { name: 'Rishi', lang: 'en-IN', voiceURI: 'rishi' },
  { name: 'Tessa', lang: 'en-ZA', voiceURI: 'tessa' },
  { name: 'Fred', lang: 'en-US', voiceURI: 'fred' },
];
const disallowedVoices = [
  { name: 'Ava', lang: 'en-US', voiceURI: 'ava' },
  { name: 'Jenny', lang: 'en-US', voiceURI: 'jenny' },
  { name: 'Aria', lang: 'en-US', voiceURI: 'aria' },
  { name: 'Microsoft Guy', lang: 'en-US', voiceURI: 'microsoft-guy' },
  { name: 'Google US English', lang: 'en-US', voiceURI: 'google-us-english' },
  { name: 'Good News', lang: 'en-US', voiceURI: 'good-news' },
  { name: 'Bubbles', lang: 'en-US', voiceURI: 'bubbles' },
];

assert.strictEqual(sandbox.isSingingVoice(disallowedVoices[5]), true, 'Good News / en-US を特殊音声として判定する');
assert.strictEqual(sandbox.isSingingVoice(disallowedVoices[6]), true, 'Bubbles / en-US を特殊音声として判定する');

availableVoices = [
  disallowedVoices[0],
  allowedVoices[4],
  allowedVoices[0],
  disallowedVoices[4],
  allowedVoices[9],
  allowedVoices[1],
  allowedVoices[3],
  allowedVoices[2],
  disallowedVoices[1],
  allowedVoices[7],
  allowedVoices[5],
  allowedVoices[8],
  disallowedVoices[2],
  allowedVoices[6],
  disallowedVoices[3],
];
sandbox.populateVoiceSelect();

const expectedAllowedLabels = [
  'Junior / en-US',
  'Kathy / en-US',
  'Ralph / en-US',
  'Samantha / en-US',
  'Daniel / en-GB',
  'Karen / en-AU',
  'Moria / en-IE',
  'Rishi / en-IN',
  'Tessa / en-ZA',
  'Fred / en-US',
];
assert.deepStrictEqual(optionLabels(), ['自動選択', 'ランダム', ...expectedAllowedLabels], '表示順は自動・ランダムの後に指定リスト順にする');
expectedAllowedLabels.forEach((label) => {
  assert.ok(optionLabels().includes(label), `${label} が候補に出ること`);
});
['Ava', 'Jenny', 'Aria', 'Microsoft Guy', 'Google US English'].forEach((name) => {
  assert.ok(!optionLabels().some((label) => label.includes(name)), `${name} は候補に出さない`);
});
assert.strictEqual(voiceCandidateCount.textContent, '音声候補：10件', '候補数は指定リストから実際に取得できた件数を表示する');

assert.deepStrictEqual(voiceURIs(sandbox.getAvailableVoiceCandidates()), ['junior', 'kathy', 'ralph', 'samantha', 'daniel', 'karen', 'moria', 'rishi', 'tessa', 'fred'], 'ランダム候補は指定10種類だけにする');
assert.strictEqual(sandbox.getAutoVoiceCandidate().voiceURI, 'junior', '自動選択候補も指定10種類の先頭から選ぶ');

stored.set(sandbox.VOICE_STORAGE_KEY, sandbox.getVoiceOptionValue(allowedVoices[4]));
sandbox.populateVoiceSelect();
assert.strictEqual(voiceSelect.value, 'daniel', '保存済み音声が許可候補内にあれば復元する');
assert.strictEqual(stored.get(sandbox.VOICE_STORAGE_KEY), 'daniel', '許可候補内の保存値は保持する');

stored.set(sandbox.VOICE_STORAGE_KEY, 'ava');
sandbox.populateVoiceSelect();
assert.strictEqual(voiceSelect.value, '', '保存済み音声が許可候補外なら自動選択へ戻る');
assert.strictEqual(stored.get(sandbox.VOICE_STORAGE_KEY), '', '保存済み音声が許可候補外なら保存値をクリアする');

availableVoices = [
  { name: 'junior', lang: 'EN-us', voiceURI: 'junior-case' },
  { name: 'KATHY', lang: 'en-US', voiceURI: 'kathy-case' },
];
sandbox.populateVoiceSelect();
assert.deepStrictEqual(optionLabels(), ['自動選択', 'ランダム', 'junior / EN-us', 'KATHY / en-US'], '一致判定は voice.name と voice.lang を大文字小文字を区別せず行う');
assert.strictEqual(voiceCandidateCount.textContent, '音声候補：2件', '一部だけ取得できた場合は取得できた件数を表示する');

availableVoices = disallowedVoices;
stored.set(sandbox.VOICE_STORAGE_KEY, 'google-us-english');
sandbox.populateVoiceSelect();
assert.deepStrictEqual(optionLabels(), ['自動選択', 'ランダム'], '指定10種類が1つも取得できない場合は固定音声候補を表示しない');
assert.strictEqual(voiceCandidateCount.textContent, '音声候補：0件', '候補0件を表示する');
assert.strictEqual(sandbox.getSelectedVoice(), null, '候補0件では固定音声を取得しない');
assert.strictEqual(sandbox.getAutoVoiceCandidate(), null, '候補0件では自動音声を指定しない');
assert.strictEqual(sandbox.pickRandomVoice(), null, '候補0件ではランダム音声を指定しない');
assert.strictEqual(stored.get(sandbox.VOICE_STORAGE_KEY), '', '取得できない保存済み音声はクリアする');

console.log('tests_study_app_voice_filter: OK');
