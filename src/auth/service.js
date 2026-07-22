'use strict';

const db = require('../db');
const { getConfig } = require('../config');
const {
  AuthenticationError,
  ConflictError,
  LockedError,
  NotFoundError,
  ValidationError,
} = require('./errors');
const {
  createSessionCredentials,
  decryptTemporaryPassword,
  encryptTemporaryPassword,
  getSessionSecret,
  hashPassword,
  parseEncryptionKey,
  performDummyPasswordCheck,
  sessionTokenHash,
  verifyPassword,
} = require('./security');
const { nextFailureState } = require('./lockout');
const {
  requiredString,
  validateBoolean,
  validateLoginId,
  validateLoginPassword,
  validateMemberId,
  validateName,
  validatePassword,
  validatePositiveId,
  validatePositiveIds,
  validateRole,
} = require('./validation');

const ACCOUNT_DEFINITIONS = Object.freeze({
  administrator: { table: 'administrators', identifier: 'login_id' },
  member: { table: 'members', identifier: 'member_id' },
});

function accountDefinition(accountType) {
  const definition = ACCOUNT_DEFINITIONS[accountType];
  if (!definition) throw new ValidationError('アカウント種別が正しくありません。');
  return definition;
}

function cleanMetadata(value, depth = 0) {
  if (depth > 5 || value === null || value === undefined) return value ?? null;
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => cleanMetadata(item, depth + 1));
  if (typeof value !== 'object') return typeof value === 'string' ? value.slice(0, 500) : value;
  const result = {};
  for (const [key, item] of Object.entries(value)) {
    if (/password|token|secret|authorization|cookie/i.test(key)) continue;
    result[key] = cleanMetadata(item, depth + 1);
  }
  return result;
}

