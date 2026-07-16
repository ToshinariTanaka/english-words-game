const http = require('http');
const https = require('https');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const authApp = require('./src/auth/app');
const authDb = require('./src/db');

const PORT = Number(process.env.PORT || 3000);
const APP_VARIANT = String(process.env.APP_VARIANT || 'default').trim() || 'default';
const IS_JUNIOR_VARIANT = APP_VARIANT === 'junior';
const APP_TITLE = process.env.APP_TITLE || (IS_JUNIOR_VARIANT ? '中学生英単語アプリ' : '英語学習アプリ');
const APP_SUBTITLE = process.env.APP_SUBTITLE || (IS_JUNIOR_VARIANT ? '中学生専用・英単語／チャンク／文節／英文トレーニング' : 'English Study');
const DATA_DIR = process.env.DATA_DIR || (IS_JUNIOR_VARIANT ? '/var/data/junior' : '/var/data/english_words_game');
// Keep QUESTIONS_FILE as the JSON store override. QUESTION_FILE stores the uploaded workbook copy.
const DATA_FILE = process.env.QUESTIONS_FILE || path.join(DATA_DIR, 'current-questions.json');
const QUESTION_FILE = process.env.QUESTION_FILE || path.join(DATA_DIR, 'questions.xlsx');
const STUDY_APP_DATA_DIR = process.env.STUDY_APP_DATA_DIR || (IS_JUNIOR_VARIANT ? path.join(DATA_DIR, 'study-app') : '/var/data/study-app');
const AUDIO_DIR = process.env.AUDIO_DIR || (IS_JUNIOR_VARIANT ? path.join(DATA_DIR, 'audio') : '/var/data/audio');
const AUDIO_MANIFEST_FILE = process.env.AUDIO_MANIFEST_FILE || path.join(AUDIO_DIR, 'audio_manifest.json');
const AUDIO_BACKUP_DIR = process.env.AUDIO_BACKUP_DIR || path.join(path.dirname(AUDIO_DIR), 'mp3_backup_before_relink');
const STUDY_APP_FILES = { word: 'word_mode.csv', chunk: 'chunk_mode.csv', phrase: 'phrase_mode.csv', definition: 'definition_mode.csv' };
const MODES = ['word', 'chunk', 'phrase', 'definition'];
const MODE_ALIASES = { vocabulary: 'word', sentence: 'definition', translation: 'definition' };
const OFFICIAL_WORKBOOK_SHEETS = { word: '★英単語', chunk: '★チャンク', phrase: '★文節和訳', definition: '★英文和訳' };
const STANDARD_COLUMNS = ['row_number', 'level', 'question', 'correct', 'choice1', 'choice2', 'choice3', 'total_correct', 'total_wrong', 'accuracy', 'current_streak', 'note', 'question_key'];
const MODE_KEY_PREFIXES = { word: 'w', chunk: 'c', phrase: 'p', definition: 's' };
const ALLOWED_LEVELS = new Set(['A1', 'A2', 'B1', 'B2', 'C1', 'C2']);
const MAX_SHOWN_UPLOAD_ERRORS = 20;
const PUBLIC_DIR = __dirname;
const MAX_UPLOAD_BYTES = Number(process.env.MAX_UPLOAD_BYTES || 10 * 1024 * 1024);
const MAX_AUDIO_GENERATION_ITEMS = 10;
const OPENAI_TTS_ENDPOINT = process.env.OPENAI_TTS_ENDPOINT || 'https://api.openai.com/v1/audio/speech';
const OPENAI_TTS_MODEL = process.env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts';
const OPENAI_TTS_VOICE = process.env.OPENAI_TTS_VOICE || 'marin';
const OPENAI_TTS_VOICES = new Set(['alloy', 'ash', 'ballad', 'coral', 'echo', 'fable', 'nova', 'onyx', 'sage', 'shimmer', 'verse', 'marin', 'cedar']);
const PYTHON_PACKAGE_DIR = process.env.PYTHON_PACKAGE_DIR || path.join(__dirname, '.python_packages');
const PYTHON_COMMAND = process.env.PYTHON_COMMAND || process.env.PYTHON || 'python3';

if (!authDb.isConfigured()) {
  authDb.warnOnce('DATABASE_URL が未設定です。既存の英語学習機能だけを起動します。');
}

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
function getPythonEnv() {
  return {
    ...process.env,
    PYTHONPATH: [PYTHON_PACKAGE_DIR, process.env.PYTHONPATH].filter(Boolean).join(path.delimiter),
    PYTHONIOENCODING: process.env.PYTHONIOENCODING || 'utf-8',
    PYTHONUTF8: process.env.PYTHONUTF8 || '1',
  };
}

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


function logWorkbookParserFailure(parsed, command) {
  console.error('Excel workbook parser diagnostics:', {
    command,
    errorMessage: parsed.error?.message || null,
    status: parsed.status,
    stderr: parsed.stderr || '',
    stdout: parsed.stdout || '',
    cwd: process.cwd(),
    path: process.env.PATH || '',
    pythonPackageDir: PYTHON_PACKAGE_DIR,
    pythonPath: getPythonEnv().PYTHONPATH || '',
  });
}

