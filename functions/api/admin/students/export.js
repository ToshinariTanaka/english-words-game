import { jsonResponse } from '../../../../cloudflare/junior-questions.js';
import { adminStudentGetGuard } from '../../../../cloudflare/junior-student-admin.js';
import { reportFilter, STUDIED_AT as time,csvLine,csvHeaders,jstDateTime } from '../../../../cloudflare/junior-learning-report.js';
export async function onRequestGet(context) {
  const denied=adminStudentGetGuard(context); if (denied) return denied;
  let f; try {f=reportFilter(context.request);} catch(e){return jsonResponse({ok:false,error:e.message},400);}
  const db=context.env.JUNIOR_DB;
  const type=f.q.get('type')||'attempts';
  if (!['summary','attempts'].includes(type)) return jsonResponse({ok:false,error:'CSVの種類が不正です。'},400);
  try {
    if (type==='summary') {
      const r=await db.prepare(`SELECT s.student_id,s.display_name,s.status,COUNT(a.event_id) AS answers,COALESCE(SUM(a.is_correct),0) AS correct,COALESCE(SUM(a.active_ms),0) AS active_ms,MAX(${time}) AS last_study_ms FROM junior_students s LEFT JOIN junior_attempts a ON s.student_id=a.student_id AND ${time}>=? AND ${time}<? WHERE (? IS NULL OR s.student_id=?) GROUP BY s.student_id ORDER BY s.student_id`).bind(f.from,f.until,f.id,f.id).all();
      const csv='\uFEFF'+csvLine(['生徒ID','表示名','状態','解答数','正解数','正答率(%)','推定学習時間(秒)','最終学習日時(日本時間)'])+(r.results||[]).map(s=>csvLine([s.student_id,s.display_name,s.status,s.answers,s.correct,s.answers?(100*s.correct/s.answers).toFixed(1):'',(s.active_ms/1000).toFixed(1),jstDateTime(s.last_study_ms)])).join('');
      return new Response(csv,{headers:csvHeaders('junior-students-summary.csv')});
    }
    // Bounded pages avoid D1's per-invocation query limit for long histories.
    // The UI assembles all pages using a stable rowid watermark, with no cap.
    const cursor=Number(f.q.get('cursor')||0);
    const supplied=f.q.get('snapshot');
    const snapshot=supplied===null?(await db.prepare('SELECT COALESCE(MAX(rowid),0) AS n FROM junior_attempts').first()).n:Number(supplied);
    if(!Number.isSafeInteger(cursor)||cursor<0||!Number.isSafeInteger(snapshot)||snapshot<0||cursor>snapshot)return jsonResponse({ok:false,error:'CSVのページ指定が不正です。'},400);
    const r=await db.prepare(`SELECT a.rowid AS cursor,a.student_id,s.display_name,a.event_id,a.mode,a.question_key,a.is_correct,a.active_ms,${time} AS studied_at,a.received_at_ms FROM junior_attempts a JOIN junior_students s ON s.student_id=a.student_id WHERE a.rowid>? AND a.rowid<=? AND ${time}>=? AND ${time}<? AND (? IS NULL OR a.student_id=?) ORDER BY a.rowid LIMIT 1001`).bind(cursor,snapshot,f.from,f.until,f.id,f.id).all();
    const rows=(r.results||[]).slice(0,1000);
    const heading=cursor===0?'\uFEFF'+csvLine(['生徒ID','表示名','解答ID','モード','問題ID','正解','推定学習時間(秒)','学習日時(日本時間)','受信日時(日本時間)']):'';
    const content=heading+rows.map(a=>csvLine([a.student_id,a.display_name,a.event_id,a.mode,a.question_key,a.is_correct,(a.active_ms/1000).toFixed(1),jstDateTime(a.studied_at),jstDateTime(a.received_at_ms)])).join('');
    const headers={...csvHeaders('junior-learning-attempts.csv'),'X-Junior-Snapshot':String(snapshot),'X-Junior-Row-Count':String(rows.length)};
    if((r.results||[]).length>1000)headers['X-Junior-Next-Cursor']=String(rows.at(-1).cursor);
    return new Response(content,{headers});
  } catch {return jsonResponse({ok:false,error:'CSVを作成できませんでした。'},503);}
}
