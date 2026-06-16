const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = process.env.DATA_DIR || '/var/data/english_words_game';
const DATA_FILE = process.env.QUESTIONS_FILE || path.join(DATA_DIR, 'current-questions.json');
const PUBLIC_DIR = __dirname;
const MAX_UPLOAD_BYTES = Number(process.env.MAX_UPLOAD_BYTES || 10 * 1024 * 1024);

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml; charset=utf-8'
};

function stripBom(value) { return String(value || '').replace(/^\uFEFF/, ''); }

function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i], next = text[i + 1];
    if (quoted && char === '"' && next === '"') { cell += '"'; i += 1; }
    else if (char === '"') quoted = !quoted;
    else if (!quoted && char === ',') { row.push(cell); cell = ''; }
    else if (!quoted && (char === '\n' || char === '\r')) {
      if (char === '\r' && next === '\n') i += 1;
      row.push(cell); if (row.some((value) => value.trim() !== '')) rows.push(row); row = []; cell = '';
    } else cell += char;
  }
  row.push(cell); if (row.some((value) => value.trim() !== '')) rows.push(row);
  if (rows.length === 0) return [];
  const [headers, ...records] = rows;
  return records.map((record) => Object.fromEntries(headers.map((header, index) => [stripBom(header).trim(), (record[index] || '').trim()])));
}

function parseUploadedRows(buffer) {
  return parseCsv(buffer.toString('utf8'));
}

function parseMultipart(buffer, contentType) {
  const boundaryMatch = contentType.match(/boundary=(?:(?:"([^"]+)")|([^;]+))/i);
  if (!boundaryMatch) throw new Error('multipart boundaryが見つかりません。');
  const boundary = `--${boundaryMatch[1] || boundaryMatch[2]}`;
  const body = buffer.toString('binary');
  const parts = body.split(boundary).slice(1, -1);
  const fields = {};
  let file = null;
  for (const part of parts) {
    const trimmed = part.replace(/^\r\n/, '').replace(/\r\n$/, '');
    const headerEnd = trimmed.indexOf('\r\n\r\n');
    if (headerEnd < 0) continue;
    const rawHeaders = trimmed.slice(0, headerEnd);
    const content = trimmed.slice(headerEnd + 4);
    const nameMatch = rawHeaders.match(/name="([^"]+)"/i);
    if (!nameMatch) continue;
    const name = nameMatch[1];
    const filenameMatch = rawHeaders.match(/filename="([^"]*)"/i);
    const contentBuffer = Buffer.from(content, 'binary');
    if (filenameMatch) file = { name, filename: filenameMatch[1] || 'upload.csv', buffer: contentBuffer };
    else fields[name] = contentBuffer.toString('utf8');
  }
  return { fields, file };
}


function ensureDataDir() { fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true }); }
function readStore() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return { modes: {}, updatedAt: null }; throw error; }
}
function writeStore(store) {
  ensureDataDir();
  const tmp = `${DATA_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(store, null, 2));
  fs.renameSync(tmp, DATA_FILE);
}
function sendJson(res, status, data) { res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(data)); }
function getMode(url) { return url.searchParams.get('mode') || 'word'; }

function handleCurrent(req, res, url) {
  const mode = getMode(url); const store = readStore(); const entry = store.modes?.[mode];
  if (!entry) return sendJson(res, 404, { ok: false, error: '共通問題データは未保存です。', mode });
  return sendJson(res, 200, { ok: true, mode, rows: entry.rows, count: entry.count, updatedAt: entry.updatedAt, filename: entry.filename });
}
function handleStatus(req, res, url) {
  const mode = getMode(url); const store = readStore(); const entry = store.modes?.[mode];
  return sendJson(res, 200, { ok: true, mode, saved: Boolean(entry), count: entry?.count || 0, updatedAt: entry?.updatedAt || null, filename: entry?.filename || null, path: DATA_FILE });
}
function handleUpload(req, res) {
  const contentType = req.headers['content-type'] || '';
  if (!contentType.includes('multipart/form-data')) return sendJson(res, 415, { ok: false, error: 'multipart/form-dataでアップロードしてください。' });
  const chunks = [];
  let total = 0;
  req.on('data', (chunk) => {
    total += chunk.length;
    if (total > MAX_UPLOAD_BYTES) {
      sendJson(res, 413, { ok: false, error: 'アップロードサイズが上限を超えました。' });
      req.destroy();
      return;
    }
    chunks.push(chunk);
  });
  req.on('end', () => {
    try {
      const { fields, file } = parseMultipart(Buffer.concat(chunks), contentType);
      if (!file?.buffer?.length) return sendJson(res, 400, { ok: false, error: 'アップロードファイルがありません。' });
      const mode = fields.mode || 'word';
      const rows = parseUploadedRows(file.buffer);
      const now = new Date().toISOString(); const store = readStore();
      store.modes = store.modes || {}; store.modes[mode] = { rows, count: rows.length, updatedAt: now, filename: file.filename };
      store.updatedAt = now;
      writeStore(store);
      return sendJson(res, 200, { ok: true, mode, count: rows.length, updatedAt: now, filename: file.filename });
    } catch (error) { return sendJson(res, 400, { ok: false, error: error.message }); }
  });
}

function serveStatic(req, res, pathname) {
  const decoded = decodeURIComponent(pathname === '/' ? '/index.html' : pathname);
  const target = path.resolve(PUBLIC_DIR, `.${decoded}`);
  if (!target.startsWith(PUBLIC_DIR) || !fs.existsSync(target) || fs.statSync(target).isDirectory()) { res.writeHead(404); return res.end('Not found'); }
  res.writeHead(200, { 'content-type': MIME_TYPES[path.extname(target)] || 'application/octet-stream' }); fs.createReadStream(target).pipe(res);
}
const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (req.method === 'GET' && url.pathname === '/api/questions/current') return handleCurrent(req, res, url);
  if (req.method === 'GET' && url.pathname === '/api/questions/status') return handleStatus(req, res, url);
  if (req.method === 'POST' && url.pathname === '/api/questions/upload') return handleUpload(req, res);
  return serveStatic(req, res, url.pathname);
});
server.listen(PORT, () => console.log(`english-words-game server listening on ${PORT}; data file: ${DATA_FILE}`));
