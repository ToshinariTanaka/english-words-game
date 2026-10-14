import test from 'node:test';
import assert from 'node:assert/strict';
import { getAudioManifest, getAudioFile } from '../cloudflare/junior-audio.mjs';
const release = 'r'.replace('r', 'b').repeat(64), asset = 'a'.repeat(64), fileHash = 'c'.repeat(64);
const prefix = `audio/junior/releases/${release}/word.json`;
const file = `audio/junior/nova/word/w000001/${asset}.mp3`;
const published = { schema_version: 1, kind: 'published_audio', release_id: release, mode: 'word', entries: {
  w000001: { text_sha256: 'd'.repeat(64), voices: { nova: { asset_id: asset, bytes: 10, duration_ms: 1000, file_sha256: fileHash, status: 'verified' } } },
} };
function fixture(manifest = published) {
  const rows = new Map([
    ['audio/junior/current.json', JSON.stringify({ release_id: release })], [prefix, JSON.stringify(manifest)], [file, '0123456789'],
  ]);
  const reads = [];
  const bucket = {
    async get(key, options) {
      reads.push(key); const value = rows.get(key); if (value === undefined) return null;
      const range = options?.range, body = range ? value.slice(range.offset, range.offset + range.length) : value;
      return { size: value.length, text: async () => value, body: new TextEncoder().encode(body) };
    },
    async head(key) { return rows.has(key) ? { size: rows.get(key).length, customMetadata: { sha256: fileHash } } : null; },
  };
  const ctx = (path, options = {}) => ({ request: new Request('https://student.test' + path, options), env: { JUNIOR_AUDIO: bucket } });
  return { rows, reads, ctx };
}
const url = `/api/audio/file?mode=word&key=w000001&voice=nova&asset=${asset}`;
test('missing binding is an unpublished 404, invalid modes fail before R2 access', async () => {
  assert.equal((await getAudioManifest({ request: new Request('https://student.test/api/audio/manifest'), env: {} })).status, 404);
  const f = fixture(); assert.equal((await getAudioManifest(f.ctx('/api/audio/manifest?mode=../'))).status, 400); assert.equal(f.reads.length, 0);
});
test('only published verified assets appear; offline plans are never playable manifests', async () => {
  const f = fixture(); const data = await (await getAudioManifest(f.ctx('/api/audio/manifest?mode=word'))).json();
  assert.equal(data.entries.w000001.voices.nova.asset_id, asset);
  const bad = fixture({ ...published, kind: 'generation_plan' });
  assert.equal((await getAudioManifest(bad.ctx('/api/audio/manifest'))).status, 503);
  assert.equal((await getAudioFile(f.ctx(url.replace('voice=nova', 'voice=ash')))).status, 404);
  assert.equal((await getAudioFile(f.ctx(url.replace('key=w000001', 'key=c000001')))).status, 400);
  assert.equal((await getAudioFile(f.ctx(url.replace(asset, 'e'.repeat(64))))).status, 404);
});
test('R2 delivery supports GET HEAD ranges and validators without exposing other objects', async () => {
  const f = fixture(); let res = await getAudioFile(f.ctx(url));
  assert.equal(res.status, 200); assert.equal(await res.text(), '0123456789'); assert.equal(res.headers.get('Content-Type'), 'audio/mpeg');
  res = await getAudioFile(f.ctx(url, { method: 'HEAD' })); assert.equal(await res.text(), ''); assert.equal(res.headers.get('Content-Length'), '10');
  for (const [range, text] of [['bytes=2-4', '234'], ['bytes=-3', '789'], ['bytes=8-', '89'], ['bytes=8-100', '89']]) {
    res = await getAudioFile(f.ctx(url, { headers: { Range: range } })); assert.equal(res.status, 206); assert.equal(await res.text(), text);
  }
  res = await getAudioFile(f.ctx(url, { headers: { 'If-None-Match': '"' + fileHash + '"' } })); assert.equal(res.status, 304);
  res = await getAudioFile(f.ctx(url, { headers: { Range: 'bytes=0-1', 'If-Range': '"old"' } })); assert.equal(res.status, 200);
  for (const range of ['bytes=10-', 'bytes=4-2', 'bytes=0-1,4-5', 'bytes=-0', 'bytes=9007199254740992-']) {
    res = await getAudioFile(f.ctx(url, { headers: { Range: range } })); assert.equal(res.status, 416);
  }
  f.rows.set(file, 'bad'); assert.equal((await getAudioFile(f.ctx(url))).status, 503);
});
