import { jsonResponse } from '../../../../cloudflare/junior-questions.js';
import { adminStudentGetGuard, adminStudentPostGuard } from '../../../../cloudflare/junior-student-admin.js';
import {
  normalizeStudentId, makeTemporaryPassword, makePasswordRecord, limitedStudentBody,
  passwordProcessingUnavailable,
} from '../../../../cloudflare/junior-student-auth.js';

// Available only on the separate Access-protected admin Pages project.
// The public student site's Pages Functions never set data.verifiedAdminEmail.
export async function onRequestGet(context) {
  const rejected=adminStudentGetGuard(context);
  if (rejected) return rejected;
  try {
    const results=await context.env.JUNIOR_DB.prepare(
      'SELECT student_id,display_name,status,must_change_password,created_at_ms FROM junior_students ORDER BY student_id LIMIT 500'
    ).all();
    return jsonResponse({ok:true,students:results.results||[]});
  } catch {return jsonResponse({ok:false,error:'生徒一覧を取得できませんでした。'},503);}
}

export async function onRequestPost(context) {
  const rejected=adminStudentPostGuard(context);
  if (rejected) return rejected;
  let body;
  try {body=await limitedStudentBody(context.request);}
  catch {return jsonResponse({ok:false,error:'入力形式が正しくありません。'},400);}
  const id=normalizeStudentId(body.studentId);
  const displayName=String(body.displayName ?? '').trim();
  if (!id || displayName.length>60 || /[\u0000-\u001f\u007f]/.test(displayName)) {
    return jsonResponse({ok:false,error:'生徒IDまたは表示名が不正です。'},400);
  }
  const tempPassword=makeTemporaryPassword();
  let record;
  try { record=await makePasswordRecord(tempPassword); }
  catch (error) { return passwordProcessingUnavailable(error); }
  const now=Date.now();
  try {
    await context.env.JUNIOR_DB.prepare(
      'INSERT INTO junior_students (student_id,display_name,password_salt,password_hash,password_iterations,must_change_password,status,created_at_ms,updated_at_ms) VALUES (?,?,?,?,?,1,?,?,?)'
    ).bind(id,displayName,record.password_salt,record.password_hash,record.password_iterations,
      'active',now,now).run();
    // Temporary password is shown ONCE. It is never written to D1 or logs.
    return jsonResponse({ok:true,studentId:id,temporaryPassword:tempPassword,
      mustChangePassword:true},201);
  } catch {
    return jsonResponse({ok:false,error:'登録できませんでした。IDの重複を確認してください。'},409);
  }
}
