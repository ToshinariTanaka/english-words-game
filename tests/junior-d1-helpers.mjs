import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {COOKIE_NAME} from '../cloudflare/junior-student-auth.js';
import {onRequestPost as adminCreate} from '../functions/api/admin/students/index.js';
const origin='https://test-junior.pages.dev';
export const adminOrigin='https://test-junior-admin.pages.dev';
export const adminData={verifiedAdminEmail:'staff@example.com'};

export function memoryD1() {
  const sqlite=new DatabaseSync(':memory:');
  sqlite.exec(readFileSync(new URL('../migrations/d1-junior/0001_student_learning.sql',import.meta.url),'utf8'));
  sqlite.exec(readFileSync(new URL('../migrations/d1-junior/0002_attempt_study_time.sql',import.meta.url),'utf8'));
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
export function ctx(path,{body,db,token='',data,originHeader,site='same-origin',contentType='application/json',method='POST',base=origin}={}) {
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
export function tokenFrom(response) {
  const found=response.headers.get('Set-Cookie')?.match(new RegExp(COOKIE_NAME+'=([0-9a-f]{64})'));
  assert.ok(found,'Expected HttpOnly session cookie');
  return found[1];
}
export async function createByAdmin(db,id='U0001') {
  const r=await adminCreate(ctx('/api/admin/students',{body:{studentId:id},db,base:adminOrigin,data:adminData}));
  assert.equal(r.status,201);
  const body=await json(r);
  assert.equal(body.studentId,id);
  assert.equal(body.temporaryPassword.length,20);
  return body.temporaryPassword;
}
