import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareWorkbook, FIELDS } from '../admin/junior-data/parser.mjs';
import { validateRelease, MANIFEST_KEY } from '../cloudflare/junior-questions.js';
import { onRequestPost as stageMode } from '../functions/api/admin/questions/stage/[mode].js';
import { onRequestPost as publish } from '../functions/api/admin/questions/publish.js';
import { onRequestGet as getQuestions } from '../functions/api/questions/current.js';
import { onRequestGet as getStatus } from '../functions/api/questions/status.js';
import { SITE_ROLE } from '../cloudflare/junior-site-role.js';

const SHEETS = { word:'★英単語', chunk:'★チャンク', phrase:'★文節和訳', definition:'★英文和訳' };
const PREFIXES = { word:'w', chunk:'c', phrase:'p', definition:'s' };
const TOKEN='a'.repeat(40);
function fixture(flag = true) {
  const wb = { SheetNames: Object.values(SHEETS), Sheets: {} };
  for (const [mode, sheet] of Object.entries(SHEETS)) {
    const header = [...FIELDS, ...(mode === 'word' && flag ? ['target1800'] : [])];
    const mk = (n, level, mark) => [n, level, 'example ' + n, '意味' + n, '誤答' + n,
      '別の意味' + n, '他の意味' + n, '0','0','0%','0','解説',
      PREFIXES[mode] + String(n).padStart(6,'0'), ...(mode === 'word' && flag ? [mark] : [])];
    wb.Sheets[sheet] = [header, mk(1,'A1','1'), mk(2,'A2','0'), mk(3,'B1','1')];
  }
  return wb;
}
const converter = (sheet) => sheet;

class MemoryR2 {
  constructor() { this.store = new Map(); this.fail = false; }
  async get(key) {
    const obj = this.store.get(key);
    return !obj ? null : {
      text: async () => obj.text,
      json: async () => JSON.parse(obj.text),
      body: new Response(obj.text).body,
      customMetadata: obj.options.customMetadata,
    };
  }
  async head(key) {
    const obj = this.store.get(key);
    return !obj ? null : {
      customMetadata: obj.options.customMetadata || {},
      size: Buffer.byteLength(obj.text),
    };
  }
  async put(key, value, options = {}) {
    if (this.fail && key.includes('/definition.json')) throw new Error('Simulated write error');
    // Real Cloudflare R2 rejects generic ReadableStreams with unknown length.
    // An ordinary Node mock that silently accepts streams misses the production bug.
    if (value instanceof ReadableStream) throw new TypeError('Provided readable stream must have a known length');
    const text = typeof value === 'string' ? value : await new Response(value).text();
    this.store.set(key, { text, options });
    return { key };
  }
}
const envFor = (bucket) => ({ JUNIOR_DATA:bucket, JUNIOR_UPLOAD_TOKEN:TOKEN });
const base='https://junior.pages.dev';

function context(env, path, body, { token=TOKEN, origin=base, headers={}, authenticated=true }={}) {
  const request = new Request(base + path, { method:'POST',
    headers: { Origin:origin, Authorization:'Bearer ' + token,
      'Content-Type':'application/json', ...headers }, body:JSON.stringify(body) });
  return {env,request,data:authenticated?{verifiedAdminEmail:'admin@example.com'}:{}};
}

async function stageAll(env, dataset, id) {
  for (const [mode, rows] of Object.entries(dataset.modes)) {
    const request=context(env,'/api/admin/questions/stage/'+mode,{
      ok:true, mode, rows, count:rows.length, filename:'junior.xlsx', filter:'a1a2', versionId:id,
    },{headers:{'X-Release-Id':id,'X-Filter':'a1a2','X-Row-Count':String(rows.length)}});
    const result=await stageMode({...request,params:{mode}});
    if (!result.ok) throw new Error('stage '+mode+' failed: '+await result.text());
  }
}

test('A1+A2 filter, target1800 flag and full system test select the right rows', () => {
  const wb=fixture();
  const a12=prepareWorkbook(wb,'a1a2',converter);
  assert.equal(a12.total,8);
  assert.deepEqual(Object.values(a12.counts),[2,2,2,2]);
  const target=prepareWorkbook(wb,'target1800',converter);
  assert.deepEqual(Object.values(target.counts),[2,2,2,2]);
  assert.deepEqual(target.modes.word.map(x=>x.question_key),['w000001','w000003']);
  assert.equal(prepareWorkbook(wb,'all',converter).total,12);
  assert.throws(()=>prepareWorkbook(fixture(false),'target1800',converter),/N1/);
  const duplicate=fixture();
  duplicate.Sheets['★英単語'][2][12]='w000001';
  assert.throws(()=>prepareWorkbook(duplicate,'a1a2',converter),/重複/);
  const options=fixture();
  options.Sheets['★英単語'][1][4]='意味1';
  assert.throws(()=>prepareWorkbook(options,'a1a2',converter),/空欄・重複/);
});

test('validates workbook before network submission',()=>{
  const result=prepareWorkbook(fixture(),'a1a2',converter);
  assert.equal(validateRelease({version:1,filename:'junior.xlsx',filter:'a1a2',modes:result.modes}).total,8);
  assert.throws(()=>validateRelease({version:1,filename:'x.xlsx',filter:'a1a2',
    modes:prepareWorkbook(fixture(),'all',converter).modes}),/別レベル/);
});