async function writeAudit(client, {
  actorType = null,
  actorId = null,
  action,
  targetType = null,
  targetId = null,
  metadata = {},
}) {
  await client.query(
    `INSERT INTO audit_logs (actor_type, actor_id, action, target_type, target_id, metadata)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [actorType, actorId, action, targetType, targetId, JSON.stringify(cleanMetadata(metadata))],
  );
}

function requestMetadata(input = {}) {
  return {
    ipAddress: String(input.ipAddress || '').slice(0, 64) || null,
    userAgent: String(input.userAgent || '').slice(0, 500) || null,
  };
}

function publicAccount(accountType, row) {
  if (accountType === 'administrator') {
    return {
      accountType,
      id: Number(row.id),
      loginId: row.login_id,
      displayName: row.display_name,
      role: row.role,
      isActive: row.is_active,
      lockedUntil: row.locked_until,
      lastLoginAt: row.last_login_at,
      passwordChangedAt: row.password_changed_at,
      createdAt: row.created_at,
    };
  }
  return {
    accountType,
    id: Number(row.id),
    memberId: row.member_id,
    name: row.name,
    isActive: row.is_active,
    lockedUntil: row.locked_until,
    lastLoginAt: row.last_login_at,
    passwordChangedAt: row.password_changed_at,
    createdAt: row.created_at,
  };
}

async function insertSession(client, accountType, account, metadata, credentials = createSessionCredentials()) {
  const config = getConfig();
  const expiresAt = new Date(Date.now() + config.sessionTtlMs);
  const request = requestMetadata(metadata);
  const result = await client.query(
    `INSERT INTO sessions
       (account_type, account_id, token_hash, session_version, expires_at, user_agent, ip_address)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, expires_at`,
    [accountType, account.id, credentials.tokenHash, account.session_version, expiresAt, request.userAgent, request.ipAddress],
  );
  return {
    ...credentials,
    sessionId: Number(result.rows[0].id),
    expiresAt: result.rows[0].expires_at,
  };
}

async function authenticate(accountType, identifierValue, passwordValue, metadata = {}) {
  getSessionSecret();
  const definition = accountDefinition(accountType);
  const identifier = accountType === 'administrator' ? validateLoginId(identifierValue) : validateMemberId(identifierValue);
  const password = validateLoginPassword(passwordValue);
  const config = getConfig();
  const result = await db.transaction(async (client) => {
    const selected = await client.query(
      `SELECT * FROM ${definition.table} WHERE ${definition.identifier} = $1 AND archived_at IS NULL FOR UPDATE`,
      [identifier],
    );
    const account = selected.rows[0];
    if (!account) {
      await performDummyPasswordCheck(password);
      await writeAudit(client, {
        actorType: accountType,
        action: `${accountType}.login.failed`,
        targetType: accountType,
        metadata: { reason: 'invalid_credentials', ...requestMetadata(metadata) },
      });
      return { error: new AuthenticationError() };
    }

    const passwordMatches = await verifyPassword(password, account.password_hash);
    const lockedUntil = account.locked_until ? new Date(account.locked_until) : null;
    const lockIsActive = lockedUntil && lockedUntil.getTime() > Date.now();
    if (lockIsActive) {
      await writeAudit(client, {
        actorType: accountType,
        actorId: account.id,
        action: `${accountType}.login.failed`,
        targetType: accountType,
        targetId: account.id,
        metadata: { reason: 'locked', ...requestMetadata(metadata) },
      });
      return { error: new LockedError() };
    }

    if (!account.is_active || !passwordMatches) {
      const failure = nextFailureState({
        failedLoginCount: account.failed_login_count,
        lockedUntil,
        limit: config.loginFailureLimit,
        lockMinutes: config.loginLockMinutes,
      });
      const shouldLock = account.is_active && failure.locked;
      if (account.is_active) {
        await client.query(
          `UPDATE ${definition.table}
             SET failed_login_count = $2, locked_until = $3, updated_at = NOW()
           WHERE id = $1`,
          [account.id, failure.failedLoginCount, shouldLock ? failure.lockedUntil : null],
        );
      }
      await writeAudit(client, {
        actorType: accountType,
        actorId: account.id,
        action: `${accountType}.login.failed`,
        targetType: accountType,
        targetId: account.id,
        metadata: { reason: account.is_active ? (shouldLock ? 'locked' : 'invalid_credentials') : 'inactive', ...requestMetadata(metadata) },
      });
      return { error: shouldLock ? new LockedError() : new AuthenticationError() };
    }

    const updated = await client.query(
      `UPDATE ${definition.table}
          SET failed_login_count = 0, locked_until = NULL, last_login_at = NOW(), updated_at = NOW()
        WHERE id = $1 RETURNING *`,
      [account.id],
    );
    const current = updated.rows[0];
    const session = await insertSession(client, accountType, current, metadata);
    await writeAudit(client, {
      actorType: accountType,
      actorId: current.id,
      action: `${accountType}.login.succeeded`,
      targetType: accountType,
      targetId: current.id,
      metadata: requestMetadata(metadata),
    });
    return { account: publicAccount(accountType, current), session };
  });
  if (result.error) throw result.error;
  return result;
}

async function getSession(accountType, token) {
  if (!token) return null;
  const definition = accountDefinition(accountType);
  const tokenHash = sessionTokenHash(token);
  const result = await db.query(
    `SELECT s.id AS session_id, s.session_version AS session_record_version,
            s.expires_at, s.revoked_at, a.*
       FROM sessions s
       JOIN ${definition.table} a ON a.id = s.account_id
      WHERE s.account_type = $1 AND s.token_hash = $2
        AND s.revoked_at IS NULL AND s.expires_at > NOW()
        AND a.archived_at IS NULL AND a.is_active = TRUE
      LIMIT 1`,
    [accountType, tokenHash],
  );
  const row = result.rows[0];
  if (!row || Number(row.session_record_version) !== Number(row.session_version)) return null;
  await db.query(
    `UPDATE sessions SET last_seen_at = NOW()
      WHERE id = $1 AND last_seen_at < NOW() - INTERVAL '5 minutes'`,
    [row.session_id],
  );
  return {
    account: publicAccount(accountType, row),
    sessionId: Number(row.session_id),
    expiresAt: row.expires_at,
    sessionVersion: Number(row.session_version),
  };
}

async function revokeCurrentSession(session, metadata = {}) {
  await db.transaction(async (client) => {
    await client.query('UPDATE sessions SET revoked_at = COALESCE(revoked_at, NOW()) WHERE id = $1', [session.sessionId]);
    await writeAudit(client, {
      actorType: session.account.accountType,
      actorId: session.account.id,
      action: 'session.logout',
      targetType: session.account.accountType,
      targetId: session.account.id,
      metadata: requestMetadata(metadata),
    });
  });
}

async function listMembers() {
  const result = await db.query(`
    SELECT id, member_id, name, is_active, locked_until, last_login_at,
           temporary_password_encrypted IS NOT NULL AS has_temporary_password,
           temporary_password_created_at, password_changed_at, created_at
      FROM members WHERE archived_at IS NULL ORDER BY id
  `);
  return result.rows.map((row) => ({
    id: Number(row.id), memberId: row.member_id, name: row.name, isActive: row.is_active,
    lockedUntil: row.locked_until, lastLoginAt: row.last_login_at,
    hasTemporaryPassword: row.has_temporary_password,
    temporaryPasswordCreatedAt: row.temporary_password_created_at,
    passwordChangedAt: row.password_changed_at, createdAt: row.created_at,
  }));
}

async function createMember(actor, input) {
  const name = validateName(input.name);
  const password = validatePassword(input.password, 'member');
  parseEncryptionKey();
  const passwordHash = await hashPassword(password);
  const encryptedPassword = encryptTemporaryPassword(password);
  return db.transaction(async (client) => {
    const sequence = await client.query("SELECT nextval('member_number_seq') AS value");
    const number = Number(sequence.rows[0].value);
    if (!Number.isSafeInteger(number) || number > 999999) throw new ConflictError('会員IDの発行上限に達しました。');
    const memberId = `UP${String(number).padStart(6, '0')}`;
    const inserted = await client.query(
      `INSERT INTO members
         (member_id, name, password_hash, temporary_password_encrypted, temporary_password_created_at)
       VALUES ($1, $2, $3, $4, NOW()) RETURNING *`,
      [memberId, name, passwordHash, encryptedPassword],
    );
    await writeAudit(client, {
      actorType: 'administrator', actorId: actor.id, action: 'member.created',
      targetType: 'member', targetId: inserted.rows[0].id, metadata: { memberId },
    });
    return publicAccount('member', inserted.rows[0]);
  });
}

async function getTemporaryPassword(actor, memberIdValue) {
  const memberId = validatePositiveId(memberIdValue);
  return db.transaction(async (client) => {
    const result = await client.query(
      'SELECT id, temporary_password_encrypted FROM members WHERE id = $1 AND archived_at IS NULL FOR UPDATE',
      [memberId],
    );
    const member = result.rows[0];
    if (!member) throw new NotFoundError('会員が見つかりません。');
    if (!member.temporary_password_encrypted) throw new NotFoundError('確認できる初期・仮パスワードはありません。');
    const password = decryptTemporaryPassword(member.temporary_password_encrypted);
    await writeAudit(client, {
      actorType: 'administrator', actorId: actor.id, action: 'member.temporary_password.viewed',
      targetType: 'member', targetId: member.id,
    });
    return password;
  });
}

async function setMemberStatus(actor, memberIdValue, isActiveValue) {
  const memberId = validatePositiveId(memberIdValue);
  const isActive = validateBoolean(isActiveValue, '利用状態');
  return db.transaction(async (client) => {
    const result = await client.query(
      `UPDATE members SET is_active = $2,
          session_version = CASE WHEN $2 = FALSE THEN session_version + 1 ELSE session_version END,
          updated_at = NOW()
        WHERE id = $1 AND archived_at IS NULL RETURNING *`,
      [memberId, isActive],
    );
    if (!result.rows[0]) throw new NotFoundError('会員が見つかりません。');
    if (!isActive) await client.query("UPDATE sessions SET revoked_at = COALESCE(revoked_at, NOW()) WHERE account_type = 'member' AND account_id = $1", [memberId]);
    await writeAudit(client, {
      actorType: 'administrator', actorId: actor.id, action: isActive ? 'member.activated' : 'member.deactivated',
      targetType: 'member', targetId: memberId,
    });
    return publicAccount('member', result.rows[0]);
  });
}

async function resetMemberPassword(actor, memberIdValue, passwordValue) {
  const memberId = validatePositiveId(memberIdValue);
  const password = validatePassword(passwordValue, 'member');
  parseEncryptionKey();
  const passwordHash = await hashPassword(password);
  const encryptedPassword = encryptTemporaryPassword(password);
  return db.transaction(async (client) => {
    const result = await client.query(
      `UPDATE members SET password_hash = $2, temporary_password_encrypted = $3,
          temporary_password_created_at = NOW(), password_changed_at = NOW(),
          failed_login_count = 0, locked_until = NULL, session_version = session_version + 1,
          updated_at = NOW()
        WHERE id = $1 AND archived_at IS NULL RETURNING *`,
      [memberId, passwordHash, encryptedPassword],
    );
    if (!result.rows[0]) throw new NotFoundError('会員が見つかりません。');
    await client.query("UPDATE sessions SET revoked_at = COALESCE(revoked_at, NOW()) WHERE account_type = 'member' AND account_id = $1", [memberId]);
    await writeAudit(client, {
      actorType: 'administrator', actorId: actor.id, action: 'member.temporary_password.reset',
      targetType: 'member', targetId: memberId,
    });
    return publicAccount('member', result.rows[0]);
  });
}

function publicGroup(row) {
  return {
    id: Number(row.id),
    name: row.name,
    description: row.description,
    memberCount: Number(row.member_count || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function listGroups() {
  const result = await db.query(`
    SELECT g.id, g.name, g.description, g.created_at, g.updated_at,
           COUNT(m.id)::int AS member_count
      FROM groups g
      LEFT JOIN group_members gm ON gm.group_id = g.id
      LEFT JOIN members m ON m.id = gm.member_id AND m.archived_at IS NULL
     WHERE g.archived_at IS NULL
     GROUP BY g.id
     ORDER BY LOWER(g.name), g.id
  `);
  return result.rows.map(publicGroup);
}

async function createGroup(actor, input) {
  const name = validateName(input.name, 'グループ名');
  const description = requiredString(input.description ?? '', '説明', { min: 0, max: 500 });
  try {
    return await db.transaction(async (client) => {
      const inserted = await client.query(
        `INSERT INTO groups (name, description, created_by)
         VALUES ($1, $2, $3) RETURNING *`,
        [name, description, actor.id],
      );
      await writeAudit(client, {
        actorType: 'administrator', actorId: actor.id, action: 'group.created',
        targetType: 'group', targetId: inserted.rows[0].id, metadata: { name },
      });
      return publicGroup(inserted.rows[0]);
    });
  } catch (error) {
    if (error.code === '23505') throw new ConflictError('同じ名前のグループが既に存在します。');
    throw error;
  }
}

async function updateGroup(actor, groupIdValue, input) {
  const groupId = validatePositiveId(groupIdValue);
  try {
    return await db.transaction(async (client) => {
      const selected = await client.query(
        'SELECT * FROM groups WHERE id = $1 AND archived_at IS NULL FOR UPDATE',
        [groupId],
      );
      const current = selected.rows[0];
      if (!current) throw new NotFoundError('グループが見つかりません。');
      const name = input.name === undefined ? current.name : validateName(input.name, 'グループ名');
      const description = input.description === undefined
        ? current.description
        : requiredString(input.description, '説明', { min: 0, max: 500 });
      const updated = await client.query(
        `UPDATE groups SET name = $2, description = $3, updated_at = NOW()
          WHERE id = $1 RETURNING *`,
        [groupId, name, description],
      );
      await writeAudit(client, {
        actorType: 'administrator', actorId: actor.id, action: 'group.updated',
        targetType: 'group', targetId: groupId,
        metadata: { nameChanged: current.name !== name, descriptionChanged: current.description !== description },
      });
      const count = await client.query(
        `SELECT COUNT(m.id)::int AS member_count
           FROM group_members gm
           JOIN members m ON m.id = gm.member_id AND m.archived_at IS NULL
          WHERE gm.group_id = $1`,
        [groupId],
      );
      return publicGroup({ ...updated.rows[0], member_count: count.rows[0].member_count });
    });
  } catch (error) {
    if (error.code === '23505') throw new ConflictError('同じ名前のグループが既に存在します。');
    throw error;
  }
}

async function archiveGroup(actor, groupIdValue) {
  const groupId = validatePositiveId(groupIdValue);
  return db.transaction(async (client) => {
    const archived = await client.query(
      `UPDATE groups SET archived_at = NOW(), updated_at = NOW()
        WHERE id = $1 AND archived_at IS NULL RETURNING id, name`,
      [groupId],
    );
    if (!archived.rows[0]) throw new NotFoundError('グループが見つかりません。');
    await writeAudit(client, {
      actorType: 'administrator', actorId: actor.id, action: 'group.archived',
      targetType: 'group', targetId: groupId, metadata: { name: archived.rows[0].name },
    });
    return { id: groupId };
  });
}

async function getGroupMemberIds(groupIdValue) {
  const groupId = validatePositiveId(groupIdValue);
  const group = await db.query(
    'SELECT id FROM groups WHERE id = $1 AND archived_at IS NULL',
    [groupId],
  );
  if (!group.rows[0]) throw new NotFoundError('グループが見つかりません。');
  const result = await db.query(
    `SELECT gm.member_id
       FROM group_members gm
       JOIN members m ON m.id = gm.member_id
      WHERE gm.group_id = $1 AND m.archived_at IS NULL
      ORDER BY gm.member_id`,
    [groupId],
  );
  return result.rows.map((row) => Number(row.member_id));
}

async function replaceGroupMembers(actor, groupIdValue, memberIdsValue) {
  const groupId = validatePositiveId(groupIdValue);
  const memberIds = validatePositiveIds(memberIdsValue, '会員ID');
  return db.transaction(async (client) => {
    const group = await client.query(
      'SELECT id FROM groups WHERE id = $1 AND archived_at IS NULL FOR UPDATE',
      [groupId],
    );
    if (!group.rows[0]) throw new NotFoundError('グループが見つかりません。');

    const members = await client.query(
      `SELECT id FROM members
        WHERE id = ANY($1::bigint[]) AND archived_at IS NULL`,
      [memberIds],
    );
    if (members.rows.length !== memberIds.length) throw new NotFoundError('指定された会員の一部が見つかりません。');

    const existingResult = await client.query(
      'SELECT member_id FROM group_members WHERE group_id = $1 FOR UPDATE',
      [groupId],
    );
    const existing = new Set(existingResult.rows.map((row) => Number(row.member_id)));
    const requested = new Set(memberIds);
    const added = memberIds.filter((memberId) => !existing.has(memberId));
    const removed = [...existing].filter((memberId) => !requested.has(memberId));

    if (removed.length > 0) {
      await client.query(
        'DELETE FROM group_members WHERE group_id = $1 AND member_id = ANY($2::bigint[])',
        [groupId, removed],
      );
    }
    if (added.length > 0) {
      await client.query(
        `INSERT INTO group_members (group_id, member_id, added_by)
         SELECT $1, new_members.member_id, $3
           FROM UNNEST($2::bigint[]) AS new_members(member_id)`,
        [groupId, added, actor.id],
      );
    }
    if (added.length > 0 || removed.length > 0) {
      await client.query('UPDATE groups SET updated_at = NOW() WHERE id = $1', [groupId]);
    }
    await writeAudit(client, {
      actorType: 'administrator', actorId: actor.id, action: 'group.members.replaced',
      targetType: 'group', targetId: groupId,
      metadata: { addedMemberIds: added, removedMemberIds: removed, memberCount: memberIds.length },
    });
    return { groupId, memberIds: [...memberIds].sort((a, b) => a - b) };
  });
}

async function listAdministrators() {
  const result = await db.query(`
    SELECT id, login_id, display_name, role, is_active, locked_until, last_login_at,
           password_changed_at, created_at
      FROM administrators WHERE archived_at IS NULL ORDER BY id
  `);
  return result.rows.map((row) => publicAccount('administrator', row));
}

async function createAdministrator(actor, input) {
  const loginId = validateLoginId(input.loginId);
  const displayName = validateName(input.displayName, '表示名');
  const role = validateRole(input.role);
  const password = validatePassword(input.password, 'administrator');
  const passwordHash = await hashPassword(password);
  try {
    return await db.transaction(async (client) => {
      const inserted = await client.query(
        `INSERT INTO administrators (login_id, display_name, role, password_hash)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [loginId, displayName, role, passwordHash],
      );
      await writeAudit(client, {
        actorType: 'administrator', actorId: actor.id, action: 'administrator.created',
        targetType: 'administrator', targetId: inserted.rows[0].id, metadata: { role },
      });
      return publicAccount('administrator', inserted.rows[0]);
    });
  } catch (error) {
    if (error.code === '23505') throw new ConflictError('同じログインIDの管理者が既に存在します。');
    throw error;
  }
}

