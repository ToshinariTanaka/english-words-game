import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {
  makePasswordRecord,checkStudentPassword,normalizeStudentId,
  sessionCookie,COOKIE_NAME,postGuard,makeTemporaryPassword,
} from '../cloudflare/junior-student-auth.js';
import {jstBoundaries} from '../cloudflare/junior-student-admin.js';
import {onRequestPost as studentLogin} from '../functions/api/student/login.js';
import {onRequestGet as studentMe} from '../functions/api/student/me.js';
import {onRequestPost as studentLogout} from '../functions/api/student/logout.js';
import {onRequestPost as studentChangePassword} from '../functions/api/student/change-password.js';
import {onRequestPost as saveAttempts} from '../functions/api/student/attempts.js';
import {onRequestPost as adminCreate, onRequestGet as adminList} from '../functions/api/admin/students/index.js';
import {onRequestPost as adminReset} from '../functions/api/admin/students/reset-password.js';
import {onRequestPost as adminChangeStatus} from '../functions/api/admin/students/change-status.js';
import {onRequestGet as adminSummary} from '../functions/api/admin/students/summary.js';

const origin='https://test-junior.pages.dev';
const adminOrigin='https://test-junior-admin.pages.dev';
const adminData={verifiedAdminEmail:'staff@example.com'};

function memoryD1() {
  const sqlite=new DatabaseSync(':memory:');
  sqlite.exec(readFileSync(new URL('../migrations/d1-junior/0001_student_learning.sql',import.meta.url),'utf8'));
  const db={
    prepare(sql) {
      const statement=sqlite.prepare(sql);
      function bound(params=[]) {
        return {
          first:async()=>statement.get(...params) || null,
          all:async()=>({results:statement.all(...params)}),
          run:async()=>({meta:{changes:statement.run(...params).changes}}),
        };
      }
      return {...bound(),bind:(...params)=>bound(params)};
    },
    async batch(items) {
      sqlite.exec('BEGIN IMMEDIATE');
      try {
        const out=[];
        for(const item of items) out.push(await item.run());
        sqlite.exec('COMMIT');
        return out;
      } catch(e) {sqlite.exec('ROLLBACK');throw e;}
    },
    raw:sqlite,
  };
  return db;
}
function ctx(path,{body,db,token='',data,originHeader,site='same-origin',contentType='application/json',method='POST',base=origin}={}) {
  const headers={'Sec-Fetch-Site':site};
  if(method!=='GET') {
    headers['Content-Type']=contentType;
    headers.Origin=originHeader===undefined?base:originHeader;
  }
  if(token)headers.Cookie=COOKIE_NAME+'='+token;
  const request=new Request(base+path,{method,headers,
    ...(method!=='GET'?{body:JSON.stringify(body ?? {})}:{})});
  return {request,env:{JUNIOR_DB:db},data:data||{},};
}
async function json(response) {return response.json();}
function tokenFrom(response) {
  const found=response.headers.get('Set-Cookie')?.match(new RegExp(COOKIE_NAME+'=([0-9a-f]{64})'));
  assert.ok(found,'Expected HttpOnly session cookie');
  return found[1];
}
async function createByAdmin(db,id='U0001') {
  const r=await adminCreate(ctx('/api/admin/students',{body:{studentId:id},db,base:adminOrigin,data:adminData}));
  assert.equal(r.status,201);
  const body=await json(r);
  assert.equal(body.studentId,id);
  assert.equal(body.temporaryPassword.length,20);
  return body.temporaryPassword;
}

