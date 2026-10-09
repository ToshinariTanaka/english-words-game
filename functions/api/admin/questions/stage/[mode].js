import {
  jsonResponse, rejectRequest, MODES, VERSION_RE, MAX_UPLOAD_BYTES, versionObjectKey,
} from '../../../../../cloudflare/junior-questions.js';

// Stage a single browser-validated mode as a stream, without parsing thousands
// of records inside Workers Free's limited CPU budget.
// Only the authenticated administrator can write. Staged data are not public
// until a separate publish operation atomically replaces the manifest.
export async function onRequestPost({ request, env, params }) {
  const rejected = rejectRequest(request, env);
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
  const claimed = Number(request.headers.get('Content-Length') || 0);
  if (claimed > MAX_UPLOAD_BYTES) {
    return jsonResponse({ ok: false, error: '教材データが大きすぎます。' }, 413);
  }
  if (!request.body) return jsonResponse({ ok: false, error: '教材データがありません。' }, 400);

  let bytes = 0;
  const limiter = new TransformStream({
    transform(chunk, controller) {
      bytes += chunk.byteLength;
      if (bytes > MAX_UPLOAD_BYTES) throw new Error('Payload too large');
      controller.enqueue(chunk);
    },
  });

  try {
    const stored = await env.JUNIOR_DATA.put(
      versionObjectKey(id, mode), request.body.pipeThrough(limiter), {
        httpMetadata: { contentType: 'application/json; charset=utf-8' },
        customMetadata: { mode, filter, count: String(count) },
      },
    );
    if (!stored) throw new Error('R2 write rejected');
    return jsonResponse({ ok: true, mode, count });
  } catch {
    return jsonResponse({ ok: false, error: '教材の保存に失敗しました。' }, 503);
  }
}
