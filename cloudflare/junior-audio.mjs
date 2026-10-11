// Read-only audio delivery. No OpenAI key, generation, uploads, or D1 writes.
const MODES = { word: 'w', chunk: 'c', phrase: 'p', definition: 's' };
const HASH = /^[a-f0-9]{64}$/;
const VOICES = ['nova', 'ash'];
const POINTER = 'audio/junior/current.json';
const MAX_MANIFEST_BYTES = 8 * 1024 * 1024;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: {
    'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  } });
}
function validKey(mode, key) { return Object.hasOwn(MODES, mode) && new RegExp('^' + MODES[mode] + '\\d{6}$').test(key); }
function objectKey(mode, key, voice, asset) { return `audio/junior/${voice}/${mode}/${key}/${asset}.mp3`; }
async function readPublished(env, mode) {
  if (!env.JUNIOR_AUDIO) return null;
  const pointer = await env.JUNIOR_AUDIO.get(POINTER);
  if (!pointer) return null;
  if (pointer.size > 4096) throw new Error('pointer');
  const release = JSON.parse(await pointer.text());
  if (!HASH.test(release.release_id || '')) throw new Error('release');
  const object = await env.JUNIOR_AUDIO.get(`audio/junior/releases/${release.release_id}/${mode}.json`);
  if (!object || object.size > MAX_MANIFEST_BYTES) throw new Error('manifest');
  const data = JSON.parse(await object.text());
  if (data.schema_version !== 1 || data.kind !== 'published_audio' || data.mode !== mode
      || data.release_id !== release.release_id || !data.entries || typeof data.entries !== 'object' || Array.isArray(data.entries)) throw new Error('manifest');
  const entries = {};
  for (const [key, item] of Object.entries(data.entries)) {
    if (!validKey(mode, key) || !HASH.test(item?.text_sha256 || '')) throw new Error('entry');
    const voices = {};
    for (const voice of VOICES) {
      const asset = item.voices?.[voice];
      if (!asset) continue;
      if (asset.status !== 'verified' || !HASH.test(asset.asset_id || '') || !HASH.test(asset.file_sha256 || '')
          || !Number.isSafeInteger(asset.bytes) || asset.bytes <= 0 || asset.bytes > 20 * 1024 * 1024
          || !Number.isFinite(asset.duration_ms) || asset.duration_ms <= 0) throw new Error('asset');
      voices[voice] = { asset_id: asset.asset_id, bytes: asset.bytes,
        duration_ms: asset.duration_ms, file_sha256: asset.file_sha256 };
    }
    entries[key] = { text_sha256: item.text_sha256, voices };
  }
  return { schema_version: 1, mode, release_id: release.release_id, entries };
}
export async function getAudioManifest({ request, env }) {
  const mode = new URL(request.url).searchParams.get('mode') || 'word';
  if (!Object.hasOwn(MODES, mode)) return json({ error: '不正な学習モードです。' }, 400);
  try {
    const data = await readPublished(env, mode);
    return data ? json(data) : json({ error: '保存音声はまだ公開されていません。' }, 404);
  } catch { return json({ error: '保存音声の確認に失敗しました。' }, 503); }
}
function byteRange(value, size) {
  if (!value) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(value);
  if (!match || (!match[1] && !match[2])) throw new Error('range');
  let start, end;
  if (!match[1]) {
    const suffix = Number(match[2]);
    if (!Number.isSafeInteger(suffix) || suffix <= 0) throw new Error('range');
    start = Math.max(0, size - suffix); end = size - 1;
  } else {
    start = Number(match[1]); end = match[2] ? Number(match[2]) : size - 1;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= size || end < start) throw new Error('range');
    end = Math.min(end, size - 1);
  }
  return { offset: start, length: end - start + 1 };
}
export async function getAudioFile({ request, env }) {
  const params = new URL(request.url).searchParams;
  const mode = params.get('mode'), key = params.get('key'), voice = params.get('voice'), id = params.get('asset');
  if (!validKey(mode, key) || !VOICES.includes(voice) || !HASH.test(id || '')) return json({ error: '不正な音声指定です。' }, 400);
  try {
    const manifest = await readPublished(env, mode);
    const asset = manifest?.entries[key]?.voices[voice];
    if (!asset || asset.asset_id !== id) return json({ error: '音声が見つかりません。' }, 404);
    const path = objectKey(mode, key, voice, id);
    const metadata = await env.JUNIOR_AUDIO.head(path);
    if (!metadata || metadata.size !== asset.bytes || metadata.customMetadata?.sha256 !== asset.file_sha256) {
      return json({ error: '音声ファイルの確認に失敗しました。' }, 503);
    }
    const etag = '"' + asset.file_sha256 + '"';
    const headers = new Headers({ 'Content-Type': 'audio/mpeg', 'Accept-Ranges': 'bytes',
      'Cache-Control': 'public, max-age=86400, immutable', 'ETag': etag, 'X-Content-Type-Options': 'nosniff' });
    if (request.headers.get('If-None-Match') === etag) return new Response(null, { status: 304, headers });
    let range;
    try {
      const ifRange = request.headers.get('If-Range');
      range = byteRange(!ifRange || ifRange === etag ? request.headers.get('Range') : null, asset.bytes);
    } catch {
      return new Response(null, { status: 416, headers: { 'Content-Range': 'bytes */' + asset.bytes, 'Cache-Control': 'no-store' } });
    }
    headers.set('Content-Length', String(range ? range.length : asset.bytes));
    if (range) headers.set('Content-Range', `bytes ${range.offset}-${range.offset + range.length - 1}/${asset.bytes}`);
    if (request.method === 'HEAD') return new Response(null, { status: range ? 206 : 200, headers });
    const object = await env.JUNIOR_AUDIO.get(path, range ? { range } : undefined);
    if (!object?.body) return json({ error: '音声が見つかりません。' }, 404);
    return new Response(object.body, { status: range ? 206 : 200, headers });
  } catch { return json({ error: '音声を読み込めませんでした。' }, 503); }
}