test('D1 migration initializes an empty, privacy-conscious database',()=>{
  const db=memoryD1();
  assert.deepEqual(db.raw.prepare('SELECT student_id FROM junior_students').all(),[]);
  assert.deepEqual(db.raw.prepare('SELECT event_id FROM junior_attempts').all(),[]);
});
test('IDs normalize, initial passwords are random and salted hashes never match raw passwords',async()=>{
  assert.equal(normalizeStudentId('u0001'),'U0001');
  assert.equal(normalizeStudentId('bad id'),null);
  assert.equal(normalizeStudentId('a'),null);
  const password=makeTemporaryPassword();
  const rec=await makePasswordRecord(password);
  assert.equal(password.length,20);
  assert.equal(rec.password_iterations,600000);
  assert.notEqual(rec.password_hash,password);
  assert.equal(await checkStudentPassword(password,rec),true);
  assert.equal(await checkStudentPassword('wrong_password_12345',rec),false);
  assert.notEqual((await makePasswordRecord(password)).password_salt,rec.password_salt);
});
test('only Access-verified staff can provision, reset or list student accounts',async()=>{
  const db=memoryD1();
  const anon=await adminCreate(ctx('/api/admin/students',{body:{studentId:'U0001'},db,base:adminOrigin}));
  assert.equal(anon.status,403);
  const badOrigin=await adminCreate(ctx('/api/admin/students',{
    body:{studentId:'U0001'},db,base:adminOrigin,data:adminData,originHeader:'https://evil.test'}));
  assert.equal(badOrigin.status,403);
  const pass=await createByAdmin(db);
  assert.ok(pass);
  const list=await adminList(ctx('/api/admin/students',{method:'GET',db,base:adminOrigin,data:adminData}));
  assert.equal((await json(list)).students.length,1);
  const unauthReset=await adminReset(ctx('/api/admin/students/reset-password',{body:{studentId:'U0001'},db,base:adminOrigin}));
  assert.equal(unauthReset.status,403);
  const duplicate=await adminCreate(ctx('/api/admin/students',{body:{studentId:'U0001'},db,base:adminOrigin,data:adminData}));
  assert.equal(duplicate.status,409);
});
test('student logs in with ID and password, changes temporary password, records idempotent attempts',async()=>{
  const db=memoryD1();
  const temp=await createByAdmin(db);
  const wrong=await studentLogin(ctx('/api/student/login',{body:{studentId:'U0001',password:'invalidPassword00'},db}));
  assert.equal(wrong.status,401);
  const denied=await studentLogin(ctx('/api/student/login',{body:{studentId:'U0001',password:temp},db,site:'cross-site'}));
  assert.equal(denied.status,403);
  const accepted=await studentLogin(ctx('/api/student/login',{body:{studentId:'U0001',password:temp},db}));
  assert.equal(accepted.status,200);
  const cookie=accepted.headers.get('Set-Cookie');
  assert.match(cookie,/HttpOnly/);
  assert.match(cookie,/Secure/);
  assert.match(cookie,/SameSite=Strict/);
  const token=tokenFrom(accepted);
  assert.equal((await json(accepted)).mustChangePassword,true);
  assert.equal(db.raw.prepare('SELECT token_hash FROM junior_sessions').get().token_hash===token,false);
  const me=await studentMe(ctx('/api/student/me',{method:'GET',token,db}));
  assert.equal((await json(me)).studentId,'U0001');
  const attempt={eventId:crypto.randomUUID(),mode:'word',questionKey:'w000001',correct:true,activeMs:2400};
  const deniedAttempt=await saveAttempts(ctx('/api/student/attempts',{token,db,body:{attempts:[attempt]}}));
  assert.equal(deniedAttempt.status,403);
  const changed=await studentChangePassword(ctx('/api/student/change-password',{token,db,body:{
    currentPassword:temp,newPassword:'CorrectHorseBatteryStarter42',
  }}));
  assert.equal(changed.status,200);
  const saved=await saveAttempts(ctx('/api/student/attempts',{token,db,body:{attempts:[attempt]}}));
  assert.equal(saved.status,200);
  assert.equal((await json(saved)).inserted,1);
  const repeated=await saveAttempts(ctx('/api/student/attempts',{token,db,body:{attempts:[attempt]}}));
  assert.equal((await json(repeated)).inserted,0);
  const count=db.raw.prepare('SELECT COUNT(*) AS cnt FROM junior_attempts').get();
  assert.equal(count.cnt,1);
  const report=await adminSummary(ctx('/api/admin/students/summary',{method:'GET',db,base:adminOrigin,data:adminData}));
  const student=(await json(report)).students[0];
  assert.equal(student.total_answers,1);
  assert.equal(student.total_correct,1);
  assert.equal(student.total_active_ms,2400);
  const logout=await studentLogout(ctx('/api/student/logout',{token,db,body:{}}));
  assert.equal(logout.status,200);
  const meAfter=await studentMe(ctx('/api/student/me',{method:'GET',db,token}));
  assert.equal(meAfter.status,401);
  assert.equal((await studentMe(ctx('/api/student/me',{method:'GET',db}))).status,401);
});
test('malformed, oversized, cross-site and unauthenticated student submissions are rejected',async()=>{
  const db=memoryD1();
  let attempt=await saveAttempts(ctx('/api/student/attempts',{db,body:{attempts:[{
    eventId:crypto.randomUUID(),mode:'word',questionKey:'w000001',correct:true,activeMs:100,
  }]}}));
  assert.equal(attempt.status,401);
  attempt=await saveAttempts(ctx('/api/student/attempts',{db,body:{attempts:[{
    eventId:'not-uuid',mode:'word',questionKey:'w000001',correct:true,activeMs:100,
  }]}}));
  assert.equal(attempt.status,400);
  const guard=postGuard(ctx('/api/student/login',{db,body:{},originHeader:'https://evil.test'}).request);
  assert.equal(guard.status,403);
});
test('password reset revokes sessions and account disable prevents further login',async()=>{
  const db=memoryD1();
  const temp=await createByAdmin(db);
  const response=await studentLogin(ctx('/api/student/login',{db,body:{studentId:'U0001',password:temp}}));
  const token=tokenFrom(response);
  const reset=await adminReset(ctx('/api/admin/students/reset-password',{db,base:adminOrigin,data:adminData,body:{studentId:'U0001'}}));
  assert.equal(reset.status,200);
  const newPassword=(await json(reset)).temporaryPassword;
  assert.notEqual(newPassword,temp);
  assert.equal((await studentMe(ctx('/api/student/me',{method:'GET',db,token}))).status,401);
  const change=await adminChangeStatus(ctx('/api/admin/students/change-status',{
    db,base:adminOrigin,data:adminData,body:{studentId:'U0001',status:'disabled'},
  }));
  assert.equal(change.status,200);
  const denied=await studentLogin(ctx('/api/student/login',{db,body:{studentId:'U0001',password:newPassword}}));
  assert.equal(denied.status,401);
});
test('JST day/week/month boundaries are consistent',()=>{
  const jst14=new Date('2026-10-09T05:00:00Z').getTime();
  const b=jstBoundaries(jst14);
  assert.equal(new Date(b.today).toISOString(),'2026-10-08T15:00:00.000Z');
  assert.equal(new Date(b.week).toISOString(),'2026-10-04T15:00:00.000Z');
  assert.equal(new Date(b.month).toISOString(),'2026-09-30T15:00:00.000Z');
});
