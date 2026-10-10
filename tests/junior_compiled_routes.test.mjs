import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
for(const role of ['student','admin'])test('compiled '+role+' build has isolated, fail-closed routes',async()=>{
 const multipart=readFileSync('.qa/'+role+'-functions.js','utf8');
 const boundary=multipart.split('\r\n')[0].slice(2);
 const form=await new Response(multipart,{headers:{'Content-Type':'multipart/form-data; boundary='+boundary}}).formData();
 const metadata=JSON.parse(form.get('metadata'));
 const script=await form.get(metadata.main_module).text();
 const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script,compatibilityDate:'2026-10-01'}));
 try{
  const response=await mf.dispatchFetch('https://local.test/api/admin/students/summary',{headers:{'Cf-Access-Authenticated-User-Email':'staff@example.test'}});
  assert.equal(response.status,role==='student'?403:503);
  const me=await mf.dispatchFetch('https://local.test/api/student/me');assert.equal(me.status,503);
  if(role==='admin')assert.equal((await mf.dispatchFetch('https://local.test/students/')).status,503);
 }finally{await mf.dispose();}
});