function buildPythonDiagnostics() {
  const pythonCommand = PYTHON_COMMAND;
  const python = { available: false };
  const openpyxl = { available: false };
  const pythonEnv = getPythonEnv();
  const pythonVersion = spawnSync(pythonCommand, ['--version'], { encoding: 'utf8', env: pythonEnv });
  if (pythonVersion.error) {
    python.error = pythonVersion.error.message;
    openpyxl.error = `${pythonCommand} is not available, so openpyxl could not be checked.`;
    return { ok: false, python, openpyxl, pythonPackageDir: PYTHON_PACKAGE_DIR, pythonPath: pythonEnv.PYTHONPATH || '' };
  }
  if (pythonVersion.status !== 0) {
    python.error = (pythonVersion.stderr || pythonVersion.stdout || `${pythonCommand} --version exited with status ${pythonVersion.status}`).trim();
    openpyxl.error = `${pythonCommand} version check failed, so openpyxl could not be checked.`;
    return { ok: false, python, openpyxl, pythonPackageDir: PYTHON_PACKAGE_DIR, pythonPath: pythonEnv.PYTHONPATH || '' };
  }
  python.available = true;
  python.version = (pythonVersion.stdout || pythonVersion.stderr || '').trim();

  const openpyxlCheck = spawnSync(pythonCommand, ['-c', 'import openpyxl; print(openpyxl.__version__)'], { encoding: 'utf8', env: pythonEnv });
  if (openpyxlCheck.error) {
    openpyxl.error = openpyxlCheck.error.message;
  } else if (openpyxlCheck.status !== 0) {
    openpyxl.error = (openpyxlCheck.stderr || openpyxlCheck.stdout || `openpyxl check exited with status ${openpyxlCheck.status}`).trim();
  } else {
    openpyxl.available = true;
    openpyxl.version = (openpyxlCheck.stdout || '').trim();
  }

  return { ok: python.available && openpyxl.available, python, openpyxl, pythonPackageDir: PYTHON_PACKAGE_DIR, pythonPath: pythonEnv.PYTHONPATH || '' };
}

