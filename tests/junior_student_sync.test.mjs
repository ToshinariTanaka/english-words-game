import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {IDBFactory} from 'fake-indexeddb';
import {webcrypto} from 'node:crypto';
import {build} from '../scripts/build-static-junior.js';
const script=readFileSync(new URL('../study-app/junior-student-sync.js',import.meta.url),'utf8');
const queueScript=readFileSync(new URL('../study-app/junior-student-queue.js',import.meta.url),'utf8');
const tick=()=>new Promise(r=>setImmediate(r));
async function until(predicate){for(let i=0;i<200;i++){if(await predicate())return;await tick();}assert.fail('Timed out waiting for UI state');}
function windowFor({db,fetcher}) {
 build();const dom=new JSDOM(readFileSync(new URL('../dist-junior/index.html',import.meta.url),'utf8'),{url:'https://student.test/',runScripts:'outside-only',pretendToBeVisual:true});const w=dom.window;
 Object.defineProperty(w,'indexedDB',{value:db});Object.defineProperty(w,'crypto',{value:webcrypto});w.AbortSignal=AbortSignal;w.fetch=fetcher;
 w.eval(queueScript);w.eval(script);return dom;
}
const reply=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
test('IndexedDB outbox preserves 260 answers across reopening and concurrent tabs, partitioned by student',async()=>{
 const db=new IDBFactory();const w=new JSDOM('',{runScripts:'outside-only'}).window;w.eval(queueScript);const q1=w.UpJuniorQueue.create(db),q2=w.UpJuniorQueue.create(db);
 await Promise.all(Array.from({length:260},(_,i)=>(i%2?q1:q2).put('DUMMY001',{eventId:webcrypto.randomUUID(),occurredAtMs:i})));await q1.put('DUMMY002',{eventId:webcrypto.randomUUID(),occurredAtMs:1});await q1.close();
 assert.equal((await q2.list('DUMMY001')).length,260);const q3=w.UpJuniorQueue.create(db);const batch=(await q3.list('DUMMY001')).slice(0,40);await Promise.all([q3.acknowledge('DUMMY001',batch.map(a=>a.eventId)),q2.put('DUMMY001',{eventId:webcrypto.randomUUID(),occurredAtMs:300})]);assert.equal((await q2.list('DUMMY001')).length,221);assert.equal((await q3.list('DUMMY002')).length,1);await q2.close();await q3.close();w.close();
});
test('offline answer survives page close, another student cannot resend it, owner retries exactly same event ID',async()=>{
 const db=new IDBFactory();let active='DUMMY001',online=false,sent=[];
 const fetcher=async(path,opts)=>{
   if(path.endsWith('/me'))return reply({ok:true,studentId:active,mustChangePassword:false});
   if(path.endsWith('/attempts')){if(!online)throw new Error('offline');const body=JSON.parse(opts.body);sent.push(body);return reply({ok:true,acknowledgedEventIds:body.attempts.map(a=>a.eventId)});}
   throw new Error(path);
 };
 let dom=windowFor({db,fetcher});await until(()=>dom.window.document.getElementById('juniorStudentStatus').textContent.includes('DUMMY001'));
 dom.window.UpJuniorStudent.questionShown();await dom.window.UpJuniorStudent.recordAnswer({mode:'word',questionKey:'w000001',correct:false});
 await until(()=>dom.window.document.getElementById('juniorStudentSyncStatus').textContent.includes('未送信の記録'));
 const q=dom.window.UpJuniorQueue.create(db);const pending=await q.list('DUMMY001');assert.equal(pending.length,1);const id=pending[0].eventId;dom.window.close();
 active='DUMMY002';online=true;dom=windowFor({db,fetcher});await until(()=>dom.window.document.getElementById('juniorStudentSyncStatus').textContent.includes('未送信 0件'));assert.equal(sent.length,0);assert.equal((await q.list('DUMMY001')).length,1);dom.window.close();
 active='DUMMY001';dom=windowFor({db,fetcher});await until(async()=>(await q.list('DUMMY001')).length===0);assert.equal(sent.length,1);assert.equal(sent[0].studentId,'DUMMY001');assert.equal(sent[0].attempts[0].eventId,id);assert.equal(sent[0].attempts[0].correct,false);await q.close();dom.window.close();
});
test('incomplete acknowledgement retains data; invalid session never transfers it to a different cookie account',async()=>{
 const db=new IDBFactory();let rejected=false;
 const dom=windowFor({db,fetcher:async(path,opts)=>{
  if(path.endsWith('/me'))return reply({ok:true,studentId:'DUMMY001'});
  if(path.endsWith('/attempts'))return rejected?reply({ok:false,error:'別の生徒がログインしています。'},409):reply({ok:true,acknowledgedEventIds:[]});
 }});
 await until(()=>dom.window.document.getElementById('juniorStudentStatus').textContent.includes('DUMMY001'));
 await dom.window.UpJuniorStudent.recordAnswer({mode:'chunk',questionKey:'c000001',correct:true});const q=dom.window.UpJuniorQueue.create(db);
 await until(()=>dom.window.document.getElementById('juniorStudentSyncStatus').textContent.includes('保存確認が不完全'));
 assert.equal((await q.list('DUMMY001')).length,1);rejected=true;dom.window.document.getElementById('juniorStudentRetry').click();await until(()=>dom.window.document.getElementById('juniorStudentStatus').textContent.includes('元の生徒ID'));assert.equal((await q.list('DUMMY001')).length,1);assert.equal(dom.window.document.getElementById('juniorStudentLoginFields').hidden,false);await q.close();dom.window.close();
});
test('hidden intervals excluded, visible intervals summed and capped, IndexedDB failure is shown',async()=>{
 const db=new IDBFactory();let now=0,visible='visible';const sent=[];
 const dom=windowFor({db,fetcher:async(path,opts)=>{if(path.endsWith('/me'))return reply({ok:true,studentId:'DUMMY001'});const data=JSON.parse(opts.body);sent.push(data);return reply({ok:true,acknowledgedEventIds:data.attempts.map(a=>a.eventId)});}});
 const w=dom.window;Object.defineProperty(w.performance,'now',{value:()=>now});Object.defineProperty(w.document,'visibilityState',{get:()=>visible});await until(()=>w.document.getElementById('juniorStudentStatus').textContent.includes('DUMMY001'));
 w.UpJuniorStudent.questionShown();now=2000;visible='hidden';w.document.dispatchEvent(new w.Event('visibilitychange'));now=62000;visible='visible';w.document.dispatchEvent(new w.Event('visibilitychange'));now=65000;await w.UpJuniorStudent.recordAnswer({mode:'word',questionKey:'w000001',correct:true});await until(()=>sent.length===1);assert.equal(sent[0].attempts[0].activeMs,5000);w.close();
 const broken=windowFor({db:undefined,fetcher:async()=>reply({ok:true,studentId:'DUMMY001'})});await until(()=>broken.window.document.getElementById('juniorStudentStatus').textContent.includes('DUMMY001'));await broken.window.UpJuniorStudent.recordAnswer({mode:'word',questionKey:'w000001',correct:true});await until(()=>broken.window.document.getElementById('juniorStudentSyncStatus').textContent.includes('閉じ'));broken.window.close();
});
