import {
  jsonResponse, MODES, VERSION_RE, MAX_UPLOAD_BYTES, versionObjectKey,
} from '../../../../../cloudflare/junior-questions.js';
import { rejectUnauthenticatedAdminMutation } from '../../../../../cloudflare/admin-mutation-guard.js';

// Cloudflare R2.put requires an upload body with a known byte length.
// The readable side of a generic TransformStream does not carry that length.
// Buffer one mode (bounded to 12 MiB) and pass an exact-length Uint8Array.
// The browser already validates the Excel; no CPU-expensive JSON parse is
// performed in this Worker. All staged files remain private until published.
export async function readBoundedUpload(request) {
  const reader = request.body?.getReader();
  if (!reader) throw new Error('EMPTY_BODY');
  let length = 0;
  const chunks = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_UPLOAD_BYTES) {
        await reader.cancel().catch(() => {});
        throw new Error('FILE_TOO_LARGE');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  if (!length) throw new Error('EMPTY_BODY');
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export async function onRequestPost({ request, env, data, params }) {
  const rejected = rejectUnauthenticatedAdminMutation({ request, env, data });
  if (rejected) return rejected;
  const mode = params.mode;
  const id = request.headers.get('X-Release-Id') || '';
  const filter = request.headers.get('X-Filter') || '';
  const count = Number(request.headers.get('X-Row-Count'));
  if (!MODES.includes(mode) || !VERSION_RE.test(id) ||
      !['all','a1a2','target1800'].includes(filter) ||
      !Number.isInteger(count) || count < 1 || count > 12000) {
    return jsonResponse({ ok: false, error: '公開準備データの識別情報が不正です。' }, 400);
  }

  const contentLength = request.headers.get('Content-Length');
  if (contentLength !== null) {
    const claimed = Number(contentLength);
    if (!Number.isSafeInteger(claimed) || claimed < 0) {
      return jsonResponse({ ok: false, error: '教材データの長さが不正です。' }, 400);
    }
    if (claimed > MAX_UPLOAD_BYTES) {
      return jsonResponse({ ok: false, error: '教材データが大きすぎます。' }, 413);
    }
  }

  let bytes;
  try {
    bytes = await readBoundedUpload(request);
  } catch (error) {
    if (error.message === 'FILE_TOO_LARGE') {
      return jsonResponse({ ok: false, error: '教材データが大きすぎます（上限12MB）。' }, 413);
    }
    if (error.message === 'EMPTY_BODY') {
      return jsonResponse({ ok: false, error: '教材データがありません。' }, 400);
    }
    console.error('junior_r2_upload_read_failed', { mode, errorName: error?.name || 'Error' });
    return jsonResponse({ ok: false, error: 'アップロードデータの読み込みに失敗しました。' }, 400);
  }

  try {
    const stored = await env.JUNIOR_DATA.put(versionObjectKey(id, mode), bytes, {
      httpMetadata: { contentType: 'application/json; charset=utf-8' },
      customMetadata: { mode, filter, count: String(count) },
    });
    if (!stored) throw new Error('R2 put did not store object');
    return jsonResponse({ ok: true, mode, count });
  } catch (error) {
    // Do not log request bodies, authorization headers, or secret values.
    console.error('junior_r2_put_failed', {
      mode, bytes: bytes.byteLength, errorName: error?.name || 'Error',
      reason: String(error?.message || '').slice(0, 180),
    });
    return jsonResponse({ ok: false, error: '教材の保存に失敗しました。' }, 503);
  }
}
