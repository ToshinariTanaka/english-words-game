'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const db = require('./index');

const MIGRATION_DIR = path.join(__dirname, 'migrations');
const ADVISORY_LOCK_ID = 2026071701;

function loadMigrations() {
  return fs.readdirSync(MIGRATION_DIR)
    .filter((name) => /^\d+_[a-z0-9_-]+\.sql$/i.test(name))
    .sort()
    .map((name) => {
      const sql = fs.readFileSync(path.join(MIGRATION_DIR, name), 'utf8');
      return { name, sql, checksum: crypto.createHash('sha256').update(sql).digest('hex') };
    });
}

async function ensureMigrationTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version VARCHAR(255) PRIMARY KEY,
      checksum CHAR(64) NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function getStatus() {
  const migrations = loadMigrations();
  const client = await db.getPool().connect();
  try {
    await ensureMigrationTable(client);
    const appliedResult = await client.query('SELECT version, checksum, applied_at FROM schema_migrations ORDER BY version');
    const applied = new Map(appliedResult.rows.map((row) => [row.version, row]));
    return migrations.map((migration) => {
      const row = applied.get(migration.name);
      return {
        version: migration.name,
        applied: Boolean(row),
        checksumMatches: !row || row.checksum === migration.checksum,
        appliedAt: row?.applied_at || null,
      };
    });
  } finally {
    client.release();
  }
}

async function migrate() {
  const migrations = loadMigrations();
  const client = await db.getPool().connect();
  const appliedNames = [];
  try {
    await client.query('SELECT pg_advisory_lock($1)', [ADVISORY_LOCK_ID]);
    await ensureMigrationTable(client);
    const existing = await client.query('SELECT version, checksum FROM schema_migrations');
    const applied = new Map(existing.rows.map((row) => [row.version, row.checksum]));
    for (const migration of migrations) {
      if (applied.has(migration.name)) {
        if (applied.get(migration.name) !== migration.checksum) {
          throw new Error(`適用済みマイグレーション ${migration.name} の内容が変更されています。`);
        }
        continue;
      }
      await client.query('BEGIN');
      try {
        await client.query(migration.sql);
        await client.query(
          'INSERT INTO schema_migrations (version, checksum) VALUES ($1, $2)',
          [migration.name, migration.checksum],
        );
        await client.query('COMMIT');
        appliedNames.push(migration.name);
      } catch (error) {
        await client.query('ROLLBACK');
        throw new Error(`マイグレーション ${migration.name} に失敗しました: ${error.message}`, { cause: error });
      }
    }
    return { applied: appliedNames, total: migrations.length };
  } finally {
    try { await client.query('SELECT pg_advisory_unlock($1)', [ADVISORY_LOCK_ID]); } catch (_) { /* connection may be gone */ }
    client.release();
  }
}

module.exports = { getStatus, loadMigrations, migrate };
