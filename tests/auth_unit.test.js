'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

process.env.SESSION_SECRET = 'unit-test-session-secret-that-is-longer-than-32-characters';
process.env.TEMP_PASSWORD_ENCRYPTION_KEY = `base64:${Buffer.alloc(32, 7).toString('base64')}`;
process.env.BCRYPT_ROUNDS = '10';

const { requestOriginAllowed, sessionCookies } = require('../src/auth/app');
const db = require('../src/db');
const { updateMemberName } = require('../src/auth/member-name');
const { nextFailureState } = require('../src/auth/lockout');
const {
  canManageAdministrators,
  canManageGroups,
  canManageMembers,
  canViewAuditLogs,
  canViewTemporaryPasswords,
} = require('../src/auth/permissions');
const {
  createSessionCredentials,
  decryptTemporaryPassword,
  encryptTemporaryPassword,
  hashPassword,
  sessionTokenHash,
  verifyPassword,
} = require('../src/auth/security');
const { cleanMetadata } = require('../src/auth/service');
const { validateLoginId, validatePassword, validatePositiveIds } = require('../src/auth/validation');

test('パスワードはbcryptでハッシュ化し、平文を保持しない', async () => {
  const password = '会員Pass!123';
  const hash = await hashPassword(password);
  assert.match(hash, /^\$2[aby]\$/);
  assert.equal(hash.includes(password), false);
  assert.equal(await verifyPassword(password, hash), true);
  assert.equal(await verifyPassword('wrong-password', hash), false);
});

test('管理者と会員のパスワード長を検証する', () => {
  assert.equal(validatePassword('1234', 'member'), '1234');
  assert.throws(() => validatePassword('123', 'member'), /4文字以上/);
  assert.equal(validatePassword('12345678', 'administrator'), '12345678');
  assert.throws(() => validatePassword('1234567', 'administrator'), /8文字以上/);
  assert.throws(() => validatePassword('x'.repeat(129), 'member'), /128文字以内/);
});

test('ログインIDにSQLインジェクション文字列を許可しない', () => {
  assert.throws(() => validateLoginId("admin' OR 1=1 --"), /半角英数字/);
});

test('仮パスワードはAES-256-GCMで認証付き暗号化する', () => {
  const encrypted = encryptTemporaryPassword('初期Pass!');
  assert.equal(encrypted.includes('初期Pass!'), false);
  assert.equal(decryptTemporaryPassword(encrypted), '初期Pass!');
  const parts = encrypted.split('.');
  parts[3] = `${parts[3][0] === 'A' ? 'B' : 'A'}${parts[3].slice(1)}`;
  const tampered = parts.join('.');
  assert.throws(() => decryptTemporaryPassword(tampered));
});

test('セッショントークンはランダムで、保存用ハッシュとCSRF値を分離する', () => {
  const first = createSessionCredentials();
  const second = createSessionCredentials();
  assert.notEqual(first.token, second.token);
  assert.equal(first.tokenHash, sessionTokenHash(first.token));
  assert.equal(first.tokenHash.includes(first.token), false);
  assert.match(first.tokenHash, /^[a-f0-9]{64}$/);
  assert.notEqual(first.csrfToken, first.token);
});

test('本番CookieはHttpOnly・Secure・SameSite・30日相当の期限を持つ', () => {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const cookies = sessionCookies('member', {
    token: 'raw-session-token', csrfToken: 'csrf-token', expiresAt,
  });
  process.env.NODE_ENV = previous;
  assert.match(cookies[0], /HttpOnly/);
  assert.match(cookies[0], /Secure/);
  assert.match(cookies[0], /SameSite=Lax/);
  assert.match(cookies[0], /Max-Age=2592\d{3}/);
  assert.doesNotMatch(cookies[1], /HttpOnly/);
});