function parseWorkbookBuffer(buffer) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'english-words-workbook-'));
  const workbookPath = path.join(tmpDir, 'upload.xlsx');
  const scriptPath = path.join(tmpDir, 'parse_workbook.py');
  fs.writeFileSync(workbookPath, buffer);
  fs.writeFileSync(scriptPath, `
import json
import sys
from openpyxl import load_workbook
workbook = load_workbook(sys.argv[1], read_only=True, data_only=True)
result = {}
for sheet_name in workbook.sheetnames:
    rows = []
    for row in workbook[sheet_name].iter_rows(values_only=True):
        rows.append(['' if value is None else str(value) for value in row])
    result[sheet_name] = rows
print(json.dumps(result, ensure_ascii=False))
`, 'utf8');
  try {
    const parsed = spawnSync(PYTHON_COMMAND, [scriptPath, workbookPath], { encoding: 'utf8', env: getPythonEnv(), maxBuffer: 20 * 1024 * 1024 });
    if (parsed.error) {
      logWorkbookParserFailure(parsed, `${PYTHON_COMMAND} ${scriptPath} ${workbookPath}`);
      throw new Error('Excelファイルの読み込みに失敗しました。Render環境で Python / openpyxl が利用できるか確認してください。');
    }
    if (parsed.status !== 0) {
      logWorkbookParserFailure(parsed, `${PYTHON_COMMAND} ${scriptPath} ${workbookPath}`);
      throw new Error('Excelファイルの読み込みに失敗しました。Render環境で Python / openpyxl が利用できるか確認してください。');
    }
    return JSON.parse(parsed.stdout || '{}');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function parseOfficialWorkbookRows(buffer) {
  const sheets = parseWorkbookBuffer(buffer);
  const actualSheetNames = Object.keys(sheets);
  const requiredSheetNames = Object.values(OFFICIAL_WORKBOOK_SHEETS);
  const missing = requiredSheetNames.filter((sheetName) => !Object.prototype.hasOwnProperty.call(sheets, sheetName));
  const extra = actualSheetNames.filter((sheetName) => !requiredSheetNames.includes(sheetName));
  if (missing.length || extra.length) {
    throw new Error(`正式アップロードは .xlsx の4シートExcelのみ対応です。必要シート: ${requiredSheetNames.join(' / ')}。不足: ${missing.join(' / ') || 'なし'}。許可外: ${extra.join(' / ') || 'なし'}。`);
  }
  return Object.fromEntries(MODES.map((mode) => [mode, normalizeMatrixRows(sheets[OFFICIAL_WORKBOOK_SHEETS[mode]] || [])]));
}

function isCompleteRow(row) {
  return ['question', 'correct', 'choice1', 'choice2', 'choice3'].every((column) => String(row[column] || '').trim() !== '');
}

function rowHasAnyOfficialContent(row) {
  return ['level', 'question', 'correct', 'choice1', 'choice2', 'choice3', 'question_key'].some((column) => String(row[column] || '').trim() !== '');
}

function normalizeDuplicateValue(value) {
  return String(value || '').trim().normalize('NFKC').toLowerCase();
}

function makeValidationResponse(errors) {
  const shownErrors = errors.slice(0, MAX_SHOWN_UPLOAD_ERRORS);
  return {
    ok: false,
    error: `アップロード検証エラーが${errors.length}件あります。`,
    errors: shownErrors,
    errorCount: errors.length,
    shownErrorCount: shownErrors.length,
    moreErrorCount: Math.max(0, errors.length - shownErrors.length),
  };
}

function validateOfficialModeRows(modeRows) {
  const errors = [];
  const playableRows = {};
  for (const mode of MODES) {
    const rows = modeRows[mode] || [];
    const sheetName = OFFICIAL_WORKBOOK_SHEETS[mode];
    const prefix = MODE_KEY_PREFIXES[mode];
    const keys = new Map();
    playableRows[mode] = [];
    rows.forEach((row, index) => {
      const excelRow = index + 2;
      if (!rowHasAnyOfficialContent(row)) return;
      if (!isCompleteRow(row)) return;
      const level = String(row.level || '').trim().toUpperCase();
      const key = String(row.question_key || '').trim();
      if (!ALLOWED_LEVELS.has(level)) errors.push(`${sheetName} ${excelRow}行目: B列 level は A1, A2, B1, B2, C1, C2 のいずれかにしてください。`);
      if (!key) errors.push(`${sheetName} ${excelRow}行目: M列 question_key が空です。`);
      else if (!new RegExp(`^${prefix}\\d{6}$`).test(key)) errors.push(`${sheetName} ${excelRow}行目: M列 question_key は ${prefix}000001 形式にしてください。`);
      if (key) {
        if (keys.has(key)) errors.push(`${sheetName} ${excelRow}行目: M列 question_key が同一シート内で重複しています（${keys.get(key)}行目と同じ ${key}）。`);
        else keys.set(key, excelRow);
      }
      const answerValues = ['correct', 'choice1', 'choice2', 'choice3'].map((column) => normalizeDuplicateValue(row[column]));
      if (new Set(answerValues).size !== answerValues.length) errors.push(`${sheetName} ${excelRow}行目: D〜G列に正規化後重複する選択肢があります。`);
      playableRows[mode].push({ ...row, level, question_key: key });
    });
    if (playableRows[mode].length === 0) errors.push(`${sheetName}: C〜G列がすべて入った出題対象行が0件です。`);
  }
  return { errors, playableRows };
}

function hasSchemaVersion2(store) { return store?.schema_version === 2; }
function legacyResponse(res) { return sendJson(res, 409, { ok: false, legacy: true }); }
function buildSchemaV2Store(modeRows, filename, updatedAt) {
  return {
    schema_version: 2,
    updatedAt,
    filename,
    modes: Object.fromEntries(MODES.map((mode) => {
      const rows = modeRows[mode] || [];
      return [mode, { mode, rows, count: rows.length }];
    })),
  };
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
function writeUploadedQuestionFile(buffer) {
  if (!QUESTION_FILE) return;
  fs.mkdirSync(path.dirname(QUESTION_FILE), { recursive: true });
  const tmp = `${QUESTION_FILE}.tmp`;
  fs.writeFileSync(tmp, buffer);
  fs.renameSync(tmp, QUESTION_FILE);
}
function readStore() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return { schema_version: 2, modes: {}, updatedAt: null, filename: null }; throw error; }
}
function writeStore(store) {
  ensureDataDir();
  const tmp = `${DATA_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(store, null, 2));
  fs.renameSync(tmp, DATA_FILE);
}
function sendJson(res, status, data) { res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(data)); }
function ensureAudioDir() { fs.mkdirSync(AUDIO_DIR, { recursive: true }); }
function readAudioManifest() {
  try {
    const manifest = JSON.parse(fs.readFileSync(AUDIO_MANIFEST_FILE, 'utf8'));
    return manifest?.schema_version === 1 && manifest.items && typeof manifest.items === 'object' ? manifest : { schema_version: 1, items: {} };
  } catch (error) {
    if (error.code === 'ENOENT') return { schema_version: 1, items: {} };
    throw error;
  }
}
function writeAudioManifestFromItems(items, filename = null) {
  ensureAudioDir();
  const now = new Date().toISOString();
  const existing = readAudioManifest().items || {};
  const nextItems = { ...existing };
  for (const item of items) {
    nextItems[item.questionKey] = {
      mode: item.mode,
      sheetName: item.sheetName,
      excelRow: item.excelRow,
      question_key: item.questionKey,
      questionId: item.questionKey,
      text: item.question,
      filename: item.filename,
      updatedAt: now,
    };
  }
  const manifest = { schema_version: 1, source: 'official_workbook_question_key', filename, updatedAt: now, items: nextItems };
  const tmp = `${AUDIO_MANIFEST_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(manifest, null, 2));
  fs.renameSync(tmp, AUDIO_MANIFEST_FILE);
  return manifest;
}
function getManifestEntryForFilename(filename) {
  const manifest = readAudioManifest();
  return Object.values(manifest.items || {}).find((entry) => entry?.filename === filename) || null;
}
function isManifestedAudioFile(filename) {
  const entry = getManifestEntryForFilename(filename);
  return Boolean(entry && entry.filename === filename);
}
function quarantineAudioFile(filename) {
  ensureAudioDir();
  fs.mkdirSync(AUDIO_BACKUP_DIR, { recursive: true });
  const src = path.resolve(AUDIO_DIR, filename);
  if (!src.startsWith(path.resolve(AUDIO_DIR) + path.sep) || !fs.existsSync(src) || !fs.statSync(src).isFile()) return null;
  let finalDest = path.join(AUDIO_BACKUP_DIR, filename);
  for (let i = 1; fs.existsSync(finalDest); i += 1) {
    finalDest = path.join(AUDIO_BACKUP_DIR, `${path.basename(filename, '.mp3')}.${i}.mp3`);
  }
  fs.renameSync(src, finalDest);
  return { filename, backup: finalDest };
}
function quarantineExistingAudioFiles() {
  ensureAudioDir();
  fs.mkdirSync(AUDIO_BACKUP_DIR, { recursive: true });
  const moved = [];
  for (const name of fs.readdirSync(AUDIO_DIR)) {
    if (!/\.mp3$/i.test(name)) continue;
    const src = path.join(AUDIO_DIR, name);
    if (!fs.statSync(src).isFile()) continue;
    const dest = path.join(AUDIO_BACKUP_DIR, name);
    let finalDest = dest;
    for (let i = 1; fs.existsSync(finalDest); i += 1) {
      finalDest = path.join(AUDIO_BACKUP_DIR, `${path.basename(name, '.mp3')}.${i}.mp3`);
    }
    fs.renameSync(src, finalDest);
    moved.push({ filename: name, backup: finalDest });
  }
  return moved;
}
function isAllowedAudioFilename(filename) { return /^[wcps]\d{6}\.mp3$/.test(String(filename || '')); }
function isAllowedAudioKey(key) { return /^[wcps]\d{6}$/.test(String(key || '')); }
function validateAudioKeyRange(startKey, endKey) {
  if (startKey && !isAllowedAudioKey(startKey)) throw new Error('キーは w000021 のように、英字1文字 + 6桁で入力してください。0が多すぎる可能性があります。');
  if (endKey && !isAllowedAudioKey(endKey)) throw new Error('キーは w000021 のように、英字1文字 + 6桁で入力してください。0が多すぎる可能性があります。');
  if (startKey && endKey && startKey > endKey) throw new Error('開始キーは終了キー以下にしてください。');
}
function isGeneratedAudioFile(filename) {
  if (!isManifestedAudioFile(filename)) return false;
  const target = path.resolve(AUDIO_DIR, filename);
  if (!target.startsWith(path.resolve(AUDIO_DIR) + path.sep)) return false;
  try { return fs.statSync(target).isFile() && fs.statSync(target).size > 0; }
  catch (error) { return false; }
}
function parseAudioVoice(value) {
  const voice = String(value || OPENAI_TTS_VOICE).trim() || OPENAI_TTS_VOICE;
  if (!OPENAI_TTS_VOICES.has(voice)) throw new Error(`音声 voice は ${Array.from(OPENAI_TTS_VOICES).join(' / ')} から選択してください。`);
  return voice;
}
function keyWithOffset(key, offset) {
  const match = String(key || '').match(/^([wcps])(\d{6})$/);
  if (!match) return '';
  return `${match[1]}${String(Number(match[2]) + offset).padStart(6, '0')}`;
}


