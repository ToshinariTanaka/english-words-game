const assert = require('assert');
const childProcess = require('child_process');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'english-words-api-test-'));
const dataFile = path.join(tmpDir, 'current-questions.json');
const port = 32123 + Math.floor(Math.random() * 1000);

function wait(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

function request(method, pathname, { body = null, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ method, port, hostname: '127.0.0.1', path: pathname, headers }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let json = null;
        try { json = JSON.parse(text); } catch (error) { /* ignore non-json */ }
        resolve({ status: res.statusCode, text, json });
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function makeMultipart(filePath, filename) {
  const boundary = `----englishWordsGame${Date.now()}`;
  const file = fs.readFileSync(filePath);
  const head = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n\r\n`, 'utf8');
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8');
  return { body: Buffer.concat([head, file, tail]), headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } };
}

function createWorkbook(target, emptyMode = null) {
  const script = `
from openpyxl import Workbook
import sys
sheets = [('word', '★英単語', 'w000001'), ('chunk', '★チャンク', 'c000001'), ('definition', '★英文和訳', 's000001')]
columns = ['row_number', 'level', 'question', 'correct', 'choice1', 'choice2', 'choice3', 'total_correct', 'total_wrong', 'accuracy', 'current_streak', 'note', 'question_key']
wb = Workbook()
wb.remove(wb.active)
empty = sys.argv[2] if len(sys.argv) > 2 else ''
for mode, sheet_name, key in sheets:
    ws = wb.create_sheet(sheet_name)
    ws.append(columns)
    if mode != empty:
        ws.append(['1', 'A1', f'{mode} question', f'{mode} correct', 'x1', 'x2', 'x3', '', '', '', '', '', key])
        ws.append(['2', '', '', '', '', '', '', '', '', '', '', '', ''])
        ws.append(['3', '', f'incomplete {mode}', '', '', '', '', '', '', '', '', '', ''])
wb.save(sys.argv[1])
`;
  const args = ['-c', script, target];
  if (emptyMode) args.push(emptyMode);
  const result = childProcess.spawnSync('python3', args, { encoding: 'utf8' });
  assert.strictEqual(result.status, 0, result.stderr);
}

(async () => {
  const server = childProcess.spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: String(port), QUESTIONS_FILE: dataFile },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  try {
    for (let i = 0; i < 50; i += 1) {
      try { await request('GET', '/api/questions/status'); break; } catch (error) { await wait(100); }
    }

    const diagnostics = await request('GET', '/api/diagnostics/python');
    assert.strictEqual(diagnostics.status, 200, diagnostics.text);
    assert.ok(Object.prototype.hasOwnProperty.call(diagnostics.json, 'ok'), diagnostics.text);
    assert.ok(Object.prototype.hasOwnProperty.call(diagnostics.json, 'python'), diagnostics.text);
    assert.ok(Object.prototype.hasOwnProperty.call(diagnostics.json, 'openpyxl'), diagnostics.text);
    assert.ok(Object.prototype.hasOwnProperty.call(diagnostics.json, 'pythonPackageDir'), diagnostics.text);
    assert.ok(Object.prototype.hasOwnProperty.call(diagnostics.json, 'pythonPath'), diagnostics.text);
    assert.ok(diagnostics.json.pythonPath.includes('.python_packages'), diagnostics.text);
    if (diagnostics.json.openpyxl.available) {
      assert.strictEqual(diagnostics.json.openpyxl.available, true);
      assert.ok(diagnostics.json.openpyxl.version, diagnostics.text);
    }

    const workbook = path.join(tmpDir, 'official.xlsx');
    createWorkbook(workbook);
    const upload = makeMultipart(workbook, 'official.xlsx');
    const uploaded = await request('POST', '/api/questions/upload-workbook', upload);
    assert.strictEqual(uploaded.status, 200, uploaded.text);
    assert.strictEqual(uploaded.json.ok, true);
    assert.deepStrictEqual(Object.keys(uploaded.json.modes).sort(), ['chunk', 'definition', 'word']);

    const saved = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
    assert.strictEqual(saved.schema_version, 2);
    assert.strictEqual(saved.modes.word.rows[0].question_key, 'w000001');

    const beforeBad = fs.readFileSync(dataFile, 'utf8');
    const badWorkbook = path.join(tmpDir, 'bad.xlsx');
    createWorkbook(badWorkbook, 'chunk');
    const badUpload = makeMultipart(badWorkbook, 'bad.xlsx');
    const bad = await request('POST', '/api/questions/upload-workbook', badUpload);
    assert.strictEqual(bad.status, 400, bad.text);
    assert.strictEqual(fs.readFileSync(dataFile, 'utf8'), beforeBad);

    const phrase = await request('GET', '/api/questions/current?mode=phrase');
    assert.strictEqual(phrase.status, 200, phrase.text);
    assert.strictEqual(phrase.json.mode, 'chunk');
    assert.strictEqual(phrase.json.rows[0].question_key, 'c000001');

    const current = await request('GET', '/api/questions/current');
    assert.strictEqual(current.status, 200, current.text);
    assert.strictEqual(current.json.mode, 'word');

    const status = await request('GET', '/api/questions/status');
    assert.strictEqual(status.status, 200, status.text);
    assert.strictEqual(status.json.schema_version, 2);
    assert.deepStrictEqual(status.json.modes, { word: { count: 1 }, chunk: { count: 1 }, definition: { count: 1 } });

    const invalidWorkbook = path.join(tmpDir, 'invalid.xlsx');
    createWorkbook(invalidWorkbook);
    childProcess.spawnSync('python3', ['-c', `
from openpyxl import load_workbook
import sys
wb = load_workbook(sys.argv[1])
ws = wb['★英単語']
ws['B2'] = 'Z9'
ws['E2'] = 'word correct'
wb['★英文和訳']['M2'] = 'd000001'
wb.save(sys.argv[1])
`, invalidWorkbook], { encoding: 'utf8' });
    const invalidUpload = makeMultipart(invalidWorkbook, 'invalid.xlsx');
    const invalid = await request('POST', '/api/questions/upload-workbook', invalidUpload);
    assert.strictEqual(invalid.status, 400, invalid.text);
    assert.ok(Array.isArray(invalid.json.errors), invalid.text);
    assert.ok(invalid.json.errorCount >= 3, invalid.text);
    assert.ok(invalid.json.errors.some((error) => error.includes('B列 level')), invalid.text);
    assert.ok(invalid.json.errors.some((error) => error.includes('D〜G列')), invalid.text);
    assert.ok(invalid.json.errors.some((error) => error.includes('s000001')), invalid.text);

    fs.writeFileSync(dataFile, JSON.stringify({ updatedAt: 'legacy', modes: { word: { rows: [] } } }));
    const legacy = await request('GET', '/api/questions/current?mode=word');
    assert.strictEqual(legacy.status, 409, legacy.text);
    assert.strictEqual(legacy.json.legacy, true);

    const oldApi = await request('POST', '/api/questions/upload', { body: Buffer.from(''), headers: { 'content-type': 'multipart/form-data; boundary=x' } });
    assert.strictEqual(oldApi.status, 410, oldApi.text);
    assert.ok(oldApi.json.error.includes('このAPIは旧形式のため使用できません。'));
    assert.ok(oldApi.json.error.includes('/api/questions/upload-workbook'));

    console.log('tests_server_workbook_api: OK');
  } finally {
    server.kill();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
