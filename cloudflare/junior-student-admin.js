import { jsonResponse } from './junior-questions.js';
import { postGuard, databaseGuard } from './junior-student-auth.js';

export function adminStudentGetGuard({env,data}) {
  if (!data?.verifiedAdminEmail) return jsonResponse({ok:false,error:'管理者のログインが必要です。'},403);
  return databaseGuard(env);
}
export function adminStudentPostGuard({request,env,data}) {
  return adminStudentGetGuard({env,data}) || postGuard(request);
}
// Date boundaries are Japan Standard Time, including Monday-based weeks.
export function jstBoundaries(now) {
  const shift=9*60*60*1000;
  const local=new Date(now+shift);
  const year=local.getUTCFullYear(),month=local.getUTCMonth(),date=local.getUTCDate();
  const day=Date.UTC(year,month,date)-shift;
  const weekday=(local.getUTCDay()+6)%7;
  return {today:day,week:day-weekday*24*60*60*1000,
    month:Date.UTC(year,month,1)-shift};
}
