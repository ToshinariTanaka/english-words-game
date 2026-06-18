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
vm.runInContext(`${snippet}; this.VOICE_STORAGE_KEY = VOICE_STORAGE_KEY; this.isSingingVoice = isSingingVoice; this.filterNarrationVoices = filterNarrationVoices; this.getDisplayVoices = getDisplayVoices; this.getRecommendedVoices = getRecommendedVoices; this.getSelectedVoice = getSelectedVoice; this.getVoiceOptionValue = getVoiceOptionValue; this.populateVoiceSelect = populateVoiceSelect; this.getAvailableVoiceCandidates = getAvailableVoiceCandidates;`, sandbox);

const voiceURIs = (voices) => Array.from(voices, (voice) => voice.voiceURI);

const normalVoice = { name: 'Microsoft Jenny Online', lang: 'en-US', voiceURI: 'normal' };
const googleVoice = { name: 'Google US English', lang: 'en-US', voiceURI: 'google' };
const songVoice = { name: 'English Singing Voice', lang: 'en-US', voiceURI: 'song' };
const japaneseSongVoice = { name: 'Apple 歌声', lang: 'ja-JP', voiceURI: 'uta' };
const langMusicVoice = { name: 'Test Voice', lang: 'en-US-musical', voiceURI: 'music-lang' };
const goodNewsVoice = { name: 'Good News', lang: 'en-US', voiceURI: 'good-news' };
const bubblesVoice = { name: 'Bubbles', lang: 'en-US', voiceURI: 'bubbles' };

assert.strictEqual(sandbox.isSingingVoice(songVoice), true, '英語の singing を含む音声を歌声扱いにする');
assert.strictEqual(sandbox.isSingingVoice(japaneseSongVoice), true, '日本語の歌声を含む音声を歌声扱いにする');
assert.strictEqual(sandbox.isSingingVoice(langMusicVoice), true, 'lang 側の musical を含む音声を歌声扱いにする');
assert.strictEqual(sandbox.isSingingVoice(goodNewsVoice), true, 'Good News / en-US を特殊音声として除外する');
assert.strictEqual(sandbox.isSingingVoice(bubblesVoice), true, 'Bubbles / en-US を特殊音声として除外する');
assert.strictEqual(sandbox.isSingingVoice(normalVoice), false, '通常の英語音声は歌声扱いにしない');
assert.strictEqual(sandbox.isSingingVoice(googleVoice), false, 'Google US English は通常音声として残す');

const filtered = sandbox.filterNarrationVoices([normalVoice, songVoice, japaneseSongVoice, goodNewsVoice, bubblesVoice, googleVoice]);
assert.deepStrictEqual(voiceURIs(filtered), ['normal', 'google'], '歌声・特殊効果系キーワードを含む音声だけ除外する');

const displayVoices = sandbox.getDisplayVoices([normalVoice, songVoice, { name: 'Japanese Voice', lang: 'ja-JP', voiceURI: 'ja' }]);
assert.deepStrictEqual(voiceURIs(displayVoices), ['song', 'normal', 'ja'], '表示候補は全音声を優先言語順で広く表示する');

const manyVoices = [
  normalVoice,
  googleVoice,
  { name: 'Microsoft Aria Natural Online', lang: 'en-US', voiceURI: 'aria' },
  { name: 'Microsoft Guy Natural Online', lang: 'en-US', voiceURI: 'guy' },
  { name: 'Microsoft Ava Natural Online', lang: 'en-US', voiceURI: 'ava' },
  { name: 'Microsoft Andrew Natural Online', lang: 'en-US', voiceURI: 'andrew' },
  { name: 'Microsoft Emma Natural Online', lang: 'en-US', voiceURI: 'emma' },
  { name: 'Microsoft Brian Natural Online', lang: 'en-US', voiceURI: 'brian' },
  { name: 'Microsoft Ryan Natural Online', lang: 'en-US', voiceURI: 'ryan' },
  { name: 'Microsoft Libby Natural Online', lang: 'en-GB', voiceURI: 'libby' },
  { name: 'Microsoft Sonia Natural Online', lang: 'en-GB', voiceURI: 'sonia' },
  { name: 'Microsoft Natasha Natural Online', lang: 'en-AU', voiceURI: 'natasha' },
  { name: 'Microsoft William Natural Online', lang: 'en-AU', voiceURI: 'william' },
  goodNewsVoice,
  bubblesVoice,
];
assert.ok(sandbox.getRecommendedVoices(manyVoices).length <= 10, 'おすすめ候補は最大10件以内にする');
assert.ok(voiceURIs(sandbox.getRecommendedVoices(manyVoices)).includes('normal'), 'Microsoft Jenny Online は通常音声として残る');
assert.ok(voiceURIs(sandbox.getRecommendedVoices(manyVoices)).includes('google'), 'Google US English は通常音声として残る');

