import {
  jsonResponse, rejectRequest, limitedJsonBody, validateRelease,
  readManifest, MANIFEST_KEY, versionObjectKey,
} from '../../../../cloudflare/junior-questions.js';

export async function onRequestPost({ request, env }) {
  const rejected = rejectRequest(request, env);
  if (rejected) return rejected;

  let cleaned;
  try {
    cleaned = validateRelease(await limitedJsonBody(request));
  } catch (error) {
    const tooLarge = error.message === 'FILE_TOO_LARGE';
    return jsonResponse({ ok: false, error: tooLarge ? 'ファイルが大きすぎます（上限12MB）。'
      : '教材データを確認してください：' + (error.message || '不正なデータ') }, tooLarge ? 413 : 400);
  }

  try {
    const previous = await readManifest(env);
    const versionId = new Date().toISOString().replace(/[-:.]/g, '')
      + '-' + crypto.randomUUID().replace(/-/g, '').slice(0, 12);
    const options = { httpMetadata: { contentType: 'application/json; charset=utf-8' } };
    // Write all four immutable objects before replacing the public manifest.
    // A failed upload therefore leaves the previous publication intact.
    for (const mode of ['word', 'chunk', 'phrase', 'definition']) {
      const stored = await env.JUNIOR_DATA.put(
        versionObjectKey(versionId, mode), JSON.stringify(cleaned.modes[mode]), options);
      if (!stored) throw new Error('R2 object could not be stored');
    }
    const manifest = {
      versionId, version: 1, filename: cleaned.filename, filter: cleaned.filter,
      updatedAt: new Date().toISOString(), counts: cleaned.counts, total: cleaned.total,
      previousVersionId: previous?.versionId || null,
    };
    const savedManifest = await env.JUNIOR_DATA.put(MANIFEST_KEY, JSON.stringify(manifest), options);
    if (!savedManifest) throw new Error('R2 manifest could not be stored');
    return jsonResponse({ ok: true, published: true, ...manifest });
  } catch {
    return jsonResponse({ ok: false, error: '公開保存に失敗しました。以前の公開データは保持されています。' }, 503);
  }
}