function readUInt(buffer, offset, bytes) {
  if (offset < 0 || offset + bytes > buffer.length) throw new Error('ZIPファイルの構造が不正です。');
  if (bytes === 2) return buffer.readUInt16LE(offset);
  if (bytes === 4) return buffer.readUInt32LE(offset);
  throw new Error('Unsupported integer size');
}

function parseZipMp3Entries(buffer) {
  const entries = [];
  const eocdMinOffset = Math.max(0, buffer.length - 0xffff - 22);
  let eocdOffset = -1;
  for (let offset = Math.max(0, buffer.length - 22); offset >= eocdMinOffset; offset -= 1) {
    if (offset + 4 <= buffer.length && buffer.readUInt32LE(offset) === 0x06054b50) { eocdOffset = offset; break; }
  }
  if (eocdOffset < 0) throw new Error('ZIPファイルとして読み込めませんでした。');
  const entryCount = readUInt(buffer, eocdOffset + 10, 2);
  const centralDirectoryOffset = readUInt(buffer, eocdOffset + 16, 4);
  let offset = centralDirectoryOffset;
  for (let index = 0; index < entryCount; index += 1) {
    if (readUInt(buffer, offset, 4) !== 0x02014b50) throw new Error('ZIP中央ディレクトリが不正です。');
    const compressionMethod = readUInt(buffer, offset + 10, 2);
    const compressedSize = readUInt(buffer, offset + 20, 4);
    const uncompressedSize = readUInt(buffer, offset + 24, 4);
    const filenameLength = readUInt(buffer, offset + 28, 2);
    const extraLength = readUInt(buffer, offset + 30, 2);
    const commentLength = readUInt(buffer, offset + 32, 2);
    const localHeaderOffset = readUInt(buffer, offset + 42, 4);
    const rawName = buffer.slice(offset + 46, offset + 46 + filenameLength).toString('utf8');
    offset += 46 + filenameLength + extraLength + commentLength;
    if (rawName.endsWith('/')) continue;
    if (!/\.mp3$/i.test(path.basename(rawName))) {
      entries.push({ originalName: rawName, filename: path.basename(rawName), skipped: true, reason: 'mp3以外のファイルです。' });
      continue;
    }
    if (readUInt(buffer, localHeaderOffset, 4) !== 0x04034b50) throw new Error('ZIPローカルヘッダーが不正です。');
    const localFilenameLength = readUInt(buffer, localHeaderOffset + 26, 2);
    const localExtraLength = readUInt(buffer, localHeaderOffset + 28, 2);
    const dataOffset = localHeaderOffset + 30 + localFilenameLength + localExtraLength;
    const compressed = buffer.slice(dataOffset, dataOffset + compressedSize);
    let data;
    if (compressionMethod === 0) data = compressed;
    else if (compressionMethod === 8) data = require('zlib').inflateRawSync(compressed);
    else entries.push({ originalName: rawName, filename: path.basename(rawName), skipped: true, reason: `未対応のZIP圧縮方式です（method=${compressionMethod}）。` });
    if (!data) continue;
    if (data.length !== uncompressedSize) throw new Error(`ZIP内ファイルの展開サイズが不正です: ${rawName}`);
    entries.push({ originalName: rawName, filename: path.basename(rawName), buffer: data });
  }
  return entries;
}

