const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ewg-'));
const dataFile = path.join(tmp, 'current-questions.json');
const port = 3300 + Math.floor(Math.random() * 1000);
const base = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['server.js'], { env: { ...process.env, PORT: String(port), QUESTIONS_FILE: dataFile, DATA_DIR: tmp }, stdio: ['ignore', 'pipe', 'pipe'] });

function row(key) { return { row_number: '1', level: 'A2', question: `q-${key}`, correct: '正解', choice1: '誤1', choice2: '誤2', choice3: '誤3', total_correct: '', total_wrong: '', accuracy: '', current_streak: '', note: '', question_key: key }; }
function payload() { return { schema_version: 2, source: 'study-app-workbook', filename: 'book.xlsx', modes: { word: [row('w000001')], chunk: [row('c000001')], phrase: [row('p000001')], definition: [row('s000001')] } }; }
async function waitReady() { for (let i = 0; i < 50; i += 1) { try { await fetch(`${base}/api/questions/status`); return; } catch { await new Promise(r => setTimeout(r, 100)); } } throw new Error('server not ready'); }
async function json(url, options) { const res = await fetch(url, options); return { status: res.status, body: await res.json() }; }

(async () => {
  await waitReady();
  let res = await json(`${base}/api/questions/upload-workbook`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload()) });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.ok, true);
  const saved = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
  assert.strictEqual(saved.schema_version, 2);
  for (const mode of ['word', 'chunk', 'phrase', 'definition']) assert.ok(saved.modes[mode]);

  for (const mode of ['word', 'chunk', 'phrase', 'definition']) {
    res = await json(`${base}/api/questions/current?mode=${mode}`);
    assert.strictEqual(res.body.schema_version, 2);
    assert.strictEqual(res.body.mode, mode);
    assert.strictEqual(res.body.rows[0].question, `q-${res.body.rows[0].question_key}`);
  }
  res = await json(`${base}/api/questions/current`);
  assert.strictEqual(res.body.mode, 'word');
  assert.strictEqual(res.body.rows[0].question_key, 'w000001');

  res = await json(`${base}/api/questions/status`);
  assert.strictEqual(res.body.modes.word.count, 1);
  assert.strictEqual(res.body.modes.chunk.count, 1);
  assert.strictEqual(res.body.modes.phrase.count, 1);
  assert.strictEqual(res.body.modes.definition.count, 1);

  const before = fs.readFileSync(dataFile, 'utf8');
  const bad = payload(); delete bad.modes.phrase;
  res = await json(`${base}/api/questions/upload-workbook`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(bad) });
  assert.strictEqual(res.status, 400);
  assert.strictEqual(fs.readFileSync(dataFile, 'utf8'), before, '欠落時は保存しない');

  fs.writeFileSync(dataFile, JSON.stringify({ modes: { word: { rows: [row('old')] } } }));
  res = await json(`${base}/api/questions/current?mode=word`);
  assert.strictEqual(res.status, 409);
  assert.strictEqual(res.body.legacy, true);

  res = await json(`${base}/api/questions/upload`, { method: 'POST', body: 'x' });
  assert.strictEqual(res.status, 410);
  assert.strictEqual(res.body.ok, false);
  console.log('tests_server_workbook_api: OK');
})().finally(() => server.kill());
