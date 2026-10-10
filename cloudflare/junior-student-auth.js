// Junior Cloudflare D1 student login. No public sign-up.
// All identifiers are pseudonymous IDs; do not store plaintext passwords.
// PBKDF2-SHA256 and HttpOnly host-scoped session cookies need Web Crypto only.
import { jsonResponse } from './junior-questions.js';

export const COOKIE_NAME = '__Host-up_junior_session';
export const SESSION_SECONDS = 14 * 24 * 60 * 60;
export const PBKDF2_ITERATIONS = 600000;
export const STUDENT_ID_RE = /^[A-Z0-9][A-Z0-9-]{3,23}$/;
const MAX_BODY_BYTES = 12 * 1024;
const encoder = new TextEncoder();

function hex(bytes) {
  return Array.from(bytes, n => n.toString(16).padStart(2, '0')).join('');
}
function fromHex(encoded) {
  if (typeof encoded !== 'string' || !/^(?:[0-9a-f]{2})+$/i.test(encoded)) return null;
  return Uint8Array.from(encoded.match(/../g), h => parseInt(h, 16));
}
function randomHex(byteCount) {
  return hex(crypto.getRandomValues(new Uint8Array(byteCount)));
}
export function normalizeStudentId(id) {
  const normalized = String(id ?? '').trim().toUpperCase();
  return STUDENT_ID_RE.test(normalized) ? normalized : null;
}
export function validatePassword(password) {
  return typeof password === 'string' && password.length >= 12 && password.length <= 128
    && encoder.encode(password).byteLength <= 256 && !/[\u0000-\u001f\u007f]/.test(password);
}
async function pbkdf2(password, saltBytes, iterations) {
  const inputKey = await crypto.subtle.importKey('raw', encoder.encode(password),
    { name: 'PBKDF2' }, false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({
    name: 'PBKDF2', salt: saltBytes, iterations, hash: 'SHA-256',
  }, inputKey, 256));
}
export async function makePasswordRecord(password) {
  if (!validatePassword(password)) throw new Error('INVALID_PASSWORD');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return {
    password_salt: hex(salt),
    password_hash: hex(await pbkdf2(password, salt, PBKDF2_ITERATIONS)),
    password_iterations: PBKDF2_ITERATIONS,
  };
}
// Never expose raw crypto exceptions: vendor messages can contain input details.
// Local workerd does not enforce every limit of hosted Cloudflare Workers.
export function passwordProcessingUnavailable(error) {
  const limited = error?.name === 'NotSupportedError'
    && /Pbkdf2.*iteration counts above \d+ are not supported/i.test(String(error.message));
  return jsonResponse({
    ok: false,
    code: limited ? 'PASSWORD_KDF_LIMIT' : 'PASSWORD_KDF_UNAVAILABLE',
    error: 'パスワードの安全な保存処理をこの実行環境で利用できません。管理者による設定の確認が必要です。',
  }, 503);
}
function equalFixedBytes(left, right) {
  if (!(left instanceof Uint8Array) || !(right instanceof Uint8Array) || left.length !== right.length) return false;
  let mismatch = 0;
  for (let i = 0; i < left.length; i += 1) mismatch |= left[i] ^ right[i];
  return mismatch === 0;
}
export async function checkStudentPassword(password, student) {
  if (typeof password !== 'string' || password.length > 128 || !student) return false;
  const salt = fromHex(student.password_salt);
  const hash = fromHex(student.password_hash);
  const rounds = Number(student.password_iterations);
  if (!salt || salt.length !== 16 || !hash || hash.length !== 32
      || !Number.isInteger(rounds) || rounds < PBKDF2_ITERATIONS || rounds > 1200000) return false;
  return equalFixedBytes(await pbkdf2(password, salt, rounds), hash);
}
export async function sha256Text(text) {
  return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(text))));
}
export function createSessionToken() { return randomHex(32); }
export function makeTemporaryPassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const limit = Math.floor(256 / alphabet.length) * alphabet.length;
  let result = '';
  while (result.length < 20) {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    for (const byte of bytes) {
      if (byte < limit) result += alphabet[byte % alphabet.length];
      if (result.length >= 20) break;
    }
  }
  return result;
}
export function sessionCookie(token) {
  return COOKIE_NAME + '=' + token + '; Path=/; Max-Age=' + SESSION_SECONDS + '; HttpOnly; Secure; SameSite=Strict';
}
export function expiredSessionCookie() {
  return COOKIE_NAME + '=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict';
}
export function requestSessionToken(request) {
  const cookies = (request.headers.get('Cookie') || '').split(';');
  const item = cookies.find(c => c.trim().startsWith(COOKIE_NAME + '='));
  const value = item?.trim().slice(COOKIE_NAME.length + 1) || '';
  return /^[0-9a-f]{64}$/.test(value) ? value : null;
}
export function postGuard(request) {
  if (request.headers.get('Origin') !== new URL(request.url).origin
      || request.headers.get('Sec-Fetch-Site') === 'cross-site') {
    return jsonResponse({ok:false,error:'このサイトから操作してください。'},403);
  }
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type') || '')) {
    return jsonResponse({ok:false,error:'JSON形式で送信してください。'},415);
  }
  return null;
}
export async function limitedStudentBody(request) {
  const claimed = request.headers.get('Content-Length');
  if (claimed && (Number(claimed) > MAX_BODY_BYTES || !Number.isSafeInteger(Number(claimed)))) {
    throw new Error('BODY_TOO_LARGE');
  }
  if (!request.body) throw new Error('BODY_EMPTY');
  const reader = request.body.getReader();
  const chunks = [];
  let count = 0;
  try {
    while (true) {
      const {done,value} = await reader.read();
      if (done) break;
      count += value.byteLength;
      if (count > MAX_BODY_BYTES) {
        await reader.cancel().catch(() => {});
        throw new Error('BODY_TOO_LARGE');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  if (!count) throw new Error('BODY_EMPTY');
  const all = new Uint8Array(count);
  let at = 0;
  for (const chunk of chunks) {all.set(chunk, at);at += chunk.length;}
  const obj = JSON.parse(new TextDecoder().decode(all));
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) throw new Error('INVALID_JSON_OBJECT');
  return obj;
}
export function databaseGuard(env) {
  return env?.JUNIOR_DB && typeof env.JUNIOR_DB.prepare === 'function'
    ? null : jsonResponse({ok:false,error:'学習管理データベースが未設定です。'},503);
}
export async function getStudentSession(request, env, now = Date.now()) {
  const raw = requestSessionToken(request);
  if (!raw || databaseGuard(env)) return null;
  const hash = await sha256Text(raw);
  const row = await env.JUNIOR_DB.prepare(
    'SELECT s.student_id, s.must_change_password, s.status, t.expires_at_ms, t.token_hash FROM junior_sessions t JOIN junior_students s ON s.student_id=t.student_id WHERE t.token_hash=? AND t.revoked_at_ms IS NULL AND t.expires_at_ms>?'
  ).bind(hash, now).first();
  return row?.status === 'active' ? row : null;
}
export function sessionRequired() {
  return jsonResponse({ok:false,error:'生徒ログインが必要です。'},401);
}
export function passwordChangeRequired() {
  return jsonResponse({ok:false,error:'初回パスワードの変更が必要です。'},403);
}
