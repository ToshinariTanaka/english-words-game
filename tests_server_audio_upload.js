const assert = require('assert');
const childProcess = require('child_process');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'english-words-audio-test-'));
const audioDir = path.join(tmpDir, 'audio');
const port = 33323 + Math.floor(Math.random() * 1000);

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

function makeMultipart(content, filename, contentType = 'audio/mpeg') {
  const boundary = `----englishWordsAudio${Date.now()}${Math.random()}`;
  const head = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`, 'utf8');
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8');
  return { body: Buffer.concat([head, Buffer.from(content), tail]), headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } };
}

(async () => {
  const server = childProcess.spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: String(port), AUDIO_DIR: audioDir, AUDIO_UPLOAD_TOKEN: 'secret' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  try {
    for (let i = 0; i < 50; i += 1) {
      try { await request('GET', '/admin/audio-upload/'); break; } catch (error) { await wait(100); }
    }

    const admin = await request('GET', '/admin/audio-upload/');
    assert.strictEqual(admin.status, 200, admin.text);
    assert.ok(admin.text.includes('MP3音声アップロード'));

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

    console.log('tests_server_audio_upload: OK');
  } finally {
    server.kill();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
