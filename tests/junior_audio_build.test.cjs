const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { createHash, webcrypto } = require('node:crypto');
const { JSDOM } = require('jsdom');
const { build } = require('../scripts/build-static-junior');
test('compiled student UI uses saved MP3 on iPhone and scoring/answer logging still run once', async () => {
  build();
  const dom = new JSDOM(readFileSync('dist-junior/index.html', 'utf8'), { url: 'https://student.test', runScripts: 'outside-only' });
  const w = dom.window, played = [], attempts = [];
  w.TextEncoder = TextEncoder;
  Object.defineProperty(w, 'crypto', { value: webcrypto });
  Object.defineProperty(w.navigator, 'userAgent', { value: 'iPhone Version/18.0 Mobile Safari/604.1' });
  w.UpJuniorStudent = { studentId: 'DUMMY001', questionShown() {}, recordAnswer: item => attempts.push(item) };
  w.HTMLElement.prototype.scrollIntoView = () => {};
  w.speechSynthesis = { cancel() {}, getVoices: () => [], addEventListener() {}, speak() { assert.fail('must use MP3 on iPhone'); } };
  w.Audio = class extends w.EventTarget { constructor(url) { super(); this.url = url; } play() { played.push(this.url); return Promise.resolve(); } pause() {} removeAttribute() {} load() {} };
  const asset = 'a'.repeat(64), hash = createHash('sha256').update('read').digest('hex');
  w.fetch = async () => new Response(JSON.stringify({ schema_version: 1, mode: 'word', entries: { w000001: { text_sha256: hash, voices: { nova: { asset_id: asset }, ash: { asset_id: asset } } } } }));
  w.eval(readFileSync('dist-junior/junior-saved-audio.js', 'utf8'));
  const source = readFileSync('dist-junior/script.js', 'utf8');
  w.eval(source.slice(0, source.indexOf('\nasync function initApp()')) + `
    setupVoiceSelect(); soundEnabled=false;
    state.mode='word'; state.questions=[{questionKey:'w000001',question:'read',correct:'読む',choices:['読む','書く','聞く','話す']}];
    state.index=0; showQuestion(); window.testAnswer=answer;
  `);
  try {
    for (let n = 0; n < 100 && !played.length; n++) await new Promise(r => setTimeout(r, 5));
    assert.equal(w.document.getElementById('voiceSelect').value, 'nova');
    assert.match(played[0], /voice=nova/);
    w.testAnswer('読む'); w.testAnswer('読む');
    assert.equal(attempts.length, 1); assert.equal(attempts[0].correct, true);
    assert.equal(w.document.getElementById('answeredCount').textContent, '1');
    assert.equal(w.document.getElementById('correctCount').textContent, '1');
  } finally { w.UpJuniorAudio.stop(); w.close(); }
});