availableVoices = [normalVoice, songVoice, japaneseSongVoice, goodNewsVoice, bubblesVoice, googleVoice];
stored.set(sandbox.VOICE_STORAGE_KEY, sandbox.getVoiceOptionValue(goodNewsVoice));
sandbox.populateVoiceSelect();
assert.strictEqual(stored.get(sandbox.VOICE_STORAGE_KEY), sandbox.getVoiceOptionValue(goodNewsVoice), '保存済み固定音声が good news でも保持する');
assert.strictEqual(voiceSelect.value, sandbox.getVoiceOptionValue(goodNewsVoice), '候補内の保存済み固定音声を復元する');
assert.ok(options.some((option) => /sing|歌声|good news|bubbles/i.test(option.textContent)), '音声選択プルダウンには特殊音声も表示する');
assert.strictEqual(voiceCandidateCount.textContent, '音声候補：6件', '候補数を表示する');
assert.strictEqual(sandbox.getSelectedVoice().voiceURI, 'good-news', '明示選択した特殊音声は固定音声として取得できる');

stored.set(sandbox.VOICE_STORAGE_KEY, sandbox.getVoiceOptionValue(bubblesVoice));
sandbox.populateVoiceSelect();
assert.strictEqual(stored.get(sandbox.VOICE_STORAGE_KEY), sandbox.getVoiceOptionValue(bubblesVoice), '保存済み固定音声が bubbles でも保持する');

availableVoices = manyVoices;
const candidates = sandbox.getAvailableVoiceCandidates();
assert.ok(candidates.length <= 10, 'ランダム候補はおすすめ候補として最大10件以内にする');
assert.ok(candidates.every((voice) => !/sing|歌声|good news|bubbles/i.test(`${voice.name} ${voice.lang}`)), 'ランダム候補も特殊音声を含まない');

availableVoices = [songVoice, japaneseSongVoice, goodNewsVoice, bubblesVoice];
assert.deepStrictEqual(voiceURIs(sandbox.getAvailableVoiceCandidates()), [], 'すべて除外された場合は候補なしとして Web Speech API の自動音声に任せる');


const twentyFiveVoices = Array.from({ length: 25 }, (_, index) => ({
  name: `Manual Voice ${String(index + 1).padStart(2, '0')}`,
  lang: index % 2 === 0 ? 'en-US' : 'en-GB',
  voiceURI: `manual-${index + 1}`,
}));
availableVoices = twentyFiveVoices;
sandbox.populateVoiceSelect();
assert.strictEqual(options.length, 27, '20件以上の音声でも自動・ランダムを含めて10件に制限しない');
assert.strictEqual(voiceCandidateCount.textContent, '音声候補：25件', '20件以上の候補数を表示する');

const oneHundredThirtyVoices = Array.from({ length: 130 }, (_, index) => ({
  name: `Large Voice ${String(index + 1).padStart(3, '0')}`,
  lang: index < 30 ? 'en-US' : index < 55 ? 'en-GB' : index < 80 ? 'en-AU' : index < 100 ? 'en-CA' : index < 115 ? 'en-IN' : 'ja-JP',
  voiceURI: `large-${index + 1}`,
}));
availableVoices = oneHundredThirtyVoices;
sandbox.populateVoiceSelect();
assert.strictEqual(options.length, 132, '100件以上の音声でも自動・ランダムを含めて候補として表示できる');
assert.strictEqual(voiceCandidateCount.textContent, '音声候補：130件', '100件以上の候補数を表示する');
assert.deepStrictEqual(options.slice(2, 7).map((option) => option.value), ['large-1', 'large-2', 'large-3', 'large-4', 'large-5'], 'en-US を最優先で表示する');
assert.ok(options.findIndex((option) => option.value === 'large-31') > options.findIndex((option) => option.value === 'large-30'), 'en-GB は en-US の後に表示する');

console.log('tests_study_app_voice_filter: OK');
