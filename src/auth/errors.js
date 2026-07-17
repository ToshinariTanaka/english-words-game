'use strict';

class AppError extends Error {
  constructor(message, { statusCode = 400, code = 'BAD_REQUEST' } = {}) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

class ValidationError extends AppError {
  constructor(message) { super(message, { statusCode: 400, code: 'VALIDATION_ERROR' }); }
}

class AuthenticationError extends AppError {
  constructor(message = 'IDまたはパスワードが正しくありません。') {
    super(message, { statusCode: 401, code: 'AUTHENTICATION_FAILED' });
  }
}

class LockedError extends AppError {
  constructor() {
    super('ログインが一時停止されています。15分ほど待ってから再試行してください。', { statusCode: 423, code: 'ACCOUNT_LOCKED' });
  }
}

class AuthorizationError extends AppError {
  constructor(message = 'この操作を行う権限がありません。') {
    super(message, { statusCode: 403, code: 'FORBIDDEN' });
  }
}

class NotFoundError extends AppError {
  constructor(message = '対象が見つかりません。') { super(message, { statusCode: 404, code: 'NOT_FOUND' }); }
}

class ConflictError extends AppError {
  constructor(message) { super(message, { statusCode: 409, code: 'CONFLICT' }); }
}

class ConfigurationError extends AppError {
  constructor(message) { super(message, { statusCode: 503, code: 'CONFIGURATION_ERROR' }); }
}

module.exports = {
  AppError,
  AuthenticationError,
  AuthorizationError,
  ConfigurationError,
  ConflictError,
  LockedError,
  NotFoundError,
  ValidationError,
};
