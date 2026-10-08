import { MODES, jsonResponse, readManifest, versionObjectKey } from '../../../cloudflare/junior-questions.js';

export async function onRequestGet({ request, env }) {
  const mode = new URL(request.url).searchParams.get('mode') || 'word';
  if (!MODES.includes(mode)) return jsonResponse({ ok: false, error: '不正な学習モードです。' }, 400);
  if (!env.JUNIOR_DATA) return jsonResponse({ ok: false, error: '教材保存先が未設定です。' }, 503);
  try {
    const manifest = await readManifest(env);
    if (!manifest) return jsonResponse({ ok: false, error: '共通教材はまだ公開されていません。' }, 404);
    const stored = await env.JUNIOR_DATA.get(versionObjectKey(manifest.versionId, mode));
    if (!stored) return jsonResponse({ ok: false, error: '公開教材が見つかりません。' }, 503);
    // Stream prevalidated public JSON directly from R2. This avoids parsing and
    // re-serializing thousands of questions on Workers Free's CPU budget.
    return new Response(stored.body, {
      status: 200,
      headers: { 'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
    });
  } catch {
    return jsonResponse({ ok: false, error: '教材の読み込みに失敗しました。' }, 503);
  }
}
