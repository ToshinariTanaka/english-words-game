'use strict';

const db = require('../db');
const { NotFoundError } = require('./errors');
const { validateName, validatePositiveId } = require('./validation');

function publicMember(row) {
  return {
    accountType: 'member',
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

async function updateMemberName(actor, memberIdValue, input = {}) {
  const memberId = validatePositiveId(memberIdValue);
  const name = validateName(input.name);

  return db.transaction(async (client) => {
    const selected = await client.query(
      'SELECT name FROM members WHERE id = $1 AND archived_at IS NULL FOR UPDATE',
      [memberId],
    );
    const current = selected.rows[0];
    if (!current) throw new NotFoundError('会員が見つかりません。');

    const updated = await client.query(
      `UPDATE members
          SET name = $2, updated_at = NOW()
        WHERE id = $1 AND archived_at IS NULL
        RETURNING id, member_id, name, is_active, locked_until, last_login_at,
                  password_changed_at, created_at`,
      [memberId, name],
    );

    await client.query(
      `INSERT INTO audit_logs (actor_type, actor_id, action, target_type, target_id, metadata)
       VALUES ('administrator', $1, 'member.name.updated', 'member', $2, $3::jsonb)`,
      [actor.id, memberId, JSON.stringify({ nameChanged: current.name !== name })],
    );

    return publicMember(updated.rows[0]);
  });
}

module.exports = { updateMemberName };