async function updateAdministrator(actor, administratorIdValue, input) {
  const administratorId = validatePositiveId(administratorIdValue);
  return db.transaction(async (client) => {
    const selected = await client.query('SELECT * FROM administrators WHERE id = $1 AND archived_at IS NULL FOR UPDATE', [administratorId]);
    const current = selected.rows[0];
    if (!current) throw new NotFoundError('管理者が見つかりません。');
    const displayName = input.displayName === undefined ? current.display_name : validateName(input.displayName, '表示名');
    const role = input.role === undefined ? current.role : validateRole(input.role);
    const isActive = input.isActive === undefined ? current.is_active : validateBoolean(input.isActive, '利用状態');
    const removesActiveOwner = current.role === 'owner' && current.is_active && (role !== 'owner' || !isActive);
    if (removesActiveOwner) {
      const owners = await client.query(
        `SELECT COUNT(*)::int AS count FROM administrators
          WHERE role = 'owner' AND is_active = TRUE AND archived_at IS NULL AND id <> $1`,
        [administratorId],
      );
      if (owners.rows[0].count === 0) throw new ConflictError('代表管理者が一人もいなくなる変更はできません。');
    }
    const updated = await client.query(
      `UPDATE administrators SET display_name = $2, role = $3, is_active = $4,
          session_version = CASE WHEN $4 = FALSE OR role <> $3 THEN session_version + 1 ELSE session_version END,
          updated_at = NOW()
        WHERE id = $1 RETURNING *`,
      [administratorId, displayName, role, isActive],
    );
    if (!isActive || current.role !== role) {
      await client.query("UPDATE sessions SET revoked_at = COALESCE(revoked_at, NOW()) WHERE account_type = 'administrator' AND account_id = $1", [administratorId]);
    }
    if (current.role !== role) {
      await writeAudit(client, {
        actorType: 'administrator', actorId: actor.id, action: 'administrator.role.changed',
        targetType: 'administrator', targetId: administratorId, metadata: { from: current.role, to: role },
      });
    }
    if (current.is_active !== isActive) {
      await writeAudit(client, {
        actorType: 'administrator', actorId: actor.id, action: isActive ? 'administrator.activated' : 'administrator.deactivated',
        targetType: 'administrator', targetId: administratorId,
      });
    }
    return publicAccount('administrator', updated.rows[0]);
  });
}

