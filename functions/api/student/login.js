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
      // Increment inside SQLite so concurrent wrong guesses cannot lose counts.
      await env.JUNIOR_DB.prepare(
        'UPDATE junior_students SET locked_until_ms=CASE WHEN failed_login_count+1>=? THEN ? ELSE locked_until_ms END, failed_login_count=(failed_login_count+1)%?,updated_at_ms=? WHERE student_id=? AND password_hash=? AND status=\'active\' AND locked_until_ms<=?'
      ).bind(MAX_FAILURES,now+LOCK_MS,MAX_FAILURES,now,id,student.password_hash,now).run();
      return jsonResponse({ok:false,error:'生徒IDまたはパスワードが違います。'},401);
    }
    const token = createSessionToken();
    const hash = await sha256Text(token);
    // A simultaneous reset/disable must not allow a stale password verification
    // to create a new session. Guard insertion against the current credential.
    const results=await env.JUNIOR_DB.batch([
      env.JUNIOR_DB.prepare(
        "INSERT INTO junior_sessions (token_hash,student_id,created_at_ms,expires_at_ms) SELECT ?,student_id,?,? FROM junior_students WHERE student_id=? AND password_hash=? AND status='active' AND locked_until_ms<=?"
      ).bind(hash,now,now+SESSION_SECONDS*1000,id,student.password_hash,now),
      env.JUNIOR_DB.prepare(
        "UPDATE junior_students SET failed_login_count=0,locked_until_ms=0 WHERE student_id=? AND password_hash=? AND status='active' AND locked_until_ms<=?"
      ).bind(id,student.password_hash,now),
    ]);
    if (!results[0].meta?.changes) return jsonResponse({ok:false,error:'生徒IDまたはパスワードが違います。'},401);
    return jsonResponse({ok:true,studentId:id,mustChangePassword:Boolean(student.must_change_password)},200,{
      'Set-Cookie': sessionCookie(token),
    });
  } catch {
    return jsonResponse({ok:false,error:'現在ログイン処理を利用できません。'},503);
  }
}
