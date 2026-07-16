'use strict';

const db = require('../src/db');
const { getStatus } = require('../src/db/migrator');

(async () => {
  try {
    const status = await getStatus();
    for (const item of status) {
      const state = item.applied ? (item.checksumMatches ? '適用済み' : '内容不一致') : '未適用';
      console.log(`${state}: ${item.version}${item.appliedAt ? ` (${new Date(item.appliedAt).toISOString()})` : ''}`);
    }
    if (status.some((item) => !item.checksumMatches)) process.exitCode = 1;
  } catch (error) {
    console.error(`マイグレーション状態を確認できません: ${error.message}`);
    process.exitCode = 1;
  } finally {
    await db.close().catch(() => {});
  }
})();
