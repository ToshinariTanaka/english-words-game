import { SITE_ROLE } from '../../../../cloudflare/junior-site-role.js';
import { rejectUnauthenticatedAdminMutation } from '../../../../cloudflare/admin-mutation-guard.js';
import {
  jsonResponse, rejectRequest, readManifest, limitedJsonBody, MANIFEST_KEY,
  MODES, VERSION_RE, versionObjectKey,
} from '../../../../cloudflare/junior-questions.js';

// Commit four previously staged mode JSON objects by updating only the manifest.
// This endpoint handles just small metadata, making it suitable for Workers Free.
export async function onRequestPost({ request, env, data }) {
  const rejected = SITE_ROLE === 'admin' ? rejectUnauthenticatedAdminMutation({request,env,data}) : rejectRequest(request, env);
  if (rejected) return rejected;

  let input;
  try {
    input = await limitedJsonBody(request);
  } catch {
    return jsonResponse({ ok: false, error: '公開情報の形式が不正です。' }, 400);
  }
  const { versionId, filename, filter, counts } = input || {};
  if (input?.version !== 1 || !VERSION_RE.test(String(versionId || ''))
      || !/\.xlsx$/i.test(String(filename || '')) || String(filename).length > 180
      || !['all','a1a2','target1800'].includes(filter)
      || !counts || typeof counts !== 'object' || Array.isArray(counts)) {
    return jsonResponse({ ok: false, error: '公開情報が不正です。' }, 400);
  }
  let total = 0;
  for (const mode of MODES) {
    if (!Number.isInteger(counts[mode]) || counts[mode] < 1 || counts[mode] > 12000) {
      return jsonResponse({ ok: false, error: mode + ' の問題数が不正です。' }, 400);
    }
    total += counts[mode];
  }
  if (total > 24000) return jsonResponse({ ok: false, error: '最大24000問まで対応しています。' }, 400);
  try {
    // Prevent publishing a partial Excel upload. No heavy per-row parsing occurs.
    for (const mode of MODES) {
      const stored = await env.JUNIOR_DATA.head(versionObjectKey(versionId, mode));
      const meta = stored?.customMetadata || {};
      if (!stored || meta.mode !== mode || meta.filter !== filter
          || meta.count !== String(counts[mode])) {
        return jsonResponse({ ok: false, error: mode + ' のデータが揃っていません。' }, 409);
      }
    }
    const previous = await readManifest(env);
    const manifest = {
      version: 1, versionId, filename, filter, counts, total,
      updatedAt: new Date().toISOString(), previousVersionId: previous?.versionId || null,
    };
    const stored = await env.JUNIOR_DATA.put(MANIFEST_KEY, JSON.stringify(manifest),
      { httpMetadata: { contentType: 'application/json; charset=utf-8' } });
    if (!stored) throw new Error('Manifest write rejected');
    return jsonResponse({ ok: true, published: true, ...manifest });
  } catch {
    return jsonResponse({ ok: false, error: '教材の公開に失敗しました。以前の公開版は保持されています。' }, 503);
  }
}
