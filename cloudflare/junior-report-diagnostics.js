import {jsonResponse} from './junior-questions.js';

// Called only after the authenticated summary query fails. Inspect fixed schema
// metadata, never student records or raw error messages, and never migrate here.
export async function learningReportFailure(db) {
  const fail=(code,error)=>jsonResponse({ok:false,code,error:error+'（'+code+'）'},503);
  try {
    const students=await db.prepare('PRAGMA table_info("junior_students")').all();
    const attempts=await db.prepare('PRAGMA table_info("junior_attempts")').all();
    if(!Array.isArray(students.results)||!Array.isArray(attempts.results))throw new Error('Invalid metadata');
    if(!students.results.length||!attempts.results.length){
      return fail('DB_TABLES_MISSING','学習管理用のテーブルが見つかりません。接続先と初期設定の確認が必要です。');
    }
    const studentColumns=new Set(students.results.map(row=>row.name));
    const attemptColumns=new Set(attempts.results.map(row=>row.name));
    if(['student_id','display_name','status','must_change_password'].some(name=>!studentColumns.has(name))||
       ['student_id','event_id','is_correct','active_ms','received_at_ms'].some(name=>!attemptColumns.has(name))){
      return fail('DB_SCHEMA_MISMATCH','学習管理データベースの構成がアプリと一致しません。接続先と更新状況の確認が必要です。');
    }
    if(!attemptColumns.has('occurred_at_ms')){
      return fail('DB_STUDY_TIME_MISSING','学習日時の保存欄がまだ追加されていません。学習管理データベースの更新が必要です。');
    }
    return fail('DB_SUMMARY_FAILED','集計結果を取得できませんでした。必要な保存欄は存在していますが、集計処理の調査が必要です。');
  }catch{
    return fail('DB_CHECK_FAILED','集計とデータベースの状態確認に失敗しました。接続先やサービスの状態を確認してください。');
  }
}
