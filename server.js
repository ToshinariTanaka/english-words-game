const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = process.env.DATA_DIR || '/var/data/english_words_game';
const DATA_FILE = process.env.QUESTIONS_FILE || path.join(DATA_DIR, 'current-questions.json');
const STUDY_APP_DATA_DIR = process.env.STUDY_APP_DATA_DIR || '/var/data/study-app';
const STUDY_APP_FILES = { word: 'word_mode.csv', chunk: 'chunk_mode.csv', phrase: 'phrase_mode.csv', definition: 'definition_mode.csv' };
const MODES = ['word', 'chunk', 'phrase', 'definition'];
const STANDARD_COLUMNS = ['row_number', 'level', 'question', 'correct', 'choice1', 'choice2', 'choice3', 'total_correct', 'total_wrong', 'accuracy', 'current_streak', 'note', 'question_key'];
const PUBLIC_DIR = __dirname;
const MAX_UPLOAD_BYTES = Number(process.env.MAX_UPLOAD_BYTES || 10 * 1024 * 1024);

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml; charset=utf-8'
};

function stripBom(value) { return String(value || '').replace(/^\uFEFF/, ''); }
function decodeMultipartHeaderValue(value) { return Buffer.from(String(value || ''), 'binary').toString('utf8'); }
function normalizeStandardRow(row) { return Object.fromEntries(STANDARD_COLUMNS.map((column, index) => [column, stripBom(row[index] ?? '').trim()])); }
function normalizeMatrixRows(matrix) { if (!matrix.length) return []; return matrix.slice(1).map(normalizeStandardRow); }
function escapeCsvCell(value) { const text = String(value ?? ''); return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text; }
function rowsToStandardCsv(rows) { return [STANDARD_COLUMNS, ...rows.map((row) => STANDARD_COLUMNS.map((column) => row[column] ?? ''))].map((row) => row.map(escapeCsvCell).join(',')).join('\n'); }
function decodeUploadBuffer(buffer) { const utf8 = buffer.toString('utf8'); if (!utf8.includes('�')) return utf8; try { return new TextDecoder('shift_jis').decode(buffer); } catch (error) { return utf8; } }
function ensureStudyAppDataDir() { fs.mkdirSync(STUDY_APP_DATA_DIR, { recursive: true }); }
function writeStudyAppCsv(mode, rows) { const filename = STUDY_APP_FILES[mode]; if (!filename) return null; ensureStudyAppDataDir(); const target = path.join(STUDY_APP_DATA_DIR, filename); fs.writeFileSync(target, `\uFEFF${rowsToStandardCsv(rows)}`, 'utf8'); return target; }

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
  return normalizeMatrixRows(rows);
}

function parseUploadedRows(buffer) {
  return parseCsv(decodeUploadBuffer(buffer));
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
    if (filenameMatch) file = { name, filename: decodeMultipartHeaderValue(filenameMatch[1]) || 'upload.csv', buffer: contentBuffer };
    else fields[name] = contentBuffer.toString('utf8');
  }
  return { fields, file };
}


