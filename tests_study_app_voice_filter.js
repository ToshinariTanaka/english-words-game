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
vm.runInContext(`${snippet}; this.VOICE_STORAGE_KEY = VOICE_STORAGE_KEY; this.isSingingVoice = isSingingVoice; this.filterNarrationVoices = filterNarrationVoices; this.getDisplayVoices = getDisplayVoices; this.getVoiceOptionValue = getVoiceOptionValue; this.populateVoiceSelect = populateVoiceSelect; this.getAvailableVoiceCandidates = getAvailableVoiceCandidates;`, sandbox);

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
assert.deepStrictEqual(voiceURIs(displayVoices), ['normal'], '表示候補は特殊音声除外後の英語音声を優先する');

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
assert.ok(sandbox.getDisplayVoices(manyVoices).length <= 10, '表示候補は最大10件以内にする');
assert.ok(voiceURIs(sandbox.getDisplayVoices(manyVoices)).includes('normal'), 'Microsoft Jenny Online は通常音声として残る');
assert.ok(voiceURIs(sandbox.getDisplayVoices(manyVoices)).includes('google'), 'Google US English は通常音声として残る');

availableVoices = [normalVoice, songVoice, japaneseSongVoice, goodNewsVoice, bubblesVoice, googleVoice];
stored.set(sandbox.VOICE_STORAGE_KEY, sandbox.getVoiceOptionValue(goodNewsVoice));
sandbox.populateVoiceSelect();
assert.strictEqual(stored.get(sandbox.VOICE_STORAGE_KEY), '', '保存済み固定音声が good news なら自動選択へ戻す');
assert.strictEqual(voiceSelect.value, '', '除外済み保存音声の選択値は自動選択に戻る');
assert.ok(options.every((option) => !/sing|歌声|good news|bubbles/i.test(option.textContent)), '音声選択プルダウンに特殊音声を表示しない');

stored.set(sandbox.VOICE_STORAGE_KEY, sandbox.getVoiceOptionValue(bubblesVoice));
sandbox.populateVoiceSelect();
assert.strictEqual(stored.get(sandbox.VOICE_STORAGE_KEY), '', '保存済み固定音声が bubbles なら自動選択へ戻す');

availableVoices = manyVoices;
const candidates = sandbox.getAvailableVoiceCandidates();
assert.ok(candidates.length <= 10, 'ランダム候補も最大10件以内にする');
assert.ok(candidates.every((voice) => !/sing|歌声|good news|bubbles/i.test(`${voice.name} ${voice.lang}`)), 'ランダム候補も特殊音声を含まない');

availableVoices = [songVoice, japaneseSongVoice, goodNewsVoice, bubblesVoice];
assert.deepStrictEqual(voiceURIs(sandbox.getAvailableVoiceCandidates()), [], 'すべて除外された場合は候補なしとして Web Speech API の自動音声に任せる');

console.log('tests_study_app_voice_filter: OK');
