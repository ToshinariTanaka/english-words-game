const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHash, webcrypto } = require('node:crypto');
const { JSDOM } = require('jsdom');
const { createController } = require('../study-app/junior-saved-audio');
const asset = 'a'.repeat(64);
const hash = text => createHash('sha256').update(text.trim().normalize('NFC')).digest('hex');
const question = (text = 'read', key = 'w000001') => ({ questionKey: key, question: text });
const data = { schema_version: 1, mode: 'word', entries: {
  w000001: { text_sha256: hash('read'), voices: { nova: { asset_id: asset }, ash: { asset_id: asset } } },
  w000002: { text_sha256: hash('wind'), voices: { nova: { asset_id: asset }, ash: { asset_id: asset } } },
} };
function harness(options = {}) {
  const dom = new JSDOM('<select id="voiceSelect"></select><small id="voiceCandidateCount"></small><p id="voiceStatus"></p>', { url: 'https://local.test' });
  const played = [], store = options.store || new Map();
  let cancelledSpeech = 0;
  class Audio extends dom.window.EventTarget {
    constructor(url) { super(); this.url = url; this.paused = false; played.push(this); }
    play() { return options.play ? options.play(this) : Promise.resolve(); }
    pause() { this.paused = true; }
    removeAttribute() { this.cleared = true; }
    load() {}
  }
  const host = {
    document: dom.window.document, crypto: webcrypto, Audio,
    localStorage: { getItem: k => store.get(k), setItem: (k, v) => store.set(k, v) },
    UpJuniorStudent: { studentId: options.studentId || null },
    fetch: options.fetch || (async () => new Response(JSON.stringify(data))),
    setTimeout, clearTimeout, speechSynthesis: { cancel() { cancelledSpeech++; } },
    addEventListener: dom.window.addEventListener.bind(dom.window),
  };
  const audio = createController(host, options.random || (() => 0.2));
  audio.setup(() => audio.stop());
  let fallbacks = 0;
  const speak = (q = question(), manual = true) => audio.speak({ mode: 'word', question: q, manual, fallback: () => { fallbacks++; return true; } });
  const select = voice => { const el = host.document.getElementById('voiceSelect'); el.value = voice; el.dispatchEvent(new dom.window.Event('change')); };
  const status = () => host.document.getElementById('voiceStatus').textContent;
  const close = () => { audio.stop(); dom.window.close(); };
  return { audio, host, dom, played, speak, select, status, close, store, fallbacks: () => fallbacks, cancelledSpeech: () => cancelledSpeech };
}
test('Nova is default, Ash persists per student, unknown stored values do not select arbitrary audio', () => {
  const h = harness({ studentId: 'DUMMY001' });
  assert.equal(h.host.document.getElementById('voiceSelect').value, 'nova');
  h.select('ash');
  const second = harness({ studentId: 'DUMMY001', store: h.store });
  assert.equal(second.host.document.getElementById('voiceSelect').value, 'ash');
  h.host.UpJuniorStudent.studentId = 'DUMMY002';
  h.dom.window.dispatchEvent(new h.dom.window.Event('up-junior-student-changed'));
  assert.equal(h.host.document.getElementById('voiceSelect').value, 'nova');
  h.store.set('englishWordsGame.junior.savedVoice.v1:DUMMY002', 'unknown');
  h.dom.window.dispatchEvent(new h.dom.window.Event('up-junior-student-changed'));
  assert.equal(h.host.document.getElementById('voiceSelect').value, 'nova');
  h.close(); second.close();
});
test('random chooses from both voices per question, replays stay on that voice, manual play is synchronous', async () => {
  let n = 0;
  const h = harness({ random: () => n++ % 2 ? 0.8 : 0.2 });
  h.select('random');
  await h.audio.showQuestion('word', question());
  const first = h.speak();
  assert.equal(h.played.length, 1, 'play() must run inside the click without awaiting a manifest');
  await first; await h.speak();
  assert.ok(h.played.every(a => a.url.includes('voice=nova')));
  assert.equal(h.played[0].paused, true);
  await h.audio.showQuestion('word', question('wind', 'w000002'));
  await h.speak(question('wind', 'w000002'));
  assert.match(h.played[2].url, /voice=ash/);
  assert.equal(n, 2, 'replay does not reroll'); h.close();
});
test('changed English cannot play an old MP3 with the same question key', async () => {
  const h = harness(); await h.audio.showQuestion('word', question('changed'));
  await h.speak(question('changed')); assert.equal(h.played.length, 0); assert.equal(h.fallbacks(), 1); h.close();
});
test('no published manifest keeps device speech working without mislabelling it Nova', async () => {
  const h = harness({ fetch: async () => new Response('{}', { status: 404 }) });
  await h.audio.showQuestion('word', question()); await h.speak();
  await h.speak();
  assert.equal(h.fallbacks(), 2); assert.equal(h.cancelledSpeech(), 2);
  assert.match(h.status(), /端末音声/); h.close();
});
test('loading after a manual click does not start late or read a different question', async () => {
  let release;
  const h = harness({ fetch: () => new Promise(r => { release = r; }) });
  const ready = h.audio.showQuestion('word', question());
  await h.speak(); assert.match(h.status(), /準備中/);
  h.audio.stop(); release(new Response(JSON.stringify(data))); await ready;
  assert.equal(h.played.length, 0); assert.equal(h.fallbacks(), 0); h.close();
});
test('late autoplay result after question change never starts old audio', async () => {
  let release;
  const h = harness({ fetch: () => new Promise(r => { release = r; }) });
  const ready = h.audio.showQuestion('word', question()); const oldPlay = h.speak(question(), false);
  const next = h.audio.showQuestion('word', question('wind', 'w000002'));
  release(new Response(JSON.stringify(data))); await Promise.all([ready, next, oldPlay]);
  assert.equal(h.played.length, 0); assert.equal(h.fallbacks(), 0); h.close();
});
test('browser playback denial requests a user tap instead of substituting device voice', async () => {
  const h = harness({ play: () => Promise.reject(Object.assign(new Error('blocked'), { name: 'NotAllowedError' })) });
  await h.audio.showQuestion('word', question()); await h.speak();
  assert.match(h.status(), /押して再生/); assert.equal(h.fallbacks(), 0);
  await h.speak(); assert.equal(h.played.length, 2); assert.equal(h.fallbacks(), 0); h.close();
});
test('network failure stops audio, next manual tap can speak on iOS, old play promise cannot restart it', async () => {
  let resolvePlay;
  const h = harness({ play: () => new Promise(r => { resolvePlay = r; }) });
  await h.audio.showQuestion('word', question()); const pending = h.speak();
  h.played[0].dispatchEvent(new h.dom.window.Event('error')); await pending;
  assert.equal(h.played[0].paused, true); assert.equal(h.played[0].cleared, true);
  assert.match(h.status(), /もう一度/); await h.speak(); assert.equal(h.fallbacks(), 1);
  resolvePlay(); await Promise.resolve(); assert.doesNotMatch(h.status(), /再生音声：Nova/); h.close();
});
test('network interruption after playback starts also offers device speech on the next tap', async () => {
  const h = harness();
  await h.audio.showQuestion('word', question()); await h.speak();
  assert.match(h.status(), /再生音声：Nova/);
  h.played[0].dispatchEvent(new h.dom.window.Event('error'));
  assert.equal(h.played[0].paused, true); assert.equal(h.played[0].cleared, true);
  assert.match(h.status(), /中断/); await h.speak();
  assert.equal(h.fallbacks(), 1); assert.equal(h.played.length, 1); h.close();
});
