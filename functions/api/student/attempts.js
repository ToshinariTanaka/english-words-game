import { jsonResponse } from '../../../cloudflare/junior-questions.js';
import {
  databaseGuard, postGuard, limitedStudentBody, getStudentSession,
  sessionRequired, passwordChangeRequired,
} from '../../../cloudflare/junior-student-auth.js';

const PREFIX={word:'w',chunk:'c',phrase:'p',definition:'s'};
const EVENT_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function cleanAttempts(attempts) {
  if (!Array.isArray(attempts) || !attempts.length || attempts.length>40) return null;
  const ids=new Set();
  return attempts.every(a=>{
    if (!a || typeof a!=='object' || Array.isArray(a) || !EVENT_RE.test(a.eventId)
        || !Object.hasOwn(PREFIX,a.mode)
        || !new RegExp('^'+PREFIX[a.mode]+'\\d{6}$').test(a.questionKey)
        || typeof a.correct!=='boolean'
        || !Number.isInteger(a.activeMs) || a.activeMs<0 || a.activeMs>120000
        || ids.has(a.eventId)) return false;
    ids.add(a.eventId);
    return true;
  })?attempts:null;
}
export async function onRequestPost({request,env}) {
  const rejected = postGuard(request)||databaseGuard(env);
  if (rejected) return rejected;
  let body;
  try {body=await limitedStudentBody(request);}
  catch {return jsonResponse({ok:false,error:'送信データが不正です。'},400);}
  const attempts=cleanAttempts(body.attempts);
  if (!attempts) return jsonResponse({ok:false,error:'解答記録が不正です（最大40件）。'},400);
  try {
    const session=await getStudentSession(request,env);
    if (!session) return sessionRequired();
    if (session.must_change_password) return passwordChangeRequired();
    const now=Date.now();
    const statements=attempts.map(a=>env.JUNIOR_DB.prepare(
      'INSERT OR IGNORE INTO junior_attempts (student_id,event_id,mode,question_key,is_correct,active_ms,received_at_ms) VALUES (?,?,?,?,?,?,?)'
    ).bind(session.student_id,a.eventId.toLowerCase(),a.mode,a.questionKey,a.correct?1:0,a.activeMs,now));
    const results=await env.JUNIOR_DB.batch(statements);
    return jsonResponse({ok:true,received:attempts.length,
      inserted:results.reduce((n,r)=>n+Math.max(0,Number(r.meta?.changes)||0),0)});
  } catch {
    return jsonResponse({ok:false,error:'学習記録を保存できませんでした。'},503);
  }
}