async function resetAdministratorPassword(actor, administratorIdValue, passwordValue) {
  const administratorId = validatePositiveId(administratorIdValue);
  const password = validatePassword(passwordValue, 'administrator');
  const passwordHash = await hashPassword(password);
  return db.transaction(async (client) => {
    const result = await client.query(
      `UPDATE administrators SET password_hash = $2, password_changed_at = NOW(),
          failed_login_count = 0, locked_until = NULL, session_version = session_version + 1,
          updated_at = NOW()
        WHERE id = $1 AND archived_at IS NULL RETURNING *`,
      [administratorId, passwordHash],
    );
    if (!result.rows[0]) throw new NotFoundError('管理者が見つかりません。');
    await client.query("UPDATE sessions SET revoked_at = COALESCE(revoked_at, NOW()) WHERE account_type = 'administrator' AND account_id = $1", [administratorId]);
    await writeAudit(client, {
      actorType: 'administrator', actorId: actor.id, action: 'administrator.password.reset',
      targetType: 'administrator', targetId: administratorId,
    });
    return publicAccount('administrator', result.rows[0]);
  });
}

async function unlockAccount(actor, accountType, accountIdValue) {
  const definition = accountDefinition(accountType);
  const accountId = validatePositiveId(accountIdValue);
  return db.transaction(async (client) => {
    const result = await client.query(
      `UPDATE ${definition.table} SET failed_login_count = 0, locked_until = NULL, updated_at = NOW()
        WHERE id = $1 AND archived_at IS NULL RETURNING *`,
      [accountId],
    );
    if (!result.rows[0]) throw new NotFoundError('アカウントが見つかりません。');
    await writeAudit(client, {
      actorType: 'administrator', actorId: actor.id, action: `${accountType}.login_lock.cleared`,
      targetType: accountType, targetId: accountId,
    });
    return publicAccount(accountType, result.rows[0]);
  });
}

