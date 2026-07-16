'use strict';

const db = require('../src/db');
const { validateLoginId } = require('../src/auth/validation');
const { writeAudit } = require('../src/auth/service');

function loginIdArgument() {
  const index = process.argv.indexOf('--login-id');
  return index >= 0 ? process.argv[index + 1] : '';
}

(async () => {
  try {
    const loginId = validateLoginId(loginIdArgument());
    const result = await db.transaction(async (client) => {
      const updated = await client.query(
        `UPDATE administrators SET failed_login_count = 0, locked_until = NULL, updated_at = NOW()
          WHERE login_id = $1 AND archived_at IS NULL RETURNING id`,
        [loginId],
      );
      if (!updated.rows[0]) throw new Error('指定した管理者が見つかりません。');
      await writeAudit(client, {
        actorType: 'system', action: 'administrator.login_lock.cleared',
        targetType: 'administrator', targetId: updated.rows[0].id, metadata: { source: 'admin-unlock-cli' },
      });
      return updated.rows[0];
    });
    console.log(`管理者のログイン停止を解除しました。ID: ${result.id}`);
  } catch (error) {
    console.error(`ログイン停止を解除できません: ${error.message}`);
    process.exitCode = 1;
  } finally {
    await db.close().catch(() => {});
  }
})();
