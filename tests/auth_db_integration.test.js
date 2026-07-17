'use strict';

const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');

const testDatabaseUrl = String(process.env.TEST_DATABASE_URL || '').trim();

if (!testDatabaseUrl) {
  test('PostgreSQL統合テスト', { skip: 'TEST_DATABASE_URL が未設定のためスキップしました。' }, () => {});
} else {
  process.env.DATABASE_URL = testDatabaseUrl;
  process.env.SESSION_SECRET ||= 'integration-test-session-secret-longer-than-thirty-two';
  process.env.TEMP_PASSWORD_ENCRYPTION_KEY ||= `base64:${Buffer.alloc(32, 11).toString('base64')}`;
  process.env.BCRYPT_ROUNDS ||= '10';

  const db = require('../src/db');
  const { migrate } = require('../src/db/migrator');
  const { hashPassword } = require('../src/auth/security');
  const service = require('../src/auth/service');

  const actor = { id: 1, accountType: 'administrator', role: 'owner' };

  before(async () => {
    await migrate();
    await db.query('TRUNCATE audit_logs, sessions, members, administrators RESTART IDENTITY CASCADE');
    await db.query("ALTER SEQUENCE member_number_seq RESTART WITH 1");
    const passwordHash = await hashPassword('OwnerPass123!');
    await db.query(
      `INSERT INTO administrators (login_id, display_name, role, password_hash)
       VALUES ('owner-test', '代表テスト', 'owner', $1)`,
      [passwordHash],
    );
  });

  after(async () => db.close());

  test('マイグレーションを二重適用しない', async () => {
    const second = await migrate();
    assert.deepEqual(second.applied, []);
  });

  test('会員IDを同時作成しても重複せず、削除に依存しない連番となる', async () => {
    const members = await Promise.all(
      Array.from({ length: 5 }, (_, index) => service.createMember(actor, { name: `会員${index}`, password: '1234' })),
    );
    assert.equal(new Set(members.map((member) => member.memberId)).size, 5);
    assert.deepEqual(members.map((member) => member.memberId).sort(), ['UP000001', 'UP000002', 'UP000003', 'UP000004', 'UP000005']);
  });

  test('正常ログイン、30日セッション、ログアウトを処理する', async () => {
    const login = await service.authenticate('administrator', 'owner-test', 'OwnerPass123!', {});
    const remainingDays = (new Date(login.session.expiresAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000);
    assert.ok(remainingDays > 29.9 && remainingDays <= 30.01);
    const found = await service.getSession('administrator', login.session.token);
    assert.equal(found.account.loginId, 'owner-test');
    await service.revokeCurrentSession({ ...found, token: login.session.token }, {});
    assert.equal(await service.getSession('administrator', login.session.token), null);
  });

  test('会員パスワード変更で仮パスワード表示用データと旧セッションを失効する', async () => {
    const member = await service.createMember(actor, { name: '変更テスト', password: '1234' });
    const login = await service.authenticate('member', member.memberId, '1234', {});
    const current = await service.getSession('member', login.session.token);
    const changed = await service.changeOwnPassword(current, '1234', '5678', {});
    assert.equal(await service.getSession('member', login.session.token), null);
    assert.ok(await service.getSession('member', changed.session.token));
    const row = await db.query('SELECT temporary_password_encrypted FROM members WHERE id = $1', [member.id]);
    assert.equal(row.rows[0].temporary_password_encrypted, null);
    await assert.rejects(() => service.authenticate('member', member.memberId, '1234', {}));
    assert.ok(await service.authenticate('member', member.memberId, '5678', {}));
  });

  test('ログイン失敗10回でロックし、管理者が解除できる', async () => {
    const member = await service.createMember(actor, { name: 'ロックテスト', password: '1234' });
    for (let attempt = 1; attempt <= 9; attempt += 1) {
      await assert.rejects(() => service.authenticate('member', member.memberId, 'wrong', {}), /正しくありません/);
    }
    await assert.rejects(() => service.authenticate('member', member.memberId, 'wrong', {}), /一時停止/);
    await assert.rejects(() => service.authenticate('member', member.memberId, '1234', {}), /一時停止/);
    await service.unlockAccount(actor, 'member', member.id);
    assert.ok(await service.authenticate('member', member.memberId, '1234', {}));
  });
}