test('stages 4 modes, publishes one manifest and streams questions to students',async()=>{
  const bucket=new MemoryR2(),env=envFor(bucket);
  const data=prepareWorkbook(fixture(),'a1a2',converter);
  const id=crypto.randomUUID();
  await stageAll(env,data,id);
  assert.equal(bucket.store.has(MANIFEST_KEY),false);
  const response=await publish(context(env,'/api/admin/questions/publish',{
    version:1, versionId:id, filename:'junior.xlsx',filter:'a1a2', counts:data.counts,
  }));
  assert.equal(response.status,200);
  assert.equal((await response.json()).total,8);
  assert.equal(bucket.store.has(MANIFEST_KEY),true);
  const questions=await getQuestions({env,request:new Request(base+'/api/questions/current?mode=word')});
  assert.equal(questions.status,200);
  assert.equal((await questions.json()).rows.length,2);
  const status=await getStatus({env});
  assert.equal((await status.json()).counts.word,2);

  const oldManifest=bucket.store.get(MANIFEST_KEY).text;
  const secondId=crypto.randomUUID();
  bucket.fail=true;
  await assert.rejects(stageAll(env,data,secondId),/stage definition failed/);
  const commit=await publish(context(env,'/api/admin/questions/publish',{
    version:1,versionId:secondId,filename:'junior.xlsx',filter:'a1a2',counts:data.counts,
  }));
  assert.equal(commit.status,409);
  assert.equal(bucket.store.get(MANIFEST_KEY).text,oldManifest);
});

test('unauthorized uploads and cross-site requests never write R2 data in either build',async()=>{
  const bucket=new MemoryR2(),env=envFor(bucket),id=crypto.randomUUID();
  const data=prepareWorkbook(fixture(),'a1a2',converter);
  const row=data.modes.word;
  const input={ok:true,mode:'word',rows:row,count:row.length};
  const headers={'X-Release-Id':id,'X-Filter':'a1a2','X-Row-Count':String(row.length)};
  // Admin builds must reject even a valid legacy token without Access identity.
  // Student builds retain the existing token-based upload compatibility.
  const denied=await stageMode({...context(env,'/api/admin/questions/stage/word',input,{
    authenticated:false,token:SITE_ROLE==='admin'?TOKEN:'wrong',headers,
  }),params:{mode:'word'}});
  assert.equal(denied.status,SITE_ROLE==='admin'?403:401);
  const badOrigin=await stageMode({...context(env,'/api/admin/questions/stage/word',input,{origin:'https://evil.example',headers}),params:{mode:'word'}});
  assert.equal(badOrigin.status,403);
  const missingStorage=await publish(context({},'/api/admin/questions/publish',{
    version:1,versionId:id,filename:'junior.xlsx',filter:'a1a2',counts:data.counts,
  }));
  assert.equal(missingStorage.status,503);
  assert.equal(bucket.store.size,0);
});


test('handles 9,185 staged questions without parsing large JSON in the Worker', async () => {
  const targetCounts={word:7489,chunk:856,phrase:441,definition:399};
  const workbook={SheetNames:Object.values(SHEETS),Sheets:{}};
  for(const [mode,sheet] of Object.entries(SHEETS)) {
    const count=targetCounts[mode];
    const pref=PREFIXES[mode];
    const rows=[FIELDS];
    for(let i=1;i<=count;i++) {
      rows.push([i,i%3===0?'B1':i%2===0?'A2':'A1',
        'question '+mode+' '+i,'正解'+i,'誤答A'+i,'誤答B'+i,'誤答C'+i,
        '0','0','0%','0','note',pref+String(i).padStart(6,'0')]);
    }
    workbook.Sheets[sheet]=rows;
  }
  const dataset=prepareWorkbook(workbook,'all',converter);
  assert.equal(dataset.total,9185);
  const bucket=new MemoryR2();
  const env=envFor(bucket);
  const versionId=crypto.randomUUID();
  for(const [mode,rows] of Object.entries(dataset.modes)) {
    const c=context(env,'/api/admin/questions/stage/'+mode,
      {ok:true,mode,rows,count:rows.length,versionId,filename:'full.xlsx',filter:'all'},
      {headers:{'X-Release-Id':versionId,'X-Filter':'all','X-Row-Count':String(rows.length)}});
    const response=await stageMode({...c,params:{mode}});
    assert.equal(response.status,200,mode);
  }
  const publishResponse=await publish(context(env,'/api/admin/questions/publish',{
    version:1, versionId, filename:'full.xlsx', filter:'all',counts:dataset.counts,
  }));
  assert.equal(publishResponse.status,200);
  const response=await getQuestions({env,request:new Request(base+'/api/questions/current?mode=word')});
  const data=await response.json();
  assert.equal(data.rows.length,7489);
});


test('rejects an oversized request stream without storing or publishing anything',async()=>{
  const bucket=new MemoryR2(),env=envFor(bucket);
  const id=crypto.randomUUID();
  const c=context(env,'/api/admin/questions/stage/word',{
    filler:'X'.repeat(12*1024*1024),
  },{headers:{'X-Release-Id':id,'X-Filter':'a1a2','X-Row-Count':'1'}});
  const result=await stageMode({...c,params:{mode:'word'}});
  assert.equal(result.status,413);
  assert.equal(bucket.store.size,0);
  assert.equal((await result.json()).ok,false);
});

test('rejects an empty upload instead of writing an empty R2 object',async()=>{
  const bucket=new MemoryR2(),env=envFor(bucket);
  const id=crypto.randomUUID();
  const req=new Request(base+'/api/admin/questions/stage/word',{
    method:'POST',headers:{Origin:base,Authorization:'Bearer '+TOKEN,'Content-Type':'application/json',
      'X-Release-Id':id,'X-Filter':'a1a2','X-Row-Count':'1'},
    body:'',
  });
  const result=await stageMode({env,request:req,params:{mode:'word'},data:{verifiedAdminEmail:'admin@example.com'}});
  assert.equal(result.status,400);
  assert.equal(bucket.store.size,0);
});
