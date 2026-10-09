import { jsonResponse } from '../../../../cloudflare/junior-questions.js';
import { adminStudentPostGuard } from '../../../../cloudflare/junior-student-admin.js';
import { normalizeStudentId,limitedStudentBody } from '../../../../cloudflare/junior-student-auth.js';

export async function onRequestPost(context) {
  const rejected=adminStudentPostGuard(context);
  if (rejected) return rejected;
  let body;
  try {body=await limitedStudentBody(context.request);}
  catch {return jsonResponse({ok:false,error:'入力形式が不正です。'},400);}
  const id=normalizeStudentId(body.studentId);
  if (!id || !['active','disabled'].includes(body.status)) {
    return jsonResponse({ok:false,error:'生徒IDか状態が不正です。'},400);
  }
  try {
    const now=Date.now();
    const update=context.env.JUNIOR_DB.prepare(
      'UPDATE junior_students SET status=?,updated_at_ms=? WHERE student_id=?'
    ).bind(body.status,now,id);
    const revoke=context.env.JUNIOR_DB.prepare(
      'UPDATE junior_sessions SET revoked_at_ms=? WHERE student_id=? AND revoked_at_ms IS NULL'
    ).bind(now,id);
    const [result]=await context.env.JUNIOR_DB.batch(body.status==='disabled'?[update,revoke]:[update]);
    if (!result.meta?.changes) return jsonResponse({ok:false,error:'生徒IDが見つかりません。'},404);
    return jsonResponse({ok:true,studentId:id,status:body.status});
  } catch {return jsonResponse({ok:false,error:'状態を変更できませんでした。'},503);}
}
