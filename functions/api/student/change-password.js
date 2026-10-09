import { jsonResponse } from '../../../cloudflare/junior-questions.js';
import {
  databaseGuard, postGuard, limitedStudentBody, getStudentSession, sessionRequired,
  validatePassword, checkStudentPassword, makePasswordRecord,
} from '../../../cloudflare/junior-student-auth.js';

// A student can update only their own password after proving the current one.
export async function onRequestPost({request,env}) {
  const rejected = postGuard(request) || databaseGuard(env);
  if (rejected) return rejected;
  let body;
  try { body = await limitedStudentBody(request); }
  catch { return jsonResponse({ok:false,error:'入力形式が正しくありません。'},400); }
  if (!validatePassword(body.newPassword)
      || body.newPassword === body.currentPassword) {
    return jsonResponse({ok:false,error:'新しいパスワードは12文字以上で以前と異なるものにしてください。'},400);
  }
  try {
    const session = await getStudentSession(request,env);
    if (!session) return sessionRequired();
    const student = await env.JUNIOR_DB.prepare(
      'SELECT password_salt,password_hash,password_iterations FROM junior_students WHERE student_id=?'
    ).bind(session.student_id).first();
    if (!await checkStudentPassword(body.currentPassword,student)) {
      return jsonResponse({ok:false,error:'現在のパスワードが違います。'},403);
    }
    const record = await makePasswordRecord(body.newPassword);
    const now = Date.now();
    await env.JUNIOR_DB.prepare(
      'UPDATE junior_students SET password_salt=?,password_hash=?,password_iterations=?,must_change_password=0,updated_at_ms=? WHERE student_id=?'
    ).bind(record.password_salt,record.password_hash,record.password_iterations,now,session.student_id).run();
    // Log out other devices after a password change. Keep this tab's session.
    await env.JUNIOR_DB.prepare(
      'UPDATE junior_sessions SET revoked_at_ms=? WHERE student_id=? AND token_hash<>? AND revoked_at_ms IS NULL'
    ).bind(now,session.student_id,session.token_hash).run();
    return jsonResponse({ok:true});
  } catch {
    return jsonResponse({ok:false,error:'パスワードを変更できませんでした。'},503);
  }
}
