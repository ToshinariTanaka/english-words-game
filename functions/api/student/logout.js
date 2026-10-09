import { jsonResponse } from '../../../cloudflare/junior-questions.js';
import { postGuard, databaseGuard, requestSessionToken, sha256Text, expiredSessionCookie } from '../../../cloudflare/junior-student-auth.js';

export async function onRequestPost({ request, env }) {
  const rejected = postGuard(request) || databaseGuard(env);
  if (rejected) return rejected;
  try {
    const raw = requestSessionToken(request);
    if (raw) await env.JUNIOR_DB.prepare(
      'UPDATE junior_sessions SET revoked_at_ms=? WHERE token_hash=?'
    ).bind(Date.now(),await sha256Text(raw)).run();
    return jsonResponse({ok:true},200,{'Set-Cookie':expiredSessionCookie()});
  } catch {
    return jsonResponse({ok:false,error:'ログアウトできませんでした。'},503);
  }
}
