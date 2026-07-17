'use strict';

const SESSION_DAYS = 30;

function numberFromEnv(name, fallback, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < min || value > max) return fallback;
  return value;
}

function getConfig() {
  return {
    databaseUrl: String(process.env.DATABASE_URL || '').trim(),
    databaseSsl: String(process.env.DATABASE_SSL || '').trim().toLowerCase(),
    sessionSecret: String(process.env.SESSION_SECRET || ''),
    temporaryPasswordEncryptionKey: String(process.env.TEMP_PASSWORD_ENCRYPTION_KEY || ''),
    appTimezone: String(process.env.APP_TIMEZONE || 'Asia/Tokyo'),
    isProduction: process.env.NODE_ENV === 'production',
    sessionTtlMs: SESSION_DAYS * 24 * 60 * 60 * 1000,
    loginFailureLimit: numberFromEnv('LOGIN_FAILURE_LIMIT', 10, { min: 2, max: 100 }),
    loginLockMinutes: numberFromEnv('LOGIN_LOCK_MINUTES', 15, { min: 1, max: 1440 }),
    authJsonLimitBytes: numberFromEnv('AUTH_JSON_LIMIT_BYTES', 32 * 1024, { min: 1024, max: 1024 * 1024 }),
    bcryptRounds: numberFromEnv('BCRYPT_ROUNDS', 12, { min: 10, max: 15 }),
  };
}

module.exports = { SESSION_DAYS, getConfig };
