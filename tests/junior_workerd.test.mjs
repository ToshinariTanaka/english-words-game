import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {build} from 'esbuild';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
test('workerd + hosted PBKDF2 cap + D1: create, login, password change, sync and dashboard',async()=>{
 const bundled=await build({entryPoints:[new URL('./fixtures/junior-workerd-worker.mjs',import.meta.url).pathname],bundle:true,write:false,format:'esm'});
 const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:bundled.outputFiles[0].text,compatibilityDate:'2026-10-01',d1Databases:['JUNIOR_DB']}));
 try {
  const db=await mf.getD1Database('JUNIOR_DB');
  for(const filename of ['0001_student_learning.sql','0002_attempt_study_time.sql']){
   const sql=readFileSync(new URL('../migrations/d1-junior/'+filename,import.meta.url),'utf8').replace(/^--.*$/gm,'');
   for(const statement of sql.split(';').map(s=>s.trim()).filter(Boolean))await db.prepare(statement).run();
  }
  let cookie='';
  async function call(path,body){return mf.dispatchFetch('https://local.test'+path,{method:body?'POST':'GET',headers:{Origin:'https://local.test','Content-Type':'application/json',Cookie:cookie},...(body?{body:JSON.stringify(body)}:{})});}
  const created=await call('/create',{studentId:'DUMMY001'});assert.equal(created.status,201);const temporary=(await created.json()).temporaryPassword;
  const logged=await call('/login',{studentId:'DUMMY001',password:temporary});assert.equal(logged.status,200);cookie=logged.headers.get('Set-Cookie').split(';')[0];
  const changed=await call('/change',{currentPassword:temporary,newPassword:'WorkerdOnlyDummyPass42!'});assert.equal(changed.status,200);
  const record={studentId:'DUMMY001',attempts:[{eventId:crypto.randomUUID(),mode:'word',questionKey:'w000001',correct:false,activeMs:5400,occurredAtMs:Date.now()}]};
  assert.equal((await call('/attempts',record)).status,200);assert.equal((await (await call('/attempts',record)).json()).inserted,0);
  const report=await (await call('/summary')).json();assert.equal(report.students[0].total_answers,1);assert.equal(report.students[0].total_active_ms,5400);
  const d=await (await call('/detail?studentId=DUMMY001')).json();assert.equal(d.weak[0].question_key,'w000001');assert.equal(d.stats.correct,0);
 }finally{await mf.dispose();}
});