async function revokeAllSessions(actor, accountType, accountIdValue) {
  const definition = accountDefinition(accountType);
  const accountId = validatePositiveId(accountIdValue);
  return db.transaction(async (client) => {
    const result = await client.query(
      `UPDATE ${definition.table} SET session_version = session_version + 1, updated_at = NOW()
        WHERE id = $1 AND archived_at IS NULL RETURNING *`,
      [accountId],
    );
    if (!result.rows[0]) throw new NotFoundError('アカウントが見つかりません。');
    await client.query('UPDATE sessions SET revoked_at = COALESCE(revoked_at, NOW()) WHERE account_type = $1 AND account_id = $2', [accountType, accountId]);
    await writeAudit(client, {
      actorType: 'administrator', actorId: actor.id, action: `${accountType}.sessions.revoked`,
      targetType: accountType, targetId: accountId,
    });
    return publicAccount(accountType, result.rows[0]);
  });
}

async function changeOwnPassword(session, currentPasswordValue, newPasswordValue, metadata = {}) {
  const accountType = session.account.accountType;
  const definition = accountDefinition(accountType);
  const currentPassword = validatePassword(currentPasswordValue, accountType);
  const newPassword = validatePassword(newPasswordValue, accountType);
  const newHash = await hashPassword(newPassword);
  const credentials = createSessionCredentials();
  const result = await db.transaction(async (client) => {
    const selected = await client.query(`SELECT * FROM ${definition.table} WHERE id = $1 AND archived_at IS NULL FOR UPDATE`, [session.account.id]);
    const current = selected.rows[0];
    if (!current || !(await verifyPassword(currentPassword, current.password_hash))) return { error: new AuthenticationError('現在のパスワードが正しくありません。') };
    const tempClear = accountType === 'member' ? ', temporary_password_encrypted = NULL, temporary_password_created_at = NULL' : '';
    const updated = await client.query(
      `UPDATE ${definition.table} SET password_hash = $2, password_changed_at = NOW(),
          session_version = session_version + 1, failed_login_count = 0, locked_until = NULL,
          updated_at = NOW() ${tempClear}
        WHERE id = $1 RETURNING *`,
      [current.id, newHash],
    );
    await client.query('UPDATE sessions SET revoked_at = COALESCE(revoked_at, NOW()) WHERE account_type = $1 AND account_id = $2', [accountType, current.id]);
    const newSession = await insertSession(client, accountType, updated.rows[0], metadata, credentials);
    await writeAudit(client, {
      actorType: accountType, actorId: current.id, action: `${accountType}.password.changed`,
      targetType: accountType, targetId: current.id, metadata: requestMetadata(metadata),
    });
    return { account: publicAccount(accountType, updated.rows[0]), session: newSession };
  });
  if (result.error) throw result.error;
  return result;
}

