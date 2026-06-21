const assert = require('assert');
const childProcess = require('child_process');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const zlib = require('zlib');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'english-words-audio-test-'));
const audioDir = path.join(tmpDir, 'audio');
const port = 33323 + Math.floor(Math.random() * 1000);
const ttsPort = 35323 + Math.floor(Math.random() * 1000);

function wait(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

function request(method, pathname, { body = null, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ method, port, hostname: '127.0.0.1', path: pathname, headers }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        const text = buffer.toString('utf8');
        let json = null;
        try { json = JSON.parse(text); } catch (error) { /* ignore non-json */ }
        resolve({ status: res.statusCode, text, json, buffer, headers: res.headers });
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}


function makeZip(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const data = Buffer.from(entry.content);
    const compressed = zlib.deflateRawSync(data);
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    localParts.push(local, name, compressed);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, name);
    offset += local.length + name.length + compressed.length;
  }
  const centralOffset = offset;
  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt32LE(centralSize, 12);
  eocd.writeUInt32LE(centralOffset, 16);
  return Buffer.concat([...localParts, ...centralParts, eocd]);
}

function crc32(buffer) {
  let crc = ~0;
  for (const byte of buffer) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (~crc) >>> 0;
}

function makeMultipart(content, filename, contentType = 'audio/mpeg', fields = {}) {
  const boundary = `----englishWordsAudio${Date.now()}${Math.random()}`;
  const parts = [];
  for (const [name, value] of Object.entries(fields)) {
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`, 'utf8'));
  }
  parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`, 'utf8'));
  parts.push(Buffer.from(content));
  parts.push(Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8'));
  return { body: Buffer.concat(parts), headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } };
}

