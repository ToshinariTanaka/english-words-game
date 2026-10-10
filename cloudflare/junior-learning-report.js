import { normalizeStudentId } from './junior-student-auth.js';
export const STUDIED_AT = 'COALESCE(a.occurred_at_ms,a.received_at_ms)';
const DAY = 86400000;
function dateMs(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('日付は年月日で指定してください。');
  const ms=Date.parse(value+'T00:00:00+09:00');
  if (!Number.isFinite(ms) || new Date(ms+9*3600000).toISOString().slice(0,10)!==value) throw new Error('日付が不正です。');
  return ms;
}
export function reportFilter(request, requireStudent=false) {
  const q=new URL(request.url).searchParams;
  const id=q.has('studentId')?normalizeStudentId(q.get('studentId')):null;
  if ((requireStudent||q.has('studentId'))&&!id) throw new Error('生徒IDを指定してください。');
  const from=q.get('from')?dateMs(q.get('from')):0;
  const until=q.get('to')?dateMs(q.get('to'))+DAY:8640000000000000;
  if (from>=until) throw new Error('開始日は終了日以前にしてください。');
  return {id,from,until,q};
}
export function csvCell(value) {
  let s=String(value??'');
  // Excel formula injection, including leading spaces/control characters.
  if (/^[\s\uFEFF]*[=+@-]/.test(s)) s="'"+s;
  return '"'+s.replaceAll('"','""')+'"';
}
export function csvLine(row) { return row.map(csvCell).join(',')+'\r\n'; }
export function jstDateTime(ms) {
  return ms==null?'':new Date(Number(ms)+9*3600000).toISOString().replace('T',' ').slice(0,19)+' +09:00';
}
export function csvHeaders(filename) {return {
  'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="'+filename+'"',
  'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff',
};}
