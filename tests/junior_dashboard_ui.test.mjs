import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {memoryD1,ctx,adminData,adminOrigin} from './junior-d1-helpers.mjs';
import {onRequestPost as create} from '../functions/api/admin/students/index.js';
import {onRequestPost as reset} from '../functions/api/admin/students/reset-password.js';
import {onRequestPost as status} from '../functions/api/admin/students/change-status.js';
import {onRequestGet as summary} from '../functions/api/admin/students/summary.js';
import {onRequestGet as detail} from '../functions/api/admin/students/detail.js';
const tick=()=>new Promise(r=>setTimeout(r,5));
async function until(fn){for(let i=0;i<200;i++){if(fn())return;await tick();}assert.fail('UI state did not complete');}
test('admin screen registers student, shows safe text, detail, reset, disable/reactivate and clears secret',async()=>{
 const db=memoryD1();const dom=new JSDOM(readFileSync(new URL('../admin/junior-students/index.html',import.meta.url),'utf8'),{url:adminOrigin+'/students/',runScripts:'outside-only'});const w=dom.window,$=id=>w.document.getElementById(id);
 w.AbortSignal=AbortSignal;w.confirm=()=>true;w.HTMLElement.prototype.scrollIntoView=()=>{};w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
 w.fetch=async(path,options={})=>{const p=new URL(path,adminOrigin);const routes={'/api/admin/students':create,'/api/admin/students/summary':summary,'/api/admin/students/detail':detail,'/api/admin/students/reset-password':reset,'/api/admin/students/change-status':status};const fn=routes[p.pathname];if(!fn)return new Response('{}',{status:404});return fn(ctx(p.pathname+p.search,{db,data:adminData,base:adminOrigin,method:options.method||'GET',body:options.body?JSON.parse(options.body):undefined}));};
 w.eval(readFileSync(new URL('../admin/junior-students/script.js',import.meta.url),'utf8'));
 await until(()=>$('students').textContent.includes('該当する生徒がいません'));
 $('newId').value='DUMMY001';$('newName').value='<img src=x onerror=alert(1)>';$('createForm').dispatchEvent(new w.Event('submit',{cancelable:true}));await until(()=>$('credentials').open);assert.equal($('issuedPassword').value.length,20);assert.ok($('students').textContent.includes('<img'));assert.equal($('students').querySelectorAll('img').length,0);$('closeCredentials').click();assert.equal($('issuedPassword').value,'');
 w.document.querySelector('[data-action="detail"]').click();await until(()=>!$('detail').hidden);assert.ok($('history').textContent.includes('履歴はありません'));
 w.document.querySelector('[data-action="reset"]').click();await until(()=>$('credentials').open);assert.equal($('issuedPassword').value.length,20);$('closeCredentials').click();await until(()=>!w.document.querySelector('[data-action="status"]').disabled);w.document.querySelector('[data-action="status"]').click();await until(()=>w.document.querySelector('[data-action="status"]').textContent==='利用再開');assert.equal(db.raw.prepare('SELECT status FROM junior_students').get().status,'disabled');await until(()=>!w.document.querySelector('[data-action="status"]').disabled);w.document.querySelector('[data-action="status"]').click();await until(()=>w.document.querySelector('[data-action="status"]').textContent==='利用停止');assert.equal(db.raw.prepare('SELECT status FROM junior_students').get().status,'active');
 $('search').value='NO_MATCH';$('search').dispatchEvent(new w.Event('input'));assert.ok($('students').textContent.includes('該当する生徒'));w.close();
});
