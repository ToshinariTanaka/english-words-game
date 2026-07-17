'use strict';

const { ValidationError } = require('./errors');

const ADMIN_ROLES = new Set(['owner', 'admin', 'viewer']);
const LOGIN_ID_PATTERN = /^[A-Za-z0-9._@-]{3,64}$/;

function requiredString(value, label, { min = 1, max = 100, trim = true } = {}) {
  if (typeof value !== 'string') throw new ValidationError(`${label}を入力してください。`);
  const text = trim ? value.trim() : value;
  if (text.length < min) throw new ValidationError(`${label}は${min}文字以上で入力してください。`);
  if (text.length > max) throw new ValidationError(`${label}は${max}文字以内で入力してください。`);
  if (text.includes('\0')) throw new ValidationError(`${label}に使用できない文字が含まれています。`);
  return text;
}

function validateLoginId(value) {
  const loginId = requiredString(value, 'ログインID', { min: 3, max: 64 });
  if (!LOGIN_ID_PATTERN.test(loginId)) throw new ValidationError('ログインIDは半角英数字と . _ @ - を使用してください。');
  return loginId;
}

function validateMemberId(value) {
  const memberId = requiredString(value, '会員ID', { min: 8, max: 16 }).toUpperCase();
  if (!/^UP\d{6,}$/.test(memberId)) throw new ValidationError('会員IDの形式が正しくありません。');
  return memberId;
}

function validateName(value, label = '氏名') {
  return requiredString(value, label, { min: 1, max: 100 });
}

function validatePassword(value, accountType) {
  const min = accountType === 'administrator' ? 8 : 4;
  return requiredString(value, 'パスワード', { min, max: 128, trim: false });
}

function validateLoginPassword(value) {
  return requiredString(value, 'パスワード', { min: 1, max: 128, trim: false });
}

function validateRole(value) {
  if (!ADMIN_ROLES.has(value)) throw new ValidationError('権限の指定が正しくありません。');
  return value;
}

function validateBoolean(value, label) {
  if (typeof value !== 'boolean') throw new ValidationError(`${label}の指定が正しくありません。`);
  return value;
}

function validatePositiveId(value) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw new ValidationError('対象IDが正しくありません。');
  return id;
}

module.exports = {
  ADMIN_ROLES,
  requiredString,
  validateBoolean,
  validateLoginId,
  validateLoginPassword,
  validateMemberId,
  validateName,
  validatePassword,
  validatePositiveId,
  validateRole,
};
