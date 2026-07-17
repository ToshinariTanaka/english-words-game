'use strict';

const { Pool } = require('pg');
const { getConfig } = require('../config');

class DatabaseUnavailableError extends Error {
  constructor(message = '会員機能のデータベースに接続できません。') {
    super(message);
    this.name = 'DatabaseUnavailableError';
    this.statusCode = 503;
  }
}

let pool = null;
let warned = false;

function warnOnce(message, error) {
  if (warned) return;
  warned = true;
  const detail = error?.code ? ` (${error.code})` : '';
  console.warn(`[member-auth] ${message}${detail}`);
}

function sslOptions(config) {
  if (config.databaseSsl === 'disable' || config.databaseSsl === 'false') return false;
  if (config.databaseSsl === 'require' || config.databaseSsl === 'true') return { rejectUnauthorized: false };
  try {
    const hostname = new URL(config.databaseUrl).hostname;
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') return false;
  } catch (_) {
    return false;
  }
  return config.isProduction ? { rejectUnauthorized: false } : false;
}

function isConfigured() {
  return Boolean(getConfig().databaseUrl);
}

function getPool() {
  const config = getConfig();
  if (!config.databaseUrl) {
    warnOnce('DATABASE_URL が未設定です。既存の英語学習機能だけを起動します。');
    throw new DatabaseUnavailableError();
  }
  if (!pool) {
    pool = new Pool({
      connectionString: config.databaseUrl,
      ssl: sslOptions(config),
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
      application_name: 'english-words-game-member-auth',
    });
    pool.on('error', (error) => warnOnce('PostgreSQL接続でエラーが発生しました。', error));
  }
  return pool;
}

async function query(text, params = []) {
  try {
    return await getPool().query(text, params);
  } catch (error) {
    if (isConnectionError(error)) warnOnce('PostgreSQLへ接続できません。既存機能は引き続き利用できます。', error);
    throw error;
  }
}

async function transaction(callback) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch (_) { /* original error wins */ }
    throw error;
  } finally {
    client.release();
  }
}

async function close() {
  if (!pool) return;
  const current = pool;
  pool = null;
  await current.end();
}

function isConnectionError(error) {
  if (error instanceof DatabaseUnavailableError) return true;
  const code = String(error?.code || '');
  return ['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN', '57P01', '57P02', '57P03']
    .includes(code) || code.startsWith('08');
}

module.exports = {
  DatabaseUnavailableError,
  close,
  getPool,
  isConfigured,
  isConnectionError,
  query,
  transaction,
  warnOnce,
};
