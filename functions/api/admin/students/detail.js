import { jsonResponse } from '../../../../cloudflare/junior-questions.js';
import { adminStudentGetGuard } from '../../../../cloudflare/junior-student-admin.js';
import { reportFilter, STUDIED_AT as time } from '../../../../cloudflare/junior-learning-report.js';
export async function onRequestGet(context) {
  const denied=adminStudentGetGuard(context); if (denied) return denied;
  let f; try {f=reportFilter(context.request,true);} catch(e){return jsonResponse({ok:false,error:e.message},400);}
  const before=Number(f.q.get('before')||Number.MAX_SAFE_INTEGER);
  if (!Number.isSafeInteger(before)||before<1) return jsonResponse({ok:false,error:'履歴のページ指定が不正です。'},400);
  const db=context.env.JUNIOR_DB;
  try {
    const student=await db.prepare('SELECT student_id,display_name,status,must_change_password FROM junior_students WHERE student_id=?').bind(f.id).first();
    if (!student) return jsonResponse({ok:false,error:'生徒IDが見つかりません。'},404);
    const where=`a.student_id=? AND ${time}>=? AND ${time}<?`;
    const args=[f.id,f.from,f.until];
    const stats=await db.prepare(`SELECT COUNT(*) AS answers,COALESCE(SUM(is_correct),0) AS correct,COALESCE(SUM(active_ms),0) AS active_ms,MAX(${time}) AS last_study_ms FROM junior_attempts a WHERE ${where}`).bind(...args).first();
    const daily=await db.prepare(`SELECT strftime('%Y-%m-%d',${time}/1000,'unixepoch','+9 hours') AS day,COUNT(*) AS answers,SUM(is_correct) AS correct,SUM(active_ms) AS active_ms FROM junior_attempts a WHERE ${where} GROUP BY day ORDER BY day DESC LIMIT 366`).bind(...args).all();
    const weak=await db.prepare(`SELECT mode,question_key,COUNT(*) AS answers,SUM(is_correct) AS correct,SUM(1-is_correct) AS mistakes,MAX(${time}) AS last_study_ms FROM junior_attempts a WHERE ${where} GROUP BY mode,question_key HAVING SUM(1-is_correct)>0 ORDER BY CAST(SUM(is_correct) AS REAL)/COUNT(*),mistakes DESC,question_key LIMIT 101`).bind(...args).all();
    const history=await db.prepare(`SELECT a.rowid AS cursor,event_id,mode,question_key,is_correct,active_ms,${time} AS occurred_at_ms,received_at_ms FROM junior_attempts a WHERE ${where} AND a.rowid<? ORDER BY a.rowid DESC LIMIT 51`).bind(...args,before).all();
    const rows=history.results||[];
    return jsonResponse({ok:true,student,stats,daily:daily.results||[],weak:(weak.results||[]).slice(0,100),weakTruncated:(weak.results||[]).length>100,history:rows.slice(0,50),nextBefore:rows.length>50?rows[49].cursor:null,timezone:'Asia/Tokyo'});
  } catch {return jsonResponse({ok:false,error:'学習詳細を取得できませんでした。接続・追加マイグレーションを確認してください。'},503);}
}
