// Cloudflare Pages Functions: shared junior question storage.
// R2 bucket is NOT public. Only these routes can access it.
export const MODES = ['word', 'chunk', 'phrase', 'definition'];
export const COLUMNS = [
  'row_number', 'level', 'question', 'correct', 'choice1', 'choice2', 'choice3',
  'total_correct', 'total_wrong', 'accuracy', 'current_streak', 'note', 'question_key',
];
const PREFIX = { word: 'w', chunk: 'c', phrase: 'p', definition: 's' };
const LEVELS = new Set(['A1', 'A2', 'B1', 'B2', 'C1', 'C2']);
const FILTERS = new Set(['all', 'a1a2', 'target1800']);
export const MANIFEST_KEY = 'junior-questions/manifest/current.json';
export const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;

export function jsonResponse(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status, headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...headers,
    },
  });
}

export function checkAuth(request, env) {
  const secret = String(env.JUNIOR_UPLOAD_TOKEN || '');
  if (secret.length < 32) return false; // fail closed if not configured
  const header = request.headers.get('Authorization') || '';
  const expected = 'Bearer ' + secret;
  if (header.length > 512) return false;
  let difference = header.length ^ expected.length;
  for (let i = 0; i < Math.max(header.length, expected.length); i += 1) {
    difference |= (header.charCodeAt(i) || 0) ^ (expected.charCodeAt(i) || 0);
  }
  return difference === 0;
}

export function rejectRequest(request, env) {
  if (!env.JUNIOR_DATA || !env.JUNIOR_UPLOAD_TOKEN) {
    return jsonResponse({ ok: false, error: 'CloudflareのR2バインディングか管理者シークレットが未設定です。' }, 503);
  }
  const origin = request.headers.get('Origin');
  if (origin !== new URL(request.url).origin) {
    return jsonResponse({ ok: false, error: '同じサイトの管理画面から操作してください。' }, 403);
  }
  if (!checkAuth(request, env)) {
    return jsonResponse({ ok: false, error: '管理者用の認証情報が正しくありません。' }, 401);
  }
  const ct = request.headers.get('Content-Type') || '';
  if (!/^application\/json(?:\s*;|$)/i.test(ct)) {
    return jsonResponse({ ok: false, error: 'JSON形式で送信してください。' }, 415);
  }
  return null;
}

export function validateRelease(input) {
  if (!input || input.version !== 1 || !FILTERS.has(input.filter)
      || !input.modes || Array.isArray(input.modes) || typeof input.modes !== 'object') {
    throw new Error('配信データの形式または絞り込み条件が不正です。');
  }
  const filename = String(input.filename || '').trim();
  if (!filename || filename.length > 180 || !/\.xlsx$/i.test(filename)) {
    throw new Error('Excelファイル名が不正です（.xlsxのみ対応）。');
  }
  const cleaned = {};
  const counts = {};
  let total = 0;
  for (const mode of MODES) {
    const source = input.modes[mode];
    if (!Array.isArray(source) || source.length < 1 || source.length > 12000) {
      throw new Error(mode + ' の問題数が不正です。各モード1〜12000問にしてください。');
    }
    const keys = new Set();
    const rows = [];
    for (const row of source) {
      if (!row || typeof row !== 'object' || Array.isArray(row)) {
        throw new Error(mode + ' の問題データが不正です。');
      }
      const clean = {};
      for (const field of COLUMNS) {
        const value = String(row[field] ?? '').trim();
        if (value.length > (field === 'note' ? 2500 : 1200)) {
          throw new Error(mode + ' の ' + field + ' が長すぎます。');
        }
        clean[field] = value;
      }
      clean.level = clean.level.toUpperCase();
      if (!LEVELS.has(clean.level)) throw new Error(mode + ' のCEFRレベルに不正があります。');
      if (input.filter === 'a1a2' && !['A1', 'A2'].includes(clean.level)) {
        throw new Error('A1・A2設定なのに別レベルの問題が含まれています。');
      }
      const qkey = clean.question_key;
      if (!new RegExp('^' + PREFIX[mode] + '\\d{6}$').test(qkey) || keys.has(qkey)) {
        throw new Error(mode + ' の問題IDが不正または重複しています。');
      }
      keys.add(qkey);
      const answers = ['correct', 'choice1', 'choice2', 'choice3'].map((c) => clean[c].normalize('NFKC').toLowerCase());
      if (!clean.question || answers.some((v) => !v) || new Set(answers).size !== 4) {
        throw new Error(mode + ' の問題文または4択選択肢に不備があります。');
      }
      rows.push(clean);
    }
    cleaned[mode] = rows;
    counts[mode] = rows.length;
    total += rows.length;
  }
  if (total > 24000) throw new Error('最大24000問まで対応しています。');
  return { filename, filter: input.filter, modes: cleaned, counts, total };
}

export async function limitedJsonBody(request) {
  const claimed = Number(request.headers.get('Content-Length') || 0);
  if (claimed > MAX_UPLOAD_BYTES) throw new Error('FILE_TOO_LARGE');
  const reader = request.body?.getReader();
  if (!reader) throw new Error('EMPTY_BODY');
  const chunks = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > MAX_UPLOAD_BYTES) {
      await reader.cancel().catch(() => {});
      throw new Error('FILE_TOO_LARGE');
    }
    chunks.push(value);
  }
  const all = new Uint8Array(length);
  let cursor = 0;
  for (const chunk of chunks) {
    all.set(chunk, cursor);
    cursor += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(all));
}

export async function readManifest(env) {
  const obj = await env.JUNIOR_DATA.get(MANIFEST_KEY);
  if (!obj) return null;
  const manifest = JSON.parse(await obj.text());
  if (!manifest?.versionId || !/^[0-9a-fTZ._-]{15,90}$/.test(manifest.versionId)) {
    throw new Error('公開データの管理情報が不正です。');
  }
  return manifest;
}

export function versionObjectKey(versionId, mode) {
  return 'junior-questions/releases/' + versionId + '/' + mode + '.json';
}
