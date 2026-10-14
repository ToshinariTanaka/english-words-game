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
 const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script,compatibilityDate:'2026-10-01',r2Buckets:['JUNIOR_AUDIO']}));
 try{
  const response=await mf.dispatchFetch('https://local.test/api/admin/students/summary',{headers:{'Cf-Access-Authenticated-User-Email':'staff@example.test'}});
  assert.equal(response.status,role==='student'?403:503);
  const me=await mf.dispatchFetch('https://local.test/api/student/me');assert.equal(me.status,503);
  if(role==='admin')assert.equal((await mf.dispatchFetch('https://local.test/students/')).status,503);
  if(role==='student'){
   assert.equal((await mf.dispatchFetch('https://local.test/api/audio/manifest?mode=word')).status,404);
   const bucket=await mf.getR2Bucket('JUNIOR_AUDIO');
   const release='a'.repeat(64),asset='b'.repeat(64),checksum='c'.repeat(64);
   await bucket.put('audio/junior/current.json',JSON.stringify({release_id:release}));
   await bucket.put(`audio/junior/releases/${release}/word.json`,JSON.stringify({schema_version:1,kind:'published_audio',release_id:release,mode:'word',entries:{w000001:{text_sha256:'d'.repeat(64),voices:{nova:{asset_id:asset,file_sha256:checksum,bytes:10,duration_ms:1000,status:'verified'}}}}}));
   await bucket.put(`audio/junior/nova/word/w000001/${asset}.mp3`,'0123456789',{customMetadata:{sha256:checksum}});
   const manifest=await mf.dispatchFetch('https://local.test/api/audio/manifest?mode=word');assert.equal(manifest.status,200);
   const audioUrl=`https://local.test/api/audio/file?mode=word&key=w000001&voice=nova&asset=${asset}`;
   const audio=await mf.dispatchFetch(audioUrl,{headers:{Range:'bytes=2-4'}});assert.equal(audio.status,206);assert.equal(await audio.text(),'234');assert.equal(audio.headers.get('Content-Length'),'3');
   const head=await mf.dispatchFetch(audioUrl,{method:'HEAD'});assert.equal(head.status,200);assert.equal(head.headers.get('Content-Length'),'10');
  }
 }finally{await mf.dispose();}
});
