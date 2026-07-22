'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { after, before, test } = require('node:test');

const testDatabaseUrl = String(process.env.TEST_DATABASE_URL || '').trim();

if (!testDatabaseUrl) {
  test('グループ管理PostgreSQL統合テスト', { skip: 'TEST_DATABASE_URL が未設定のためスキップしました。' }, () => {});
} else {
  process.env.DATABASE_URL = testDatabaseUrl;
  process.env.SESSION_SECRET ||= 'group-integration-session-secret-longer-than-thirty-two';
  process.env.TEMP_PASSWORD_ENCRYPTION_KEY ||= `base64:${Buffer.alloc(32, 19).toString('base64')}`;
  process.env.BCRYPT_ROUNDS ||= '10';

  const db = require('../src/db');
  const { migrate } = require('../src/db/migrator');
  const { hashPassword } = require('../src/auth/security');
  const service = require('../src/auth/service');

  const actor = { id: 1, accountType: 'administrator', role: 'owner' };
  const administratorPasswords = {
    owner: 'OwnerPass123!',
    admin: 'AdminPass123!',
    viewer: 'ViewerPass123!',
  };
  let child = null;
  let port = 0;
  let memberIds = [];

  function request(pathname, { method = 'GET', body, cookie, csrfToken, origin } = {}) {
    return new Promise((resolve, reject) => {
      const payload = body === undefined ? null : Buffer.from(JSON.stringify(body), 'utf8');
      const headers = { Accept: 'application/json' };
      if (payload) {
        headers['Content-Type'] = 'application/json';
        headers['Content-Length'] = payload.length;
      }
      if (cookie) headers.Cookie = cookie;
      if (csrfToken) headers['X-CSRF-Token'] = csrfToken;
      if (origin) headers.Origin = origin;
      const req = http.request({ hostname: '127.0.0.1', port, path: pathname, method, headers }, (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          let json = null;
          try { json = JSON.parse(text); } catch (_) { /* non-JSON static response */ }
          resolve({ status: res.statusCode, headers: res.headers, text, json });
        });
      });
      req.on('error', reject);
      if (payload) req.write(payload);
      req.end();
    });
  }

  async function waitForServer() {
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      if (child.exitCode !== null) throw new Error(`server exited with ${child.exitCode}`);
      try {
        const response = await request('/api/auth/status');
        if (response.status === 200) return;
      } catch (_) { /* server is still starting */ }
      await new Promise((resolve) => setTimeout(resolve, 80));
    }
    throw new Error('server startup timed out');
  }

  async function login(loginId, password) {
    const response = await request('/api/auth/admin/login', {
      method: 'POST',
      body: { loginId, password },
      origin: `http://127.0.0.1:${port}`,
    });
    assert.equal(response.status, 200);
    const cookie = (response.headers['set-cookie'] || []).map((value) => value.split(';')[0]).join('; ');
    return { cookie, csrfToken: response.json.csrfToken, account: response.json.account };
  }

  function authenticatedRequest(session, pathname, options = {}) {
    return request(pathname, {
      ...options,
      cookie: session.cookie,
      csrfToken: options.csrfToken === undefined ? session.csrfToken : options.csrfToken,
      origin: options.origin === undefined ? `http://127.0.0.1:${port}` : options.origin,
    });
  }

  before(async () => {
    await migrate();
    await db.query('TRUNCATE audit_logs, sessions, group_members, groups, members, administrators RESTART IDENTITY CASCADE');
    await db.query("ALTER SEQUENCE member_number_seq RESTART WITH 1");

    const hashes = await Promise.all(Object.values(administratorPasswords).map((password) => hashPassword(password)));
    await db.query(
      `INSERT INTO administrators (login_id, display_name, role, password_hash)
       VALUES ('owner-test', '代表テスト', 'owner', $1),
              ('admin-test', '一般管理者テスト', 'admin', $2),
              ('viewer-test', '閲覧者テスト', 'viewer', $3)`,
      hashes,
    );
    const members = await Promise.all(
      Array.from({ length: 5 }, (_, index) => service.createMember(actor, { name: `グループ会員${index + 1}`, password: '1234' })),
    );
    memberIds = members.map((member) => member.id);

    port = 42_000 + Math.floor(Math.random() * 2_000);
    child = spawn(process.execPath, ['server.js'], {
      cwd: path.join(__dirname, '..'),
      env: {
        ...process.env,
        PORT: String(port),
        DATABASE_URL: testDatabaseUrl,
        NODE_ENV: 'test',
      },
      stdio: 'ignore',
    });
    await waitForServer();
  });

  after(async () => {
    if (child && child.exitCode === null) {
      child.kill();
      await Promise.race([
        new Promise((resolve) => child.once('exit', resolve)),
        new Promise((resolve) => setTimeout(resolve, 2_000)),
      ]);
    }
    await db.close();
  });

  test('002_groups.sqlは再実行安全で、既存データ・制約・削除規則を維持する', async () => {
    const beforeMembers = Number((await db.query('SELECT COUNT(*)::int AS count FROM members')).rows[0].count);
    const migrationSql = fs.readFileSync(path.join(__dirname, '../src/db/migrations/002_groups.sql'), 'utf8');
    await db.query(migrationSql);
    await db.query(migrationSql);
    const afterMembers = Number((await db.query('SELECT COUNT(*)::int AS count FROM members')).rows[0].count);
    assert.equal(afterMembers, beforeMembers);

    const versions = await db.query('SELECT version FROM schema_migrations ORDER BY version');
    assert.deepEqual(versions.rows.map((row) => row.version), ['001_auth_foundation.sql', '002_groups.sql']);

    const columns = await db.query(
      `SELECT table_name, column_name, character_maximum_length
         FROM information_schema.columns
        WHERE table_schema = 'public'
          AND (table_name, column_name) IN (('groups', 'name'), ('groups', 'description'))`,
    );
    const lengths = Object.fromEntries(columns.rows.map((row) => [row.column_name, Number(row.character_maximum_length)]));
    assert.deepEqual(lengths, { description: 500, name: 100 });

    const constraints = await db.query(
      `SELECT conname, contype, confdeltype
         FROM pg_constraint
        WHERE conrelid IN ('groups'::regclass, 'group_members'::regclass)`,
    );
    const byName = Object.fromEntries(constraints.rows.map((row) => [row.conname, row]));
    assert.equal(byName.groups_created_by_fkey.confdeltype, 'n');
    assert.equal(byName.group_members_group_id_fkey.confdeltype, 'c');
    assert.equal(byName.group_members_member_id_fkey.confdeltype, 'c');
    assert.equal(byName.group_members_added_by_fkey.confdeltype, 'n');
    assert.equal(byName.group_members_pkey.contype, 'p');

    const uniqueIndex = await db.query(
      `SELECT indisunique, pg_get_expr(indpred, indrelid) AS predicate
         FROM pg_index
        WHERE indexrelid = 'groups_name_active_unique'::regclass`,
    );
    assert.equal(uniqueIndex.rows[0].indisunique, true);
    assert.match(uniqueIndex.rows[0].predicate, /archived_at IS NULL/i);
  });

  test('グループ作成・一覧・編集・入力境界・同名再作成を検証する', async () => {
    const group = await service.createGroup(actor, { name: 'BoundaryA', description: '' });
    assert.equal(group.description, '');
    assert.ok((await service.listGroups()).some((item) => item.id === group.id));

    await assert.rejects(() => service.createGroup(actor, { name: 'BoundaryA', description: '' }), { code: 'CONFLICT' });
    await assert.rejects(() => service.createGroup(actor, { name: 'boundarya', description: '' }), { code: 'CONFLICT' });
    await assert.rejects(() => service.createGroup(actor, { name: '名'.repeat(101), description: '' }), { code: 'VALIDATION_ERROR' });
    await assert.rejects(() => service.createGroup(actor, { name: '説明超過', description: '説'.repeat(501) }), { code: 'VALIDATION_ERROR' });
    await assert.rejects(() => service.updateGroup(actor, 999999, { name: '存在しない' }), { code: 'NOT_FOUND' });

    const updated = await service.updateGroup(actor, group.id, { name: '境界テスト更新', description: '' });
    assert.equal(updated.name, '境界テスト更新');
    assert.equal(updated.description, '');
    await service.archiveGroup(actor, group.id);
    await assert.rejects(() => service.updateGroup(actor, group.id, { name: '更新不可' }), { code: 'NOT_FOUND' });
    await assert.rejects(() => service.getGroupMemberIds(group.id), { code: 'NOT_FOUND' });
    await assert.rejects(() => service.replaceGroupMembers(actor, group.id, []), { code: 'NOT_FOUND' });

    const recreated = await service.createGroup(actor, { name: '境界テスト更新', description: '再作成' });
    assert.notEqual(recreated.id, group.id);
    await service.archiveGroup(actor, recreated.id);

    const sqlText = "安全'); DROP TABLE groups; --";
    const sqlGroup = await service.createGroup(actor, { name: sqlText, description: '<script>not executable</script>' });
    assert.equal(sqlGroup.name, sqlText);
    assert.equal((await db.query("SELECT to_regclass('public.groups') AS table_name")).rows[0].table_name, 'groups');
    await service.archiveGroup(actor, sqlGroup.id);
  });

  test('所属の差し替え・0名・重複除去・不正会員拒否・ロールバック・履歴保持を検証する', async () => {
    const group = await service.createGroup(actor, { name: '所属整合性', description: '' });
    assert.deepEqual((await service.replaceGroupMembers(actor, group.id, memberIds.slice(0, 2))).memberIds, memberIds.slice(0, 2));
    assert.equal((await service.listGroups()).find((item) => item.id === group.id).memberCount, 2);

    assert.deepEqual((await service.replaceGroupMembers(actor, group.id, memberIds.slice(1, 3))).memberIds, memberIds.slice(1, 3));
    assert.deepEqual((await service.replaceGroupMembers(actor, group.id, [memberIds[0], memberIds[0], memberIds[1]])).memberIds, memberIds.slice(0, 2));
    await assert.rejects(() => service.replaceGroupMembers(actor, group.id, [0]), { code: 'VALIDATION_ERROR' });
    await assert.rejects(() => service.replaceGroupMembers(actor, group.id, ['invalid']), { code: 'VALIDATION_ERROR' });
    await assert.rejects(() => service.replaceGroupMembers(actor, group.id, [999999]), { code: 'NOT_FOUND' });
    assert.deepEqual(await service.getGroupMemberIds(group.id), memberIds.slice(0, 2));

    await db.query('UPDATE members SET archived_at = NOW() WHERE id = $1', [memberIds[4]]);
    await assert.rejects(() => service.replaceGroupMembers(actor, group.id, [memberIds[4]]), { code: 'NOT_FOUND' });
    await assert.rejects(() => service.replaceGroupMembers(actor, group.id, Array(5001).fill(memberIds[0])), { code: 'VALIDATION_ERROR' });
    assert.deepEqual(await service.getGroupMemberIds(group.id), memberIds.slice(0, 2));

    await assert.rejects(
      () => service.replaceGroupMembers({ ...actor, id: 999999 }, group.id, [memberIds[1], memberIds[2]]),
      (error) => error.code === '23503',
    );
    assert.deepEqual(await service.getGroupMemberIds(group.id), memberIds.slice(0, 2));

    assert.deepEqual((await service.replaceGroupMembers(actor, group.id, [])).memberIds, []);
    assert.equal((await service.listGroups()).find((item) => item.id === group.id).memberCount, 0);
    await service.replaceGroupMembers(actor, group.id, memberIds.slice(0, 2));
    await service.archiveGroup(actor, group.id);
    assert.equal((await db.query('SELECT COUNT(*)::int AS count FROM group_members WHERE group_id = $1', [group.id])).rows[0].count, 2);
    assert.equal((await service.listGroups()).some((item) => item.id === group.id), false);
    await assert.rejects(() => service.replaceGroupMembers(actor, group.id, []), { code: 'NOT_FOUND' });
  });

  test('グループ監査ログは変更内容を記録し、秘密情報を含まない', async () => {
    const group = await service.createGroup(actor, { name: '監査テスト', description: '作成時' });
    await service.updateGroup(actor, group.id, { name: '監査テスト更新', description: '更新時' });
    await service.replaceGroupMembers(actor, group.id, memberIds.slice(0, 2));
    await service.archiveGroup(actor, group.id);

    const result = await db.query(
      `SELECT action, metadata
         FROM audit_logs
        WHERE target_type = 'group' AND target_id = $1
        ORDER BY id`,
      [group.id],
    );
    assert.deepEqual(result.rows.map((row) => row.action), [
      'group.created',
      'group.updated',
      'group.members.replaced',
      'group.archived',
    ]);
    assert.deepEqual(result.rows[0].metadata, { name: '監査テスト' });
    assert.deepEqual(result.rows[1].metadata, { nameChanged: true, descriptionChanged: true });
    assert.deepEqual(result.rows[2].metadata, {
      addedMemberIds: memberIds.slice(0, 2),
      removedMemberIds: [],
      memberCount: 2,
    });
    assert.deepEqual(result.rows[3].metadata, { name: '監査テスト更新' });
    assert.doesNotMatch(JSON.stringify(result.rows), /password|session|cookie|secret|token/i);
  });

  test('ownerとadminはAPI操作でき、viewer・未認証・CSRF不正は全操作を拒否する', async () => {
    const owner = await login('owner-test', administratorPasswords.owner);
    const admin = await login('admin-test', administratorPasswords.admin);
    const viewer = await login('viewer-test', administratorPasswords.viewer);
    assert.equal(owner.account.capabilities.manageGroups, true);
    assert.equal(admin.account.capabilities.manageGroups, true);
    assert.equal(viewer.account.capabilities.manageGroups, false);

    const ownerCreate = await authenticatedRequest(owner, '/api/admin/groups', {
      method: 'POST', body: { name: 'API代表作成', description: '' },
    });
    assert.equal(ownerCreate.status, 201);
    const ownerGroupId = ownerCreate.json.group.id;
    assert.equal((await authenticatedRequest(owner, '/api/admin/groups')).status, 200);

    const unauthenticatedCases = [
      ['GET', '/api/admin/groups', undefined],
      ['POST', '/api/admin/groups', { name: '未認証作成', description: '' }],
      ['PATCH', `/api/admin/groups/${ownerGroupId}`, { name: '未認証編集' }],
      ['PUT', `/api/admin/groups/${ownerGroupId}/members`, { memberIds: [] }],
      ['DELETE', `/api/admin/groups/${ownerGroupId}`, undefined],
    ];
    for (const [method, pathname, body] of unauthenticatedCases) {
      assert.equal((await request(pathname, { method, body, origin: `http://127.0.0.1:${port}` })).status, 401);
    }

    const viewerCases = [
      ['GET', '/api/admin/groups', undefined],
      ['GET', `/api/admin/groups/${ownerGroupId}/members`, undefined],
      ['POST', '/api/admin/groups', { name: '閲覧者作成', description: '' }],
      ['PATCH', `/api/admin/groups/${ownerGroupId}`, { name: '閲覧者編集' }],
      ['PUT', `/api/admin/groups/${ownerGroupId}/members`, { memberIds: [] }],
      ['DELETE', `/api/admin/groups/${ownerGroupId}`, undefined],
    ];
    for (const [method, pathname, body] of viewerCases) {
      assert.equal((await authenticatedRequest(viewer, pathname, { method, body })).status, 403);
    }

    const csrfCases = [
      ['POST', '/api/admin/groups', { name: 'CSRF作成', description: '' }],
      ['PATCH', `/api/admin/groups/${ownerGroupId}`, { name: 'CSRF編集' }],
      ['PUT', `/api/admin/groups/${ownerGroupId}/members`, { memberIds: [] }],
      ['DELETE', `/api/admin/groups/${ownerGroupId}`, undefined],
    ];
    for (const [method, pathname, body] of csrfCases) {
      assert.equal((await authenticatedRequest(owner, pathname, { method, body, csrfToken: 'invalid-csrf' })).status, 403);
    }

    const adminCreate = await authenticatedRequest(admin, '/api/admin/groups', {
      method: 'POST', body: { name: 'API一般管理者', description: '作成' },
    });
    assert.equal(adminCreate.status, 201);
    const adminGroupId = adminCreate.json.group.id;
    assert.equal((await authenticatedRequest(admin, `/api/admin/groups/${adminGroupId}`, {
      method: 'PATCH', body: { name: 'API一般管理者更新', description: '' },
    })).status, 200);
    const membership = await authenticatedRequest(admin, `/api/admin/groups/${adminGroupId}/members`, {
      method: 'PUT', body: { memberIds: memberIds.slice(0, 2) },
    });
    assert.equal(membership.status, 200);
    assert.deepEqual(membership.json.membership.memberIds, memberIds.slice(0, 2));
    assert.equal((await authenticatedRequest(admin, `/api/admin/groups/${adminGroupId}/members`)).status, 200);
    assert.equal((await authenticatedRequest(admin, `/api/admin/groups/${adminGroupId}`, { method: 'DELETE' })).status, 200);
    assert.equal((await authenticatedRequest(owner, `/api/admin/groups/${ownerGroupId}`, { method: 'DELETE' })).status, 200);
  });
}