(async () => {
  const ttsServer = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      const payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      res.writeHead(200, { 'content-type': 'audio/mpeg' });
      res.end(`mock-mp3:${payload.input}`);
    });
  });
  await new Promise((resolve) => ttsServer.listen(ttsPort, '127.0.0.1', resolve));
  const workbookPath = path.join(tmpDir, 'audio.xlsx');
  childProcess.execFileSync('python3', ['-c', `
from openpyxl import Workbook
wb = Workbook()
sheets = [('★英単語', 'w', 'Hello'), ('★チャンク', 'c', 'Good morning'), ('★文節和訳', 'p', 'Nice to meet you'), ('★英文和訳', 's', 'This is a pen')]
for i, (name, prefix, text) in enumerate(sheets):
    ws = wb.active if i == 0 else wb.create_sheet()
    ws.title = name
    ws.append(['row_number','level','question','correct','choice1','choice2','choice3','total_correct','total_wrong','accuracy','current_streak','note','question_key'])
    max_n = 20 if prefix == 'w' else 3
    for n in range(1, max_n + 1):
        ws.append([n, 'A1', f'{text} {n}', 'a', 'b', 'c', 'd', '', '', '', '', '', f'{prefix}{n:06d}'])
wb.save(r'''${workbookPath}''')
`]);
  let generationServer = null;
  let uploadServer = null;
  const server = childProcess.spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: String(port), AUDIO_DIR: audioDir, AUDIO_UPLOAD_TOKEN: 'secret', OPENAI_API_KEY: '', OPENAI_TTS_ENDPOINT: `http://127.0.0.1:${ttsPort}/v1/audio/speech` },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  try {
    for (let i = 0; i < 50; i += 1) {
      try { await request('GET', '/admin/audio-upload/'); break; } catch (error) { await wait(100); }
    }

    const admin = await request('GET', '/admin/audio-upload/');
    assert.strictEqual(admin.status, 200, admin.text);
    assert.ok(admin.text.includes('MP3音声アップロード'));
    assert.ok(admin.text.includes('ExcelからMP3生成'));

    const noApiKeyWorkbook = makeMultipart('not-xlsx', 'audio.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    const noApiKey = await request('POST', '/api/audio/generate-from-workbook', { body: noApiKeyWorkbook.body, headers: { ...noApiKeyWorkbook.headers, 'X-Audio-Upload-Token': 'secret' } });
    assert.strictEqual(noApiKey.status, 503, noApiKey.text);
    assert.ok(noApiKey.json.error.includes('OPENAI_API_KEY'), noApiKey.text);

    server.kill();
    await wait(100);
    generationServer = childProcess.spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: String(port), AUDIO_DIR: audioDir, AUDIO_UPLOAD_TOKEN: 'secret', OPENAI_API_KEY: 'dummy-key', OPENAI_TTS_ENDPOINT: `http://127.0.0.1:${ttsPort}/v1/audio/speech` },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    for (let i = 0; i < 50; i += 1) {
      try { await request('GET', '/admin/audio-upload/'); break; } catch (error) { await wait(100); }
    }
    const workbookUpload = makeMultipart(fs.readFileSync(workbookPath), 'audio.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', { endKey: 'w000003', voice: 'nova' });
    const generated = await request('POST', '/api/audio/generate-from-workbook', { body: workbookUpload.body, headers: { ...workbookUpload.headers, 'X-Audio-Upload-Token': 'secret' } });
    assert.strictEqual(generated.status, 200, generated.text);
    assert.strictEqual(generated.json.generated, 3, generated.text);
    assert.strictEqual(generated.json.total, 3, generated.text);
    assert.strictEqual(fs.readFileSync(path.join(audioDir, 'w000001.mp3'), 'utf8'), 'mock-mp3:Hello 1');
    assert.strictEqual(generated.json.voice, 'nova', generated.text);
    const skippedWorkbookUpload = makeMultipart(fs.readFileSync(workbookPath), 'audio.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', { endKey: 'w000003' });
    const skippedGenerated = await request('POST', '/api/audio/generate-from-workbook', { body: skippedWorkbookUpload.body, headers: { ...skippedWorkbookUpload.headers, 'X-Audio-Upload-Token': 'secret' } });
    assert.strictEqual(skippedGenerated.status, 200, skippedGenerated.text);
    assert.strictEqual(skippedGenerated.json.skipped, 3, skippedGenerated.text);
    for (let n = 4; n <= 10; n += 1) fs.writeFileSync(path.join(audioDir, `w${String(n).padStart(6, '0')}.mp3`), 'existing-mp3');
    fs.writeFileSync(path.join(audioDir, 'w000011.mp3'), '');
    const statusWorkbookUpload = makeMultipart(fs.readFileSync(workbookPath), 'audio.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', { mode: 'word', endKey: 'w000020' });
    const status = await request('POST', '/api/audio/generation-status', { body: statusWorkbookUpload.body, headers: { ...statusWorkbookUpload.headers, 'X-Audio-Upload-Token': 'secret' } });
    assert.strictEqual(status.status, 200, status.text);
    assert.strictEqual(status.json.total, 20, status.text);
    assert.strictEqual(status.json.generated, 10, status.text);
    assert.strictEqual(status.json.missing, 10, status.text);
    assert.strictEqual(status.json.firstKey, 'w000001', status.text);
    assert.strictEqual(status.json.lastKey, 'w000020', status.text);
    assert.strictEqual(status.json.lastContiguousGeneratedKey, 'w000010', status.text);
    assert.strictEqual(status.json.firstMissingKey, 'w000011', status.text);
    assert.strictEqual(status.json.nextStartKey, 'w000011', status.text);
    assert.strictEqual(status.json.nextEndKey, 'w000020', status.text);
    assert.deepStrictEqual(status.json.nextMissingKeys, ['w000011', 'w000012', 'w000013', 'w000014', 'w000015', 'w000016', 'w000017', 'w000018', 'w000019', 'w000020'], status.text);
    generationServer.kill();
    await wait(100);
    uploadServer = childProcess.spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: String(port), AUDIO_DIR: audioDir, AUDIO_UPLOAD_TOKEN: 'secret' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    for (let i = 0; i < 50; i += 1) {
      try { await request('GET', '/admin/audio-upload/'); break; } catch (error) { await wait(100); }
    }

    const missingTokenUpload = makeMultipart('mp3-data', 'w000001.mp3');
    const missingToken = await request('POST', '/api/audio/upload', missingTokenUpload);
    assert.strictEqual(missingToken.status, 403, missingToken.text);

    const badNameUpload = makeMultipart('mp3-data', 'x000001.mp3');
    const badName = await request('POST', '/api/audio/upload', { body: badNameUpload.body, headers: { ...badNameUpload.headers, 'X-Audio-Upload-Token': 'secret' } });
    assert.strictEqual(badName.status, 400, badName.text);

    const emptyUpload = makeMultipart('', 'w000001.mp3');
    const empty = await request('POST', '/api/audio/upload', { body: emptyUpload.body, headers: { ...emptyUpload.headers, 'X-Audio-Upload-Token': 'secret' } });
    assert.strictEqual(empty.status, 400, empty.text);

    const goodUpload = makeMultipart('mp3-data', 'w000001.mp3');
    const good = await request('POST', '/api/audio/upload', { body: goodUpload.body, headers: { ...goodUpload.headers, 'X-Audio-Upload-Token': 'secret' } });
    assert.strictEqual(good.status, 200, good.text);
    assert.deepStrictEqual(good.json, { ok: true, filename: 'w000001.mp3', url: '/audio/w000001.mp3' });
    assert.strictEqual(fs.readFileSync(path.join(audioDir, 'w000001.mp3'), 'utf8'), 'mp3-data');

    const audio = await request('GET', '/audio/w000001.mp3');
    assert.strictEqual(audio.status, 200, audio.text);
    assert.strictEqual(audio.headers['content-type'], 'audio/mpeg');
    assert.strictEqual(audio.text, 'mp3-data');

    const overwriteUpload = makeMultipart('new-mp3-data', 'w000001.mp3');
    const overwrite = await request('POST', '/api/audio/upload', { body: overwriteUpload.body, headers: { ...overwriteUpload.headers, 'X-Audio-Upload-Token': 'secret' } });
    assert.strictEqual(overwrite.status, 200, overwrite.text);
    assert.strictEqual(fs.readFileSync(path.join(audioDir, 'w000001.mp3'), 'utf8'), 'new-mp3-data');


    const zipBuffer = makeZip([
      { name: 'nested/c000001.mp3', content: 'zip-mp3-data' },
      { name: 'bad/x000001.mp3', content: 'bad-name' },
      { name: 'empty/p000001.mp3', content: '' },
      { name: 'notes.txt', content: 'not audio' },
    ]);
    const zipUpload = makeMultipart(zipBuffer, 'audio.zip', 'application/zip');
    const zip = await request('POST', '/api/audio/upload-zip', { body: zipUpload.body, headers: { ...zipUpload.headers, 'X-Audio-Upload-Token': 'secret' } });
    assert.strictEqual(zip.status, 200, zip.text);
    assert.strictEqual(zip.json.uploaded, 1, zip.text);
    assert.strictEqual(zip.json.skipped, 3, zip.text);
    assert.strictEqual(fs.readFileSync(path.join(audioDir, 'c000001.mp3'), 'utf8'), 'zip-mp3-data');
    assert.ok(!fs.existsSync(path.join(audioDir, 'x000001.mp3')));

    console.log('tests_server_audio_upload: OK');
  } finally {
    server.kill();
    if (generationServer) generationServer.kill();
    if (uploadServer) uploadServer.kill();
    ttsServer.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