async function listAuditLogs(limitValue = 100) {
  const limit = Math.min(Math.max(Number(limitValue) || 100, 1), 200);
  const result = await db.query(
    `SELECT id, actor_type, actor_id, action, target_type, target_id, metadata, created_at
       FROM audit_logs ORDER BY id DESC LIMIT $1`,
    [limit],
  );
  return result.rows.map((row) => ({
    id: Number(row.id), actorType: row.actor_type, actorId: row.actor_id ? Number(row.actor_id) : null,
    action: row.action, targetType: row.target_type, targetId: row.target_id ? Number(row.target_id) : null,
    metadata: row.metadata, createdAt: row.created_at,
  }));
}

async function status() {
  await db.query('SELECT 1');
  getSessionSecret();
  parseEncryptionKey();
  return { available: true, timezone: getConfig().appTimezone };
}

module.exports = {
  archiveGroup,
  authenticate,
  changeOwnPassword,
  cleanMetadata,
  createAdministrator,
  createGroup,
  createMember,
  getGroupMemberIds,
  getSession,
  getTemporaryPassword,
  listAdministrators,
  listAuditLogs,
  listGroups,
  listMembers,
  publicAccount,
  resetAdministratorPassword,
  resetMemberPassword,
  replaceGroupMembers,
  revokeAllSessions,
  revokeCurrentSession,
  setMemberStatus,
  status,
  unlockAccount,
  updateAdministrator,
  updateGroup,
  writeAudit,
};
