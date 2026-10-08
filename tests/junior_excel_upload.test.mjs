import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareWorkbook, FIELDS } from '../admin/junior-data/parser.mjs';
import { validateRelease, MANIFEST_KEY } from '../cloudflare/junior-questions.js';
import { onRequestPost } from '../functions/api/admin/questions/publish.js';
import { onRequestGet as getQuestions } from '../functions/api/questions/current.js';
import { onRequestGet as getStatus } from '../functions/api/questions/status.js';

const SHEETS = { word:'★英単語', chunk:'★チャンク', phrase:'★文節和訳', definition:'★英文和訳' };
const PREFIXES = { word:'w', chunk:'c', phrase:'p', definition:'s' };
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
  async get(key) { const data = this.store.get(key); return data === undefined ? null :
    { text: async () => data, json: async () => JSON.parse(data) }; }
  async put(key, value) {
    if (this.fail && key.includes('/definition.json')) throw new Error('Simulated write error');
    this.store.set(key, value); return { key };
  }
}

function context(env, body, token = 'a'.repeat(40), origin = 'https://junior.pages.dev') {
  return {
    env, request: new Request('https://junior.pages.dev/api/admin/questions/publish', {
      method: 'POST', headers: { Origin: origin, Authorization:'Bearer ' + token,
        'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }),
  };
}

test('A1+A2 filter, target1800 flag and full test dataset select expected rows', () => {
  const wb = fixture();
  const a12 = prepareWorkbook(wb,'a1a2',converter);
  assert.equal(a12.total,8);
  assert.deepEqual(Object.values(a12.counts),[2,2,2,2]);
  const flag = prepareWorkbook(wb,'target1800',converter);
  assert.deepEqual(Object.values(flag.counts),[2,2,2,2]);
  assert.deepEqual(flag.modes.word.map((x) => x.question_key), ['w000001','w000003']);
  const all = prepareWorkbook(wb,'all',converter);
  assert.equal(all.total,12);
  assert.throws(() => prepareWorkbook(fixture(false),'target1800',converter), /N1/);
  const duplicate = fixture();
  duplicate.Sheets['★英単語'][2][12] = 'w000001';
  assert.throws(() => prepareWorkbook(duplicate,'a1a2',converter), /重複/);
  const choices = fixture();
  choices.Sheets['★英単語'][1][4] = '意味1';
  assert.throws(() => prepareWorkbook(choices,'a1a2',converter), /空欄・重複/);
});

test('rejects incorrect publish filters and invalid levels', () => {
  const result=prepareWorkbook(fixture(),'a1a2',converter);
  assert.equal(validateRelease({version:1,filename:'junior.xlsx',filter:'a1a2',modes:result.modes}).total,8);
  assert.throws(() => validateRelease({version:1,filename:'x.xlsx',filter:'a1a2',
    modes:prepareWorkbook(fixture(),'all',converter).modes}),/別レベル/);
  assert.throws(() => validateRelease({version:1,filename:'x.xlsx',filter:'no',modes:result.modes}),/不正/);
});

test('publishes atomically and serves student questions from R2 without access token',async () => {
  const bucket=new MemoryR2();
  const env={JUNIOR_DATA:bucket,JUNIOR_UPLOAD_TOKEN:'a'.repeat(40)};
  const workbook=prepareWorkbook(fixture(),'a1a2',converter);
  let c=context(env,{version:1,filename:'junior.xlsx',filter:'a1a2',modes:workbook.modes});
  let response=await onRequestPost(c);
  assert.equal(response.status,200);
  const published=await response.json();
  assert.equal(published.total,8);
  assert.equal(bucket.store.has(MANIFEST_KEY),true);
  let questions=await getQuestions({env,request:new Request('https://junior.pages.dev/api/questions/current?mode=word')});
  assert.equal(questions.status,200);
  assert.equal((await questions.json()).rows.length,2);
  let status=await getStatus({env});
  assert.equal((await status.json()).counts.word,2);

  const oldManifest=bucket.store.get(MANIFEST_KEY);
  bucket.fail=true;
  c=context(env,{version:1,filename:'junior2.xlsx',filter:'all',modes:prepareWorkbook(fixture(),'all',converter).modes});
  response=await onRequestPost(c);
  assert.equal(response.status,503);
  assert.equal(bucket.store.get(MANIFEST_KEY),oldManifest);
});

test('never accepts unauthenticated or cross-origin Excel publication',async () => {
  const bucket=new MemoryR2();
  const env={JUNIOR_DATA:bucket,JUNIOR_UPLOAD_TOKEN:'a'.repeat(40)};
  const workbook=prepareWorkbook(fixture(),'a1a2',converter);
  const payload={version:1,filename:'junior.xlsx',filter:'a1a2',modes:workbook.modes};
  assert.equal((await onRequestPost(context(env,payload,'wrong'))).status,401);
  assert.equal((await onRequestPost(context(env,payload,'a'.repeat(40),'https://other.example'))).status,403);
  assert.equal((await onRequestPost(context({JUNIOR_DATA:bucket},payload))).status,503);
  assert.equal(bucket.store.size,0);
});
