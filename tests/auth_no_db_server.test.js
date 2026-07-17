'use strict';

const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const http = require('node:http');
const path = require('node:path');
const test = require('node:test');

function request(port, pathname) {
  return new Promise((resolve, reject) => {
    const req = http.get({ hostname: '127.0.0.1', port, path: pathname }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject);
  });
}

async function waitForServer(port, child) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`server exited with ${child.exitCode}`);
    try { return await request(port, '/api/app-config'); } catch (_) { await new Promise((resolve) => setTimeout(resolve, 80)); }
  }
  throw new Error('server startup timed out');
}

test('DATABASE_URL未設定でも既存画面を配信し、認証APIだけ503にする', async (t) => {
  const port = 36_000 + Math.floor(Math.random() * 2_000);
  const env = { ...process.env, PORT: String(port), DATABASE_URL: '', SESSION_SECRET: '', TEMP_PASSWORD_ENCRYPTION_KEY: '' };
  const child = spawn(process.execPath, ['server.js'], { cwd: path.join(__dirname, '..'), env, stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(() => { if (child.exitCode === null) child.kill(); });
  await waitForServer(port, child);
  const root = await request(port, '/');
  const studyApp = await request(port, '/study-app/');
  const authStatus = await request(port, '/api/auth/status');
  assert.equal(root.status, 200);
  assert.equal(studyApp.status, 200);
  assert.equal(authStatus.status, 503);
  assert.match(authStatus.body, /既存の英語学習機能は引き続き利用できます/);
});
