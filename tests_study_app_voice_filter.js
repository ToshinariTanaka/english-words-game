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
  innerHTML: '',
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

const normalVoice = { name: 'Microsoft Jenny Online', lang: 'en-US', voiceURI: 'normal' };
const googleVoice = { name: 'Google US English', lang: 'en-US', voiceURI: 'google' };
const songVoice = { name: 'English Singing Voice', lang: 'en-US', voiceURI: 'song' };
const japaneseSongVoice = { name: 'Apple 歌声', lang: 'ja-JP', voiceURI: 'uta' };
const langMusicVoice = { name: 'Test Voice', lang: 'en-US-musical', voiceURI: 'music-lang' };

assert.strictEqual(sandbox.isSingingVoice(songVoice), true, '英語の singing を含む音声を歌声扱いにする');
assert.strictEqual(sandbox.isSingingVoice(japaneseSongVoice), true, '日本語の歌声を含む音声を歌声扱いにする');
assert.strictEqual(sandbox.isSingingVoice(langMusicVoice), true, 'lang 側の musical を含む音声を歌声扱いにする');
assert.strictEqual(sandbox.isSingingVoice(normalVoice), false, '通常の英語音声は歌声扱いにしない');

const filtered = sandbox.filterNarrationVoices([normalVoice, songVoice, japaneseSongVoice, googleVoice]);
assert.deepStrictEqual(filtered.map((voice) => voice.voiceURI), ['normal', 'google'], '歌声系キーワードを含む音声だけ除外する');

const displayVoices = sandbox.getDisplayVoices([normalVoice, songVoice, { name: 'Japanese Voice', lang: 'ja-JP', voiceURI: 'ja' }]);
assert.deepStrictEqual(displayVoices.map((voice) => voice.voiceURI), ['normal'], '表示候補は歌声除外後の英語音声を優先する');

availableVoices = [normalVoice, songVoice, japaneseSongVoice, googleVoice];
stored.set(sandbox.VOICE_STORAGE_KEY, sandbox.getVoiceOptionValue(songVoice));
sandbox.populateVoiceSelect();
assert.strictEqual(stored.get(sandbox.VOICE_STORAGE_KEY), '', '保存済み固定音声が除外対象なら自動選択へ戻す');
assert.strictEqual(voiceSelect.value, '', '除外済み保存音声の選択値は自動選択に戻る');
assert.ok(options.every((option) => !/sing|歌声/i.test(option.textContent)), '音声選択プルダウンに歌声系音声を表示しない');

const candidates = sandbox.getAvailableVoiceCandidates();
assert.deepStrictEqual(candidates.map((voice) => voice.voiceURI), ['normal', 'google'], 'ランダム候補も歌声除外後の候補だけにする');

availableVoices = [songVoice, japaneseSongVoice];
assert.deepStrictEqual(sandbox.getAvailableVoiceCandidates(), [], 'すべて除外された場合は候補なしとして Web Speech API の自動音声に任せる');

console.log('tests_study_app_voice_filter: OK');
