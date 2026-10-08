import { jsonResponse, readManifest } from '../../../cloudflare/junior-questions.js';

export async function onRequestGet({ env }) {
  if (!env.JUNIOR_DATA) return jsonResponse({ ok: false, error: '教材保存先が未設定です。' }, 503);
  try {
    const manifest = await readManifest(env);
    if (!manifest) return jsonResponse({ ok: true, published: false });
    const { filename, updatedAt, filter, counts, versionId } = manifest;
    return jsonResponse({ ok: true, published: true, filename, updatedAt, filter, counts, versionId });
  } catch {
    return jsonResponse({ ok: false, error: '公開状況を確認できません。' }, 503);
  }
}
