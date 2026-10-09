import { jsonResponse } from '../../../cloudflare/junior-questions.js';
import {
  normalizeStudentId, checkStudentPassword, createSessionToken, sha256Text, sessionCookie,
  postGuard, limitedStudentBody, databaseGuard, SESSION_SECONDS,
} from '../../../cloudflare/junior-student-auth.js';

const LOCK_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;

// Login never accepts a browser-selected role or grants staff privileges.
export async function onRequestPost({ request, env }) {
  const denied = postGuard(request) || databaseGuard(env);
  if (denied) return denied;
  let body;
  try { body = await limitedStudentBody(request); }
  catch { return jsonResponse({ok:false,error:'ログイン情報が不正です。'},400); }
  const id = normalizeStudentId(body.studentId);
  const password = body.password;
  if (!id || typeof password !== 'string' || password.length > 128) {
    return jsonResponse({ok:false,error:'生徒IDまたはパスワードが違います。'},401);
  }
  const now = Date.now();
  try {
    const student = await env.JUNIOR_DB.prepare(
      'SELECT student_id, password_salt, password_hash, password_iterations, status, must_change_password, failed_login_count, locked_until_ms FROM junior_students WHERE student_id=?'
    ).bind(id).first();
    if (!student || student.status !== 'active' || student.locked_until_ms > now) {
      return jsonResponse({ok:false,error:'生徒IDまたはパスワードが違います。'},401);
    }
    const accepted = await checkStudentPassword(password, student);
    if (!accepted) {
      const failureCount = Math.max(0,Number(student.failed_login_count) || 0) + 1;
      await env.JUNIOR_DB.prepare(
        'UPDATE junior_students SET failed_login_count=?, locked_until_ms=?, updated_at_ms=? WHERE student_id=?'
      ).bind(failureCount >= MAX_FAILURES ? 0 : failureCount,
        failureCount >= MAX_FAILURES ? now + LOCK_MS : 0, now, id).run();
      return jsonResponse({ok:false,error:'生徒IDまたはパスワードが違います。'},401);
    }
    const token = createSessionToken();
    const hash = await sha256Text(token);
    await env.JUNIOR_DB.prepare(
      'INSERT INTO junior_sessions (token_hash,student_id,created_at_ms,expires_at_ms) VALUES (?,?,?,?)'
    ).bind(hash,id,now,now+SESSION_SECONDS*1000).run();
    await env.JUNIOR_DB.prepare(
      'UPDATE junior_students SET failed_login_count=0, locked_until_ms=0 WHERE student_id=?'
    ).bind(id).run();
    return jsonResponse({ok:true,studentId:id,mustChangePassword:Boolean(student.must_change_password)},200,{
      'Set-Cookie': sessionCookie(token),
    });
  } catch {
    return jsonResponse({ok:false,error:'現在ログイン処理を利用できません。'},503);
  }
}
