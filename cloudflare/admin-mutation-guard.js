import { jsonResponse } from './junior-questions.js';

// This is additional authorization at the API boundary. Even if a route is
// accidentally exposed, a forged email header cannot satisfy the middleware flag.
export function rejectUnauthenticatedAdminMutation({ request, env, data }) {
  if (!env?.JUNIOR_DATA) {
    return jsonResponse({ ok: false, error: '教材保存先が未設定です。' }, 503);
  }
  if (!data?.verifiedAdminEmail || typeof data.verifiedAdminEmail !== 'string') {
    return jsonResponse({ ok: false, error: '管理者ログインが必要です。' }, 403);
  }
  if (request.headers.get('Origin') !== new URL(request.url).origin
      || request.headers.get('Sec-Fetch-Site') === 'cross-site') {
    return jsonResponse({ ok: false, error: '管理者画面から操作してください。' }, 403);
  }
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type') || '')) {
    return jsonResponse({ ok: false, error: 'JSON形式で送信してください。' }, 415);
  }
  return null;
}
