import {reportFilter} from '../../../../cloudflare/junior-learning-report.js';
import { jsonResponse } from '../../../../cloudflare/junior-questions.js';
import { adminStudentGetGuard,jstBoundaries } from '../../../../cloudflare/junior-student-admin.js';

export async function onRequestGet(context) {
  const rejected=adminStudentGetGuard(context);
  if (rejected) return rejected;
  let f; try {f=reportFilter(context.request);} catch(e){return jsonResponse({ok:false,error:e.message},400);}
  const {today,week,month}=jstBoundaries(Date.now());
  try {
    const result=await context.env.JUNIOR_DB.prepare(
      'SELECT s.student_id,s.display_name,s.status,s.must_change_password,COUNT(a.event_id) AS total_answers,'+
      'SUM(CASE WHEN a.is_correct=1 THEN 1 ELSE 0 END) AS total_correct,'+
      'COALESCE(SUM(a.active_ms),0) AS total_active_ms,'+
      'MAX(COALESCE(a.occurred_at_ms,a.received_at_ms)) AS last_study_ms,'+
      'SUM(CASE WHEN COALESCE(a.occurred_at_ms,a.received_at_ms)>=? THEN 1 ELSE 0 END) AS today_answers,'+
      'SUM(CASE WHEN COALESCE(a.occurred_at_ms,a.received_at_ms)>=? THEN 1 ELSE 0 END) AS week_answers,'+
      'SUM(CASE WHEN COALESCE(a.occurred_at_ms,a.received_at_ms)>=? THEN 1 ELSE 0 END) AS month_answers,'+
      'SUM(CASE WHEN COALESCE(a.occurred_at_ms,a.received_at_ms)>=? THEN a.active_ms ELSE 0 END) AS month_active_ms '+
      'FROM junior_students s LEFT JOIN junior_attempts a ON a.student_id=s.student_id AND COALESCE(a.occurred_at_ms,a.received_at_ms)>=? AND COALESCE(a.occurred_at_ms,a.received_at_ms)<? '+
      'GROUP BY s.student_id ORDER BY s.student_id LIMIT 500'
    ).bind(today,week,month,month,f.from,f.until).all();
    return jsonResponse({ok:true,asOf:Date.now(),timezone:'Asia/Tokyo',
      metricNote:'学習時間は端末が送信したアクティブ解答時間の合計（推定値）です。',
      students:result.results||[]});
  } catch {return jsonResponse({ok:false,error:'集計結果を取得できませんでした。'},503);}
}
