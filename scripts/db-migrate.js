'use strict';

const db = require('../src/db');
const { migrate } = require('../src/db/migrator');

(async () => {
  try {
    const result = await migrate();
    if (result.applied.length === 0) console.log('未適用のマイグレーションはありません。');
    else result.applied.forEach((name) => console.log(`適用しました: ${name}`));
  } catch (error) {
    console.error(`マイグレーションに失敗しました: ${error.message}`);
    process.exitCode = 1;
  } finally {
    await db.close().catch(() => {});
  }
})();