function sendAudioHeaders(res, status, extraHeaders = {}) {
  res.writeHead(status, {
    'content-type': 'audio/mpeg',
    'access-control-allow-origin': '*',
    ...extraHeaders,
  });
}

function handleAudio(req, res, pathname) {
  const filename = decodeURIComponent(pathname.replace(/^\/audio\//, ''));
  if (!/^[A-Za-z0-9_-]+\.mp3$/.test(filename)) {
    sendAudioHeaders(res, 400);
    return res.end('Bad request');
  }
  const target = path.resolve(AUDIO_DIR, filename);
  if (!target.startsWith(path.resolve(AUDIO_DIR) + path.sep)) {
    sendAudioHeaders(res, 403);
    return res.end('Forbidden');
  }
  if (!isManifestedAudioFile(filename) || !fs.existsSync(target) || fs.statSync(target).isDirectory()) {
    sendAudioHeaders(res, 404);
    return res.end('Not found');
  }
  sendAudioHeaders(res, 200);
  fs.createReadStream(target).pipe(res);
}
function getMode(url) { const raw = url.searchParams.get('mode') || 'word'; return MODE_ALIASES[raw] || raw; }

function getCurrentEntry(store, mode) {
  return store.modes?.[mode || 'word'] || null;
}
function handleCurrent(req, res, url) {
  const requestedMode = getMode(url);
  const store = readStore();
  if (!hasSchemaVersion2(store)) return legacyResponse(res);
  const entry = getCurrentEntry(store, requestedMode);
  if (!entry) return sendJson(res, 404, { ok: false, error: '共通問題データは未保存です。', mode: requestedMode });
  return sendJson(res, 200, { ok: true, mode: entry.mode || requestedMode, rows: entry.rows || [], count: entry.count || 0, updatedAt: store.updatedAt || null, filename: store.filename || null });
}
function handlePythonDiagnostics(req, res) {
  return sendJson(res, 200, buildPythonDiagnostics());
}
function handleAppConfig(req, res) {
  return sendJson(res, 200, {
    ok: true,
    variant: APP_VARIANT,
    title: APP_TITLE,
    subtitle: APP_SUBTITLE,
    modes: MODES,
  });
}

function handleStatus(req, res, url) {
  const store = readStore();
  if (!hasSchemaVersion2(store)) return sendJson(res, 200, { ok: true, schema_version: null, legacy: true, saved: false, modes: Object.fromEntries(MODES.map((mode) => [mode, { count: 0 }])), updatedAt: null, filename: null });
  const modes = Object.fromEntries(MODES.map((mode) => [mode, { count: store.modes?.[mode]?.count || 0 }]));
  return sendJson(res, 200, { ok: true, schema_version: 2, saved: MODES.every((mode) => Boolean(store.modes?.[mode])), modes, updatedAt: store.updatedAt || null, filename: store.filename || null });
}
function readMultipartRequest(req, res, onReady) {
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
  req.on('end', () => onReady(Buffer.concat(chunks), contentType));
}

function handleUpload(req, res) {
  return sendJson(res, 410, {
    ok: false,
    error: 'このAPIは旧形式のため使用できません。\n新形式の4シートExcelは /api/questions/upload-workbook を使用してください。',
  });
}

function handleAudioUpload(req, res) {
  const configuredToken = process.env.AUDIO_UPLOAD_TOKEN || '';
  if (!configuredToken) return sendJson(res, 503, { ok: false, error: '音声アップロードAPIは無効です。AUDIO_UPLOAD_TOKENを設定してください。' });
  const requestToken = req.headers['x-audio-upload-token'] || '';
  if (requestToken !== configuredToken) return sendJson(res, 403, { ok: false, error: 'アップロードトークンが不正です。' });

  return readMultipartRequest(req, res, (bodyBuffer, contentType) => {
    try {
      const { file } = parseMultipart(bodyBuffer, contentType);
      if (!file?.buffer?.length) return sendJson(res, 400, { ok: false, error: '空ファイル、またはアップロードファイルがありません。' });
      const filename = path.basename(file.filename || '');
      if (!isAllowedAudioFilename(filename)) {
        return sendJson(res, 400, { ok: false, error: 'MP3ファイル名は w000001.mp3 / c000001.mp3 / p000001.mp3 / s000001.mp3 形式にしてください。' });
      }
      ensureAudioDir();
      const target = path.resolve(AUDIO_DIR, filename);
      if (!target.startsWith(path.resolve(AUDIO_DIR) + path.sep)) return sendJson(res, 403, { ok: false, error: '保存先が不正です。' });
      fs.writeFileSync(target, file.buffer);
      return sendJson(res, 200, { ok: true, filename, url: `/audio/${filename}` });
    } catch (error) {
      return sendJson(res, 400, { ok: false, error: error.message });
    }
  });
}


function handleAudioZipUpload(req, res) {
  const configuredToken = process.env.AUDIO_UPLOAD_TOKEN || '';
  if (!configuredToken) return sendJson(res, 503, { ok: false, error: '音声アップロードAPIは無効です。AUDIO_UPLOAD_TOKENを設定してください。' });
  const requestToken = req.headers['x-audio-upload-token'] || '';
  if (requestToken !== configuredToken) return sendJson(res, 403, { ok: false, error: 'アップロードトークンが不正です。' });

  return readMultipartRequest(req, res, (bodyBuffer, contentType) => {
    try {
      const { file } = parseMultipart(bodyBuffer, contentType);
      if (!file?.buffer?.length) return sendJson(res, 400, { ok: false, error: '空ファイル、またはアップロードファイルがありません。' });
      if (!/\.zip$/i.test(file.filename || '')) return sendJson(res, 400, { ok: false, error: 'ZIPファイル（.zip）をアップロードしてください。' });
      ensureAudioDir();
      const errors = [];
      const saved = [];
      let skipped = 0;
      const entries = parseZipMp3Entries(file.buffer);
      for (const entry of entries) {
        if (entry.skipped) { skipped += 1; errors.push({ file: entry.originalName, reason: entry.reason }); continue; }
        if (!isAllowedAudioFilename(entry.filename)) { skipped += 1; errors.push({ file: entry.originalName, reason: 'MP3ファイル名は w000001.mp3 / c000001.mp3 / p000001.mp3 / s000001.mp3 形式のみ許可されています。' }); continue; }
        if (!entry.buffer?.length) { skipped += 1; errors.push({ file: entry.originalName, reason: '空ファイルです。' }); continue; }
        const target = path.resolve(AUDIO_DIR, entry.filename);
        if (!target.startsWith(path.resolve(AUDIO_DIR) + path.sep)) { skipped += 1; errors.push({ file: entry.originalName, reason: '保存先が不正です。' }); continue; }
        fs.writeFileSync(target, entry.buffer);
        saved.push({ file: entry.originalName, filename: entry.filename, url: `/audio/${entry.filename}` });
      }
      return sendJson(res, 200, { ok: true, uploaded: saved.length, skipped, errors, files: saved });
    } catch (error) {
      return sendJson(res, 400, { ok: false, error: error.message });
    }
  });
}


function parsePositiveLimit(value, fallback = MAX_AUDIO_GENERATION_ITEMS) {
  const parsed = Number.parseInt(String(value || ''), 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, MAX_AUDIO_GENERATION_ITEMS);
}

function selectedAudioModes(rawMode) {
  const mode = String(rawMode || 'word').trim();
  if (mode === 'all') return MODES;
  if (!MODES.includes(mode)) throw new Error('対象モードは word / chunk / phrase / definition / all から選択してください。');
  return [mode];
}

function keyInRange(key, startKey, endKey) {
  if (startKey && key < startKey) return false;
  if (endKey && key > endKey) return false;
  return true;
}

function collectAudioGenerationItems(modeRows, modes, startKey, endKey, limit = Number.POSITIVE_INFINITY) {
  const items = [];
  for (const mode of modes) {
    const prefix = MODE_KEY_PREFIXES[mode];
    const sheetName = OFFICIAL_WORKBOOK_SHEETS[mode];
    const rows = modeRows[mode] || [];
    rows.forEach((row, index) => {
      const question = String(row.question || '').trim();
      const questionKey = String(row.question_key || '').trim();
      if (!question || !questionKey) return;
      if (!new RegExp(`^${prefix}\\d{6}$`).test(questionKey)) return;
      if (!keyInRange(questionKey, startKey, endKey)) return;
      if (items.length < limit) items.push({ mode, sheetName, excelRow: index + 2, question, questionKey, filename: `${questionKey}.mp3` });
    });
  }
  return items;
}

function buildAudioGenerationStatus(modeRows, modes, startKey, endKey) {
  const items = collectAudioGenerationItems(modeRows, modes, startKey, endKey, Number.POSITIVE_INFINITY);
  const generatedItems = items.filter((item) => isGeneratedAudioFile(item.filename));
  const missingItems = items.filter((item) => !isGeneratedAudioFile(item.filename));
  let lastContiguousGeneratedKey = null;
  for (const item of items) {
    if (!isGeneratedAudioFile(item.filename)) break;
    lastContiguousGeneratedKey = item.questionKey;
  }
  const firstMissingKey = missingItems[0]?.questionKey || null;
  const nextMissingKeys = missingItems.slice(0, MAX_AUDIO_GENERATION_ITEMS).map((item) => item.questionKey);
  return {
    total: items.length,
    generated: generatedItems.length,
    missing: missingItems.length,
    generatedRate: items.length ? generatedItems.length / items.length : 0,
    firstKey: items[0]?.questionKey || null,
    lastKey: items[items.length - 1]?.questionKey || null,
    lastContiguousGeneratedKey,
    firstMissingKey,
    nextStartKey: firstMissingKey,
    nextEndKey: firstMissingKey ? keyWithOffset(firstMissingKey, MAX_AUDIO_GENERATION_ITEMS - 1) : null,
    nextMissingKeys,
  };
}

function synthesizeTextToMp3(text, voice = OPENAI_TTS_VOICE, timeoutMs = 60000) {
  const apiKey = process.env.OPENAI_API_KEY || '';
  if (!apiKey) return Promise.reject(new Error('OPENAI_API_KEY が未設定です。Render側の環境変数に設定してください。'));
  const endpoint = new URL(OPENAI_TTS_ENDPOINT);
  const body = Buffer.from(JSON.stringify({ model: OPENAI_TTS_MODEL, voice, input: text, response_format: 'mp3' }), 'utf8');
  const transport = endpoint.protocol === 'http:' ? http : https;
  return new Promise((resolve, reject) => {
    const req = transport.request(endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'Content-Length': body.length },
      timeout: timeoutMs,
    }, (apiRes) => {
      const chunks = [];
      apiRes.on('data', (chunk) => chunks.push(chunk));
      apiRes.on('end', () => {
        const responseBody = Buffer.concat(chunks);
        if (apiRes.statusCode < 200 || apiRes.statusCode >= 300) {
          return reject(new Error(`TTS API error HTTP ${apiRes.statusCode}: ${responseBody.toString('utf8').slice(0, 500)}`));
        }
        resolve(responseBody);
      });
    });
    req.on('timeout', () => { req.destroy(new Error('TTS API request timed out.')); });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function handleAudioGenerateFromWorkbook(req, res) {
  const configuredToken = process.env.AUDIO_UPLOAD_TOKEN || '';
  if (!configuredToken) return sendJson(res, 503, { ok: false, error: '音声管理APIは無効です。AUDIO_UPLOAD_TOKENを設定してください。' });
  const requestToken = req.headers['x-audio-upload-token'] || '';
  if (requestToken !== configuredToken) return sendJson(res, 403, { ok: false, error: 'アップロードトークンが不正です。' });
  if (!process.env.OPENAI_API_KEY) return sendJson(res, 503, { ok: false, error: 'OPENAI_API_KEY が未設定です。Render側の環境変数に設定してください。' });

  return readMultipartRequest(req, res, async (bodyBuffer, contentType) => {
    try {
      const { fields, file } = parseMultipart(bodyBuffer, contentType);
      if (!file?.buffer?.length) return sendJson(res, 400, { ok: false, error: 'Excelファイルを選択してください。' });
      if (!/\.xlsx$/i.test(file.filename || '')) return sendJson(res, 400, { ok: false, error: '.xlsx の4シートExcelをアップロードしてください。' });
      const modes = selectedAudioModes(fields.mode);
      const startKey = String(fields.startKey || '').trim();
      const endKey = String(fields.endKey || '').trim();
      validateAudioKeyRange(startKey, endKey);
      const limit = parsePositiveLimit(fields.limit);
      const overwrite = String(fields.overwrite || '') === 'true';
      const voice = parseAudioVoice(fields.voice);
      const modeRows = parseOfficialWorkbookRows(file.buffer);
      const validation = validateOfficialModeRows(modeRows);
      if (validation.errors.length) return sendJson(res, 400, makeValidationResponse(validation.errors));
      const items = collectAudioGenerationItems(validation.playableRows, modes, startKey, endKey, limit);
      ensureAudioDir();
      const quarantined = overwrite ? quarantineExistingAudioFiles() : [];
      const results = [];
      let generated = 0;
      let skipped = 0;
      let failed = 0;
      for (const item of items) {
        const target = path.resolve(AUDIO_DIR, item.filename);
        if (!target.startsWith(path.resolve(AUDIO_DIR) + path.sep)) { failed += 1; results.push({ ...item, status: 'failed', message: '保存先が不正です。' }); continue; }
        if (isGeneratedAudioFile(item.filename) && !overwrite) { skipped += 1; results.push({ ...item, status: 'skipped', message: '既存MP3があるためスキップしました。', url: `/audio/${item.filename}` }); continue; }
        try {
          if (!overwrite && !isManifestedAudioFile(item.filename)) {
            const moved = quarantineAudioFile(item.filename);
            if (moved) quarantined.push(moved);
          }
          const mp3 = await synthesizeTextToMp3(item.question, voice);
          if (!mp3.length) throw new Error('TTS APIから空の音声が返されました。');
          fs.writeFileSync(target, mp3);
          generated += 1;
          writeAudioManifestFromItems([item], file.filename);
          results.push({ ...item, status: 'generated', message: '生成しました。', url: `/audio/${item.filename}` });
        } catch (error) {
          failed += 1;
          results.push({ ...item, status: 'failed', message: error.message });
        }
      }
      return sendJson(res, failed ? 207 : 200, { ok: failed === 0, requestedMode: fields.mode || 'word', limit, overwrite, voice, outputDir: AUDIO_DIR, manifestFile: AUDIO_MANIFEST_FILE, backupDir: AUDIO_BACKUP_DIR, quarantined, total: items.length, generated, skipped, failed, results });
    } catch (error) {
      return sendJson(res, 400, { ok: false, error: error.message });
    }
  });
}


function handleAudioGenerationStatus(req, res) {
  const configuredToken = process.env.AUDIO_UPLOAD_TOKEN || '';
  if (!configuredToken) return sendJson(res, 503, { ok: false, error: '音声管理APIは無効です。AUDIO_UPLOAD_TOKENを設定してください。' });
  const requestToken = req.headers['x-audio-upload-token'] || '';
  if (requestToken !== configuredToken) return sendJson(res, 403, { ok: false, error: 'アップロードトークンが不正です。' });

  return readMultipartRequest(req, res, (bodyBuffer, contentType) => {
    try {
      const { fields, file } = parseMultipart(bodyBuffer, contentType);
      if (!file?.buffer?.length) return sendJson(res, 400, { ok: false, error: 'Excelファイルを選択してください。' });
      if (!/\.xlsx$/i.test(file.filename || '')) return sendJson(res, 400, { ok: false, error: '.xlsx の4シートExcelをアップロードしてください。' });
      const modes = selectedAudioModes(fields.mode);
      const startKey = String(fields.startKey || '').trim();
      const endKey = String(fields.endKey || '').trim();
      validateAudioKeyRange(startKey, endKey);
      const modeRows = parseOfficialWorkbookRows(file.buffer);
      const validation = validateOfficialModeRows(modeRows);
      if (validation.errors.length) return sendJson(res, 400, makeValidationResponse(validation.errors));
      ensureAudioDir();
      return sendJson(res, 200, { ok: true, requestedMode: fields.mode || 'word', outputDir: AUDIO_DIR, manifestFile: AUDIO_MANIFEST_FILE, ...buildAudioGenerationStatus(validation.playableRows, modes, startKey, endKey) });
    } catch (error) {
      return sendJson(res, 400, { ok: false, error: error.message });
    }
  });
}

function handleWorkbookUpload(req, res) {
  return readMultipartRequest(req, res, (bodyBuffer, contentType) => {
    try {
      const { file } = parseMultipart(bodyBuffer, contentType);
      if (!file?.buffer?.length) return sendJson(res, 400, { ok: false, error: 'アップロードファイルがありません。' });
      if (!/\.xlsx$/i.test(file.filename || '')) return sendJson(res, 400, { ok: false, error: '正式アップロードは .xlsx の4シートExcelのみ対応です。' });
      const modeRows = parseOfficialWorkbookRows(file.buffer);
      const validation = validateOfficialModeRows(modeRows);
      if (validation.errors.length) return sendJson(res, 400, makeValidationResponse(validation.errors));
      const now = new Date().toISOString();
      const store = buildSchemaV2Store(validation.playableRows, file.filename, now);
      writeStore(store);
      writeUploadedQuestionFile(file.buffer);
      return sendJson(res, 200, { ok: true, schema_version: 2, modes: Object.fromEntries(MODES.map((mode) => [mode, { count: validation.playableRows[mode].length }])), updatedAt: now, filename: file.filename });
    } catch (error) { return sendJson(res, 400, { ok: false, error: error.message }); }
  });
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
  if (authApp.canHandle(url.pathname)) return authApp.handle(req, res, url);
  if (req.method === 'GET' && url.pathname === '/api/app-config') return handleAppConfig(req, res);
  if (req.method === 'GET' && url.pathname === '/api/questions/current') return handleCurrent(req, res, url);
  if (req.method === 'GET' && url.pathname === '/api/questions/status') return handleStatus(req, res, url);
  if (req.method === 'GET' && url.pathname === '/api/diagnostics/python') return handlePythonDiagnostics(req, res);
  if (req.method === 'GET' && url.pathname.startsWith('/audio/')) return handleAudio(req, res, url.pathname);
  if (req.method === 'POST' && url.pathname === '/api/questions/upload-workbook') return handleWorkbookUpload(req, res);
  if (req.method === 'POST' && url.pathname === '/api/audio/upload') return handleAudioUpload(req, res);
  if (req.method === 'POST' && url.pathname === '/api/audio/upload-zip') return handleAudioZipUpload(req, res);
  if (req.method === 'POST' && url.pathname === '/api/audio/generation-status') return handleAudioGenerationStatus(req, res);
  if (req.method === 'POST' && url.pathname === '/api/audio/generate-from-workbook') return handleAudioGenerateFromWorkbook(req, res);
  if (req.method === 'POST' && (url.pathname === '/api/questions/upload' || url.pathname === '/api/study-app/upload')) return handleUpload(req, res);
  return serveStatic(req, res, url.pathname);
});
server.listen(PORT, () => console.log(`english-words-game server listening on ${PORT}; data file: ${DATA_FILE}`));
