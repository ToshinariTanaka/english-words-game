import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync,backup} from 'node:sqlite';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {memoryD1,ctx,createByAdmin,tokenFrom,adminData,adminOrigin} from './junior-d1-helpers.mjs';
import {onRequestPost as login} from '../functions/api/student/login.js';
import {onRequestGet as me} from '../functions/api/student/me.js';
import {onRequestPost as changePassword} from '../functions/api/student/change-password.js';
import {onRequestPost as attempts} from '../functions/api/student/attempts.js';
import {onRequestPost as reset} from '../functions/api/admin/students/reset-password.js';
import {onRequestPost as status} from '../functions/api/admin/students/change-status.js';
import {onRequestGet as summary} from '../functions/api/admin/students/summary.js';
import {onRequestGet as detail} from '../functions/api/admin/students/detail.js';
import {onRequestGet as csv} from '../functions/api/admin/students/export.js';
import {csvCell} from '../cloudflare/junior-learning-report.js';
const get=(path,db,admin=true)=>ctx(path,{method:'GET',db,base:adminOrigin,data:admin?adminData:{}});
async function signedIn(db,id='DUMMY001') {
 const password=await createByAdmin(db,id);
 const r=await login(ctx('/api/student/login',{db,body:{studentId:id,password}}));
 assert.equal(r.status,200);const token=tokenFrom(r);
 assert.equal((await changePassword(ctx('/api/student/change-password',{db,token,body:{currentPassword:password,newPassword:'TestOnlyPassword1234!'}}))).status,200);
 return token;
}
const attempt=(extra={})=>({eventId:crypto.randomUUID(),mode:'word',questionKey:'w000001',correct:true,activeMs:2300,occurredAtMs:Date.now(),...extra});
test('delayed offline answers use original JST day; account mismatch and UUID case duplicates rejected',async()=>{
 const db=memoryD1(),token=await signedIn(db);
 const past=Date.parse('2026-09-30T14:59:59Z');
 const rows=[attempt({occurredAtMs:past}),attempt({occurredAtMs:past+1000,correct:false})];
 let r=await attempts(ctx('/api/student/attempts',{db,token,body:{studentId:'OTHER001',attempts:rows}}));assert.equal(r.status,409);
 r=await attempts(ctx('/api/student/attempts',{db,token,body:{studentId:'DUMMY001',attempts:rows}}));assert.equal(r.status,200);assert.deepEqual((await r.json()).acknowledgedEventIds,rows.map(a=>a.eventId));
 assert.equal((await (await attempts(ctx('/api/student/attempts',{db,token,body:{attempts:rows}}))).json()).inserted,0);
 const d=await (await detail(get('/detail?studentId=DUMMY001&from=2026-09-30&to=2026-09-30',db))).json();assert.equal(d.stats.answers,1);assert.equal(d.stats.correct,1);assert.equal(d.daily[0].day,'2026-09-30');
 const next=await (await detail(get('/detail?studentId=DUMMY001&from=2026-10-01&to=2026-10-01',db))).json();assert.equal(next.stats.correct,0);assert.equal(next.weak[0].mistakes,1);
 const sum=await (await summary(get('/summary?from=2026-09-30&to=2026-09-30',db))).json();assert.equal(sum.students[0].total_answers,1);
 const bad=[rows[0],{...rows[0],eventId:rows[0].eventId.toUpperCase()}];assert.equal((await attempts(ctx('/attempts',{db,token,body:{attempts:bad}}))).status,400);
 assert.equal((await attempts(ctx('/attempts',{db,token,body:{attempts:[attempt({occurredAtMs:Date.now()+600000})]}}))).status,400);
});
test('management endpoints reject students, forged identity headers and invalid filters',async()=>{
 const db=memoryD1();const token=await signedIn(db);
 for(const fn of [summary,detail,csv]){const c=get('/report?studentId=DUMMY001',db,false);c.request=new Request(c.request,{headers:{Cookie:'__Host-up_junior_session='+token,'Cf-Access-Authenticated-User-Email':'staff@example.com'}});assert.equal((await fn(c)).status,403);}
 for(const query of ['from=2026-02-30','from=2026-10-02&to=2026-10-01','studentId=bad%20id'])assert.equal((await detail(get('/detail?'+query,db))).status,400);
 assert.equal((await detail(get('/detail?studentId=MISSING001',db))).status,404);
});
test('70 student report + full paginated CSV + history pagination + safe formula cells',async()=>{
 const db=memoryD1();await createByAdmin(db,'DUMMY001');
 const base=db.raw.prepare('SELECT * FROM junior_students WHERE student_id=?').get('DUMMY001');
 const insert=db.raw.prepare('INSERT INTO junior_students (student_id,display_name,password_salt,password_hash,password_iterations,must_change_password,status,created_at_ms,updated_at_ms) VALUES (?,?,?,?,?,0,?,?,?)');
 for(let i=2;i<=70;i++)insert.run('DUMMY'+String(i).padStart(3,'0'),i===2?' =HYPERLINK("unsafe")':'ダミー'+i,base.password_salt,base.password_hash,base.password_iterations,'active',base.created_at_ms,base.updated_at_ms);
 const add=db.raw.prepare('INSERT INTO junior_attempts (student_id,event_id,mode,question_key,is_correct,active_ms,received_at_ms,occurred_at_ms) VALUES (?,?,?,?,?,?,?,?)');
 const now=Date.now();
 for(let i=0;i<1234;i++)add.run('DUMMY001',crypto.randomUUID(),'word','w'+String(i%120+1).padStart(6,'0'),i%2,2000,now,now-i*1000);
 add.run('DUMMY002',crypto.randomUUID(),'chunk','c000001',0,4000,now,null);
 const result=await (await summary(get('/summary',db))).json();assert.equal(result.students.length,70);assert.equal(result.students[0].total_answers,1234);assert.equal(result.students[0].total_correct,617);assert.equal(result.students[69].total_answers,0);
 let before=null,seen=new Set();do{const d=await (await detail(get('/detail?studentId=DUMMY001'+(before?'&before='+before:''),db))).json();for(const h of d.history){assert.ok(!seen.has(h.event_id));seen.add(h.event_id);}before=d.nextBefore;}while(before);assert.equal(seen.size,1234);
 const r=await csv(get('/export?type=attempts',db));assert.equal(r.status,200);assert.match(r.headers.get('Cache-Control'),/no-store/);const firstPage=await r.text();assert.equal(firstPage.trimEnd().split('\r\n').length,1001);const second=await csv(get('/export?type=attempts&cursor='+r.headers.get('X-Junior-Next-Cursor')+'&snapshot='+r.headers.get('X-Junior-Snapshot'),db));assert.equal(second.headers.get('X-Junior-Next-Cursor'),null);const text=firstPage+await second.text();assert.equal(text.trimEnd().split('\r\n').length,1236);assert.ok(text.includes("' =HYPERLINK"));
 const filtered=await (await csv(get('/export?type=attempts&studentId=DUMMY002',db))).text();assert.equal(filtered.trimEnd().split('\r\n').length,2);
 const totals=await (await csv(get('/export?type=summary',db))).text();assert.equal(totals.trimEnd().split('\r\n').length,71);assert.ok(!totals.includes(base.password_hash));
 assert.equal(csvCell(' @sum(A1)'), '"\' @sum(A1)"');
});
test('lockout, reset and disable revoke sessions; failed batch rolls back password reset',async()=>{
 const db=memoryD1();const password=await createByAdmin(db,'DUMMY001');
 const wrong=()=>login(ctx('/login',{db,body:{studentId:'DUMMY001',password:'WrongPassword1234!'}}));
 const outcomes=await Promise.all(Array.from({length:5},wrong));assert.ok(outcomes.every(r=>r.status===401));assert.ok(db.raw.prepare('SELECT locked_until_ms FROM junior_students').get().locked_until_ms>Date.now());
 assert.equal((await login(ctx('/login',{db,body:{studentId:'DUMMY001',password}}))).status,401);
 const rr=await reset(ctx('/reset',{db,base:adminOrigin,data:adminData,body:{studentId:'DUMMY001'}}));const temporary=(await rr.json()).temporaryPassword;
 const accepted=await login(ctx('/login',{db,body:{studentId:'DUMMY001',password:temporary}}));assert.equal(accepted.status,200);const token=tokenFrom(accepted);
 const oldHash=db.raw.prepare('SELECT password_hash FROM junior_students').get().password_hash;
 db.raw.exec("CREATE TRIGGER fail_revocation BEFORE UPDATE ON junior_sessions BEGIN SELECT RAISE(ABORT,'test fault'); END");
 assert.equal((await reset(ctx('/reset',{db,base:adminOrigin,data:adminData,body:{studentId:'DUMMY001'}}))).status,503);assert.equal(db.raw.prepare('SELECT password_hash FROM junior_students').get().password_hash,oldHash);
 db.raw.exec('DROP TRIGGER fail_revocation');
 assert.equal((await status(ctx('/status',{db,base:adminOrigin,data:adminData,body:{studentId:'DUMMY001',status:'disabled'}}))).status,200);
 assert.equal((await me(ctx('/me',{method:'GET',db,token}))).status,401);
 await status(ctx('/status',{db,base:adminOrigin,data:adminData,body:{studentId:'DUMMY001',status:'active'}}));assert.equal((await me(ctx('/me',{method:'GET',db,token}))).status,401);
});
test('isolated SQLite backup restores accounts + attempts with integrity and FK validation',async()=>{
 const db=memoryD1(),token=await signedIn(db);await attempts(ctx('/attempts',{db,token,body:{attempts:[attempt()]}}));
 const dir=mkdtempSync(join(tmpdir(),'junior-backup-test-'));const target=join(dir,'snapshot.sqlite');
 try{await backup(db.raw,target);const restored=new DatabaseSync(target);assert.equal(restored.prepare('PRAGMA integrity_check').get().integrity_check,'ok');assert.equal(restored.prepare('PRAGMA foreign_key_check').all().length,0);for(const table of ['junior_students','junior_sessions','junior_attempts'])assert.equal(restored.prepare('SELECT COUNT(*) AS n FROM '+table).get().n,db.raw.prepare('SELECT COUNT(*) AS n FROM '+table).get().n);assert.equal(restored.prepare('SELECT password_hash FROM junior_students').get().password_hash,db.raw.prepare('SELECT password_hash FROM junior_students').get().password_hash);restored.close();}finally{rmSync(dir,{recursive:true,force:true});}
});

test('password change cannot overwrite a concurrent administrator reset',async()=>{
 const db=memoryD1(),token=await signedIn(db);const originalBatch=db.batch.bind(db);
 db.batch=async items=>{db.raw.prepare("UPDATE junior_students SET password_hash=?,must_change_password=1 WHERE student_id='DUMMY001'").run('f'.repeat(64));db.raw.exec('UPDATE junior_sessions SET revoked_at_ms=1');return originalBatch(items);};
 const response=await changePassword(ctx('/change',{db,token,body:{currentPassword:'TestOnlyPassword1234!',newPassword:'AnotherDummyPassword42!'}}));
 assert.equal(response.status,403);assert.equal(db.raw.prepare('SELECT password_hash FROM junior_students').get().password_hash,'f'.repeat(64));assert.equal(db.raw.prepare('SELECT must_change_password FROM junior_students').get().must_change_password,1);
});
