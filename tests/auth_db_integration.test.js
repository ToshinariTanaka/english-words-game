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
    await db.query('TRUNCATE audit_logs, sessions, group_members, groups, members, administrators RESTART IDENTITY CASCADE');
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

  test('グループを作成し、会員所属の差し替え・更新・アーカイブを監査する', async () => {
    const memberRows = await db.query('SELECT id FROM members ORDER BY id LIMIT 3');
    const memberIds = memberRows.rows.map((row) => Number(row.id));
    assert.equal(memberIds.length, 3);

    const group = await service.createGroup(actor, { name: '中学1年A', description: '月曜クラス' });
    assert.equal(group.name, '中学1年A');
    await assert.rejects(
      () => service.createGroup(actor, { name: '中学1年a', description: '' }),
      /同じ名前のグループ/,
    );

    const firstMembership = await service.replaceGroupMembers(actor, group.id, memberIds.slice(0, 2));
    assert.deepEqual(firstMembership.memberIds, memberIds.slice(0, 2));
    assert.deepEqual(await service.getGroupMemberIds(group.id), memberIds.slice(0, 2));

    const secondMembership = await service.replaceGroupMembers(actor, group.id, memberIds.slice(1));
    assert.deepEqual(secondMembership.memberIds, memberIds.slice(1));
    await assert.rejects(
      () => service.replaceGroupMembers(actor, group.id, [999999]),
      /会員の一部が見つかりません/,
    );

    const updated = await service.updateGroup(actor, group.id, { name: '中学1年B', description: '火曜クラス' });
    assert.equal(updated.name, '中学1年B');
    assert.equal(updated.memberCount, 2);
    assert.equal((await service.listGroups())[0].memberCount, 2);

    await service.archiveGroup(actor, group.id);
    assert.deepEqual(await service.listGroups(), []);
    const audit = await db.query(
      `SELECT action FROM audit_logs
        WHERE target_type = 'group' AND target_id = $1 ORDER BY id`,
      [group.id],
    );
    assert.deepEqual(audit.rows.map((row) => row.action), [
      'group.created',
      'group.members.replaced',
      'group.members.replaced',
      'group.updated',
      'group.archived',
    ]);
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