test('CSRFのOrigin検証は同一オリジンだけを許可する', () => {
  const base = { socket: { encrypted: true }, headers: { host: 'example.test' } };
  assert.equal(requestOriginAllowed({ ...base, headers: { ...base.headers, origin: 'https://example.test' } }), true);
  assert.equal(requestOriginAllowed({ ...base, headers: { ...base.headers, origin: 'https://evil.test' } }), false);
  assert.equal(requestOriginAllowed({ ...base, headers: { ...base.headers, 'sec-fetch-site': 'cross-site' } }), false);
});

test('10回目の失敗で15分ロックし、期限切れ後は失敗回数を1から数え直す', () => {
  const now = Date.now();
  const ninth = nextFailureState({ failedLoginCount: 8, now, limit: 10, lockMinutes: 15 });
  assert.equal(ninth.failedLoginCount, 9);
  assert.equal(ninth.locked, false);
  const tenth = nextFailureState({ failedLoginCount: 9, now, limit: 10, lockMinutes: 15 });
  assert.equal(tenth.failedLoginCount, 10);
  assert.equal(tenth.locked, true);
  assert.equal(tenth.lockedUntil.getTime(), now + 15 * 60 * 1000);
  const afterExpiry = nextFailureState({ failedLoginCount: 10, lockedUntil: new Date(now - 1), now, limit: 10, lockMinutes: 15 });
  assert.equal(afterExpiry.failedLoginCount, 1);
  assert.equal(afterExpiry.locked, false);
});

test('権限は代表管理者・一般管理者・閲覧者で分離する', () => {
  assert.equal(canManageAdministrators('owner'), true);
  assert.equal(canManageAdministrators('admin'), false);
  assert.equal(canManageGroups('owner'), true);
  assert.equal(canManageGroups('admin'), true);
  assert.equal(canManageGroups('viewer'), false);
  assert.equal(canManageMembers('admin'), true);
  assert.equal(canManageMembers('viewer'), false);
  assert.equal(canViewTemporaryPasswords('viewer'), false);
  assert.equal(canViewAuditLogs('admin'), false);
});

test('グループ所属の会員ID一覧は正の整数へ正規化して重複を除く', () => {
  assert.deepEqual(validatePositiveIds([3, '2', 3]), [3, 2]);
  assert.throws(() => validatePositiveIds('1,2'), /一覧が正しくありません/);
  assert.throws(() => validatePositiveIds([0]), /対象IDが正しくありません/);
});

test('監査ログ用メタデータから秘密情報を除去する', () => {
  const cleaned = cleanMetadata({ reason: 'test', password: 'secret', nested: { sessionToken: 'secret', safe: 'ok' } });
  assert.deepEqual(cleaned, { reason: 'test', nested: { safe: 'ok' } });
});

test('会員氏名更新は入力を整形し、更新と監査ログを同一トランザクションで行う', async (t) => {
  const originalTransaction = db.transaction;
  const queries = [];
  t.after(() => { db.transaction = originalTransaction; });

  db.transaction = async (callback) => callback({
    async query(sql, params) {
      queries.push({ sql, params });
      if (sql.includes('SELECT name FROM members')) return { rows: [{ name: '旧氏名' }] };
      if (sql.includes('UPDATE members')) {
        return {
          rows: [{
            id: 7,
            member_id: 'UP000007',
            name: params[1],
            is_active: true,
            locked_until: null,
            last_login_at: null,
            password_changed_at: null,
            created_at: new Date('2026-01-01T00:00:00Z'),
          }],
        };
      }
      if (sql.includes('INSERT INTO audit_logs')) return { rows: [] };
      throw new Error(`想定外のSQL: ${sql}`);
    },
  });

  const member = await updateMemberName({ id: 1 }, '7', { name: ' 新氏名 ' });
  assert.equal(member.id, 7);
  assert.equal(member.memberId, 'UP000007');
  assert.equal(member.name, '新氏名');
  assert.deepEqual(queries[1].params, [7, '新氏名']);
  assert.match(queries[2].sql, /member\.name\.updated/);
  assert.deepEqual(JSON.parse(queries[2].params[2]), { nameChanged: true });
  await assert.rejects(updateMemberName({ id: 1 }, 7, { name: '   ' }), /氏名は1文字以上/);
});
