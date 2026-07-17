'use strict';

const db = require('../src/db');
const { ConflictError } = require('../src/auth/errors');
const { hashPassword } = require('../src/auth/security');
const { validateLoginId, validateName, validatePassword, validateRole } = require('../src/auth/validation');
const { writeAudit } = require('../src/auth/service');

function parseArguments(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key.startsWith('--')) continue;
    values[key.slice(2)] = argv[index + 1];
    index += 1;
  }
  return values;
}

async function readPassword() {
  if (process.env.ADMIN_INITIAL_PASSWORD) return process.env.ADMIN_INITIAL_PASSWORD;
  if (process.stdin.isTTY) {
    throw new Error('パスワードは ADMIN_INITIAL_PASSWORD 環境変数、または標準入力から安全に渡してください。');
  }
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString('utf8').replace(/\r?\n$/, '');
}

(async () => {
  try {
    const args = parseArguments(process.argv.slice(2));
    const loginId = validateLoginId(args['login-id']);
    const displayName = validateName(args['display-name'], '表示名');
    const role = validateRole(args.role || 'owner');
    const password = validatePassword(await readPassword(), 'administrator');
    const passwordHash = await hashPassword(password);
    const administrator = await db.transaction(async (client) => {
      const existing = await client.query('SELECT id FROM administrators WHERE login_id = $1', [loginId]);
      if (existing.rows[0]) throw new ConflictError('同じログインIDの管理者が既に存在します。');
      const result = await client.query(
        `INSERT INTO administrators (login_id, display_name, role, password_hash)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [loginId, displayName, role, passwordHash],
      );
      await writeAudit(client, {
        actorType: 'system', action: 'administrator.created', targetType: 'administrator',
        targetId: result.rows[0].id, metadata: { role, source: 'admin-create-cli' },
      });
      return result.rows[0];
    });
    console.log(`管理者を作成しました。ID: ${administrator.id} / ログインID: ${loginId} / 権限: ${role}`);
  } catch (error) {
    console.error(`管理者を作成できません: ${error.message}`);
    process.exitCode = 1;
  } finally {
    await db.close().catch(() => {});
  }
})();
