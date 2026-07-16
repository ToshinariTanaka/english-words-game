'use strict';

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { getConfig } = require('../config');
const { ConfigurationError } = require('./errors');

const DUMMY_PASSWORD_HASH = '$2b$12$k.w9yeiltGOCuoo8CIAyhulUGIwijJChlVp1N4Loz7poxv9vrGRtu';
const TEMP_PASSWORD_AAD = Buffer.from('english-words-game:member-temporary-password:v1', 'utf8');

function passwordMaterial(password) {
  return crypto.createHash('sha256').update(String(password), 'utf8').digest('base64');
}

async function hashPassword(password) {
  return bcrypt.hash(passwordMaterial(password), getConfig().bcryptRounds);
}

async function verifyPassword(password, passwordHash) {
  return bcrypt.compare(passwordMaterial(password), passwordHash || DUMMY_PASSWORD_HASH);
}

async function performDummyPasswordCheck(password) {
  return verifyPassword(password, DUMMY_PASSWORD_HASH);
}

function parseEncryptionKey(value = getConfig().temporaryPasswordEncryptionKey) {
  const raw = String(value || '').trim();
  if (!raw) throw new ConfigurationError('TEMP_PASSWORD_ENCRYPTION_KEY が設定されていません。');
  let key;
  if (raw.startsWith('hex:')) key = Buffer.from(raw.slice(4), 'hex');
  else if (raw.startsWith('base64:')) key = Buffer.from(raw.slice(7), 'base64');
  else if (/^[a-f0-9]{64}$/i.test(raw)) key = Buffer.from(raw, 'hex');
  else key = Buffer.from(raw, 'base64');
  if (key.length !== 32) {
    throw new ConfigurationError('TEMP_PASSWORD_ENCRYPTION_KEY は32バイトのBase64または64桁の16進数で設定してください。');
  }
  return key;
}

function encryptTemporaryPassword(password, keyValue) {
  const key = parseEncryptionKey(keyValue);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(TEMP_PASSWORD_AAD);
  const encrypted = Buffer.concat([cipher.update(String(password), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ['v1', iv.toString('base64url'), tag.toString('base64url'), encrypted.toString('base64url')].join('.');
}

function decryptTemporaryPassword(payload, keyValue) {
  const [version, ivText, tagText, encryptedText] = String(payload || '').split('.');
  if (version !== 'v1' || !ivText || !tagText || !encryptedText) throw new Error('暗号化された仮パスワードの形式が不正です。');
  const decipher = crypto.createDecipheriv('aes-256-gcm', parseEncryptionKey(keyValue), Buffer.from(ivText, 'base64url'));
  decipher.setAAD(TEMP_PASSWORD_AAD);
  decipher.setAuthTag(Buffer.from(tagText, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(encryptedText, 'base64url')), decipher.final()]).toString('utf8');
}

function getSessionSecret(value = getConfig().sessionSecret) {
  const secret = String(value || '');
  if (Buffer.byteLength(secret, 'utf8') < 32) {
    throw new ConfigurationError('SESSION_SECRET は32文字以上の十分に長いランダム値で設定してください。');
  }
  return secret;
}

function sessionTokenHash(token, secretValue) {
  return crypto.createHmac('sha256', getSessionSecret(secretValue)).update(String(token), 'utf8').digest('hex');
}

function csrfTokenForSession(token, secretValue) {
  return crypto.createHmac('sha256', getSessionSecret(secretValue)).update(`csrf:${token}`, 'utf8').digest('base64url');
}

function createSessionCredentials(secretValue) {
  const token = crypto.randomBytes(32).toString('base64url');
  return {
    token,
    tokenHash: sessionTokenHash(token, secretValue),
    csrfToken: csrfTokenForSession(token, secretValue),
  };
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ''), 'utf8');
  const b = Buffer.from(String(right || ''), 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = {
  DUMMY_PASSWORD_HASH,
  createSessionCredentials,
  csrfTokenForSession,
  decryptTemporaryPassword,
  encryptTemporaryPassword,
  getSessionSecret,
  hashPassword,
  parseEncryptionKey,
  passwordMaterial,
  performDummyPasswordCheck,
  safeEqual,
  sessionTokenHash,
  verifyPassword,
};
