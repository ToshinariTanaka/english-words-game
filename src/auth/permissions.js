'use strict';

const { AuthorizationError } = require('./errors');

const ROLE_LABELS = Object.freeze({ owner: '代表管理者', admin: '一般管理者', viewer: '閲覧者' });

function requireRole(account, allowedRoles) {
  if (!account || account.accountType !== 'administrator' || !allowedRoles.includes(account.role)) {
    throw new AuthorizationError();
  }
  return account;
}

function canManageMembers(role) { return role === 'owner' || role === 'admin'; }
function canManageAdministrators(role) { return role === 'owner'; }
function canViewTemporaryPasswords(role) { return role === 'owner' || role === 'admin'; }
function canViewAuditLogs(role) { return role === 'owner'; }

module.exports = {
  ROLE_LABELS,
  canManageAdministrators,
  canManageMembers,
  canViewAuditLogs,
  canViewTemporaryPasswords,
  requireRole,
};