function ensureDataDir() { fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true }); }
function readStore() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
function isSchemaV2Store(store) {
  return store?.schema_version === 2 && store.modes && MODES.every((mode) => store.modes[mode] && Array.isArray(store.modes[mode].rows));
}
function isCompleteRow(row) {
  return ['question', 'correct', 'choice1', 'choice2', 'choice3', 'question_key'].every((key) => String(row?.[key] ?? '').trim() !== '');
}
function normalizeJsonRows(rows) {
  return rows.map((row) => normalizeStandardRow(STANDARD_COLUMNS.map((column) => row?.[column] ?? ''))).filter(isCompleteRow);
}
function writeStore(store) {
  ensureDataDir();
  const tmp = `${DATA_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(store, null, 2));
  fs.renameSync(tmp, DATA_FILE);
}
function sendJson(res, status, data) { res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(data)); }
function getMode(url) { return url.searchParams.get('mode') || 'word'; }
function getCurrentEntry(store, mode) {
  if (!isSchemaV2Store(store)) return null;
  return store.modes[mode || 'word'] || null;
}
function handleCurrent(req, res, url) {
  const requestedMode = getMode(url);
  if (!MODES.includes(requestedMode)) return sendJson(res, 400, { ok: false, error: 'modeはword / chunk / phrase / definitionのいずれかを指定してください。' });
  const store = readStore();
  if (store && store.schema_version !== 2) return sendJson(res, 409, { ok: false, error: '保存済みの共通問題データは旧形式のため使用できません。', legacy: true, mode: requestedMode });
  const entry = getCurrentEntry(store, requestedMode);
  if (!entry) return sendJson(res, 404, { ok: false, error: '共通問題データは未保存です。', mode: requestedMode });
  return sendJson(res, 200, { ok: true, schema_version: 2, mode: requestedMode, rows: entry.rows, count: entry.count, updatedAt: entry.updatedAt, filename: entry.filename });
}
function handleStatus(req, res, url) {
  const requestedMode = url.searchParams.get('mode');
  const store = readStore();
  if (store && store.schema_version !== 2) return sendJson(res, 200, { ok: true, schema_version: null, saved: false, legacy: true, error: '保存済みの共通問題データは旧形式のため使用できません。', path: DATA_FILE });
  if (!isSchemaV2Store(store)) return sendJson(res, 200, { ok: true, schema_version: 2, saved: false, updatedAt: null, filename: null, modes: Object.fromEntries(MODES.map((mode) => [mode, { count: 0 }])), path: DATA_FILE });
  if (requestedMode) {
    const entry = store.modes[requestedMode];
    return sendJson(res, 200, { ok: true, schema_version: 2, mode: requestedMode, saved: Boolean(entry), count: entry?.count || 0, updatedAt: entry?.updatedAt || null, filename: entry?.filename || null, path: DATA_FILE });
  }
  return sendJson(res, 200, { ok: true, schema_version: 2, saved: true, updatedAt: store.updatedAt, filename: store.filename, modes: Object.fromEntries(MODES.map((mode) => [mode, { count: store.modes[mode].count }])), path: DATA_FILE });
}
function handleUpload(req, res) {
  return sendJson(res, 410, { ok: false, error: 'このAPIは旧形式のため使用できません。新形式の4シートExcelは /api/questions/upload-workbook を使用してください。' });
}
function handleLegacyUpload(req, res) {
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
      if (!['word', 'chunk', 'phrase', 'definition'].includes(mode)) return sendJson(res, 400, { ok: false, error: 'modeはword / chunk / phrase / definitionのいずれかを指定してください。' });
      const rows = parseUploadedRows(file.buffer);
      const now = new Date().toISOString(); const store = readStore() || { modes: {}, updatedAt: null };
      const studyAppCsvPath = writeStudyAppCsv(mode, rows);
      const entry = { mode, rows, count: rows.length, updatedAt: now, filename: file.filename, csvPath: studyAppCsvPath };
      store.modes = store.modes || {}; store.modes[mode] = entry;
      store.current = entry;
      store.updatedAt = now;
      writeStore(store);
      return sendJson(res, 200, { ok: true, mode, count: rows.length, updatedAt: now, filename: file.filename, csvPath: studyAppCsvPath });
    } catch (error) { return sendJson(res, 400, { ok: false, error: error.message }); }
  });
}


function readJsonBody(req, callback) {
  const chunks = [];
  let total = 0;
  req.on('data', (chunk) => {
    total += chunk.length;
    if (total > MAX_UPLOAD_BYTES) {
      sendJson(callback.res, 413, { ok: false, error: 'アップロードサイズが上限を超えました。' });
      req.destroy();
      return;
    }
    chunks.push(chunk);
  });
  req.on('end', () => {
    try { callback(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); }
    catch (error) { sendJson(callback.res, 400, { ok: false, error: 'JSON形式が不正です。' }); }
  });
}
function handleWorkbookUpload(req, res) {
  if (!(req.headers['content-type'] || '').includes('application/json')) return sendJson(res, 415, { ok: false, error: 'application/jsonで送信してください。' });
  const done = (payload) => {
    try {
      if (payload.schema_version !== 2) throw new Error('schema_version: 2 が必要です。');
      if (!payload.modes || typeof payload.modes !== 'object') throw new Error('modesが必要です。');
      const now = new Date().toISOString();
      const filename = String(payload.filename || 'study-app-workbook.xlsx');
      const modes = {};
      for (const mode of MODES) {
        if (!Array.isArray(payload.modes[mode])) throw new Error(`modes.${mode}.rows が配列ではありません。`);
        const rows = normalizeJsonRows(payload.modes[mode]);
        if (rows.length === 0) throw new Error(`${mode} に出題可能行がありません。`);
        modes[mode] = { mode, rows, count: rows.length, updatedAt: now, filename };
      }
      const store = { schema_version: 2, updatedAt: now, filename, modes };
      writeStore(store);
      return sendJson(res, 200, { ok: true, schema_version: 2, updatedAt: now, filename, modes: Object.fromEntries(MODES.map((mode) => [mode, { count: modes[mode].count }])) });
    } catch (error) { return sendJson(res, 400, { ok: false, error: error.message }); }
  };
  done.res = res;
  readJsonBody(req, done);
}

function serveStatic(req, res, pathname) {
  const rawPath = pathname.endsWith('/') ? `${pathname}index.html` : pathname;
  const decoded = decodeURIComponent(rawPath === '/' ? '/index.html' : rawPath);
  const target = path.resolve(PUBLIC_DIR, `.${decoded}`);
  if (!target.startsWith(PUBLIC_DIR) || !fs.existsSync(target) || fs.statSync(target).isDirectory()) { res.writeHead(404); return res.end('Not found'); }
  res.writeHead(200, { 'content-type': MIME_TYPES[path.extname(target)] || 'application/octet-stream' }); fs.createReadStream(target).pipe(res);
}
const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (req.method === 'GET' && url.pathname === '/api/questions/current') return handleCurrent(req, res, url);
  if (req.method === 'GET' && url.pathname === '/api/questions/status') return handleStatus(req, res, url);
  if (req.method === 'POST' && url.pathname === '/api/questions/upload-workbook') return handleWorkbookUpload(req, res);
  if (req.method === 'POST' && url.pathname === '/api/questions/upload') return handleUpload(req, res);
  if (req.method === 'POST' && url.pathname === '/api/study-app/upload') return handleLegacyUpload(req, res);
  return serveStatic(req, res, url.pathname);
});
server.listen(PORT, () => console.log(`english-words-game server listening on ${PORT}; data file: ${DATA_FILE}`));
