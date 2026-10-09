import { jsonResponse } from '../../../cloudflare/junior-questions.js';
import { databaseGuard, getStudentSession, sessionRequired } from '../../../cloudflare/junior-student-auth.js';

export async function onRequestGet({ request, env }) {
  const disabled = databaseGuard(env);
  if (disabled) return disabled;
  try {
    const session = await getStudentSession(request, env);
    if (!session) return sessionRequired();
    return jsonResponse({ok:true,studentId:session.student_id,
      mustChangePassword:Boolean(session.must_change_password)});
  } catch {
    return jsonResponse({ok:false,error:'ログイン状態を確認できません。'},503);
  }
}
