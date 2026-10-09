import { jsonResponse } from '../../../../cloudflare/junior-questions.js';
import { adminStudentPostGuard } from '../../../../cloudflare/junior-student-admin.js';
import { normalizeStudentId,limitedStudentBody,makeTemporaryPassword,makePasswordRecord } from '../../../../cloudflare/junior-student-auth.js';

export async function onRequestPost(context) {
  const rejected=adminStudentPostGuard(context);
  if (rejected) return rejected;
  let body;
  try {body=await limitedStudentBody(context.request);}
  catch {return jsonResponse({ok:false,error:'入力形式が不正です。'},400);}
  const id=normalizeStudentId(body.studentId);
  if (!id) return jsonResponse({ok:false,error:'生徒IDが不正です。'},400);
  const now=Date.now(), password=makeTemporaryPassword();
  const record=await makePasswordRecord(password);
  try {
    const result=await context.env.JUNIOR_DB.prepare(
      'UPDATE junior_students SET password_salt=?,password_hash=?,password_iterations=?,must_change_password=1,failed_login_count=0,locked_until_ms=0,updated_at_ms=? WHERE student_id=?'
    ).bind(record.password_salt,record.password_hash,record.password_iterations,now,id).run();
    if (!result.meta?.changes) return jsonResponse({ok:false,error:'生徒IDが見つかりません。'},404);
    await context.env.JUNIOR_DB.prepare(
      'UPDATE junior_sessions SET revoked_at_ms=? WHERE student_id=? AND revoked_at_ms IS NULL'
    ).bind(now,id).run();
    return jsonResponse({ok:true,studentId:id,temporaryPassword:password,mustChangePassword:true});
  } catch {return jsonResponse({ok:false,error:'パスワードを再設定できませんでした。'},503);}
}
