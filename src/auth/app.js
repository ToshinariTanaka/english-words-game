'use strict';

const db = require('../db');
const { getConfig } = require('../config');
const { parseCookies, readJson, sendJson } = require('../http/json');
const {
  AppError,
  AuthenticationError,
  AuthorizationError,
  ConfigurationError,
} = require('./errors');
const {
  canManageAdministrators,
  canManageGroups,
  canManageMembers,
  canViewAuditLogs,
  canViewTemporaryPasswords,
  ROLE_LABELS,
} = require('./permissions');
const { csrfTokenForSession, safeEqual } = require('./security');
const service = require('./service');

const COOKIE_NAMES = Object.freeze({
  administrator: { session: 'ewg_admin_session', csrf: 'ewg_admin_csrf' },
  member: { session: 'ewg_member_session', csrf: 'ewg_member_csrf' },
});

function cookieLine(name, value, { httpOnly = false, maxAge, expires } = {}) {
  const config = getConfig();
  const attributes = [`${name}=${encodeURIComponent(value)}`, 'Path=/', 'SameSite=Lax'];
  if (httpOnly) attributes.push('HttpOnly');
  if (config.isProduction) attributes.push('Secure');
  if (Number.isFinite(maxAge)) attributes.push(`Max-Age=${Math.max(0, Math.floor(maxAge))}`);
  if (expires) attributes.push(`Expires=${expires.toUTCString()}`);
  return attributes.join('; ');
}

function sessionCookies(accountType, session) {
  const names = COOKIE_NAMES[accountType];
  const maxAge = Math.floor((new Date(session.expiresAt).getTime() - Date.now()) / 1000);
  return [
    cookieLine(names.session, session.token, { httpOnly: true, maxAge, expires: new Date(session.expiresAt) }),
    cookieLine(names.csrf, session.csrfToken, { maxAge, expires: new Date(session.expiresAt) }),
  ];
}

function clearedCookies(accountType) {
  const names = COOKIE_NAMES[accountType];
  const expires = new Date(0);
  return [
    cookieLine(names.session, '', { httpOnly: true, maxAge: 0, expires }),
    cookieLine(names.csrf, '', { maxAge: 0, expires }),
  ];
}

function clientMetadata(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return {
    ipAddress: forwarded || req.socket?.remoteAddress || null,
    userAgent: req.headers['user-agent'] || null,
  };
}

function requestOriginAllowed(req) {
  if (String(req.headers['sec-fetch-site'] || '').toLowerCase() === 'cross-site') return false;
  const origin = String(req.headers.origin || '').trim();
  if (!origin) return true;
  const protocol = String(req.headers['x-forwarded-proto'] || (req.socket?.encrypted ? 'https' : 'http')).split(',')[0].trim();
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  if (!host) return false;
  try { return new URL(origin).origin === `${protocol}://${host}`; } catch (_) { return false; }
}

function rawSessionToken(req, accountType) {
  return parseCookies(req.headers.cookie)[COOKIE_NAMES[accountType].session] || '';
}

async function requireSession(req, accountType) {
  const token = rawSessionToken(req, accountType);
  const session = await service.getSession(accountType, token);
  if (!session) throw new AuthenticationError('ログインが必要です。');
  return { ...session, token };
}

function requireCsrf(req, accountType, token) {
  const cookies = parseCookies(req.headers.cookie);
  const headerToken = String(req.headers['x-csrf-token'] || '');
  const cookieToken = cookies[COOKIE_NAMES[accountType].csrf] || '';
  const expected = csrfTokenForSession(token);
  if (!requestOriginAllowed(req) || !safeEqual(headerToken, cookieToken) || !safeEqual(headerToken, expected)) {
    throw new AuthorizationError('安全確認に失敗しました。画面を再読み込みしてから再試行してください。');
  }
}

function requireAdminPermission(session, predicate) {
  if (!predicate(session.account.role)) throw new AuthorizationError();
  return session.account;
}

function withAccountCapabilities(account) {
  if (account.accountType !== 'administrator') return account;
  return {
    ...account,
    roleLabel: ROLE_LABELS[account.role],
    capabilities: {
      manageGroups: canManageGroups(account.role),
      manageMembers: canManageMembers(account.role),
      manageAdministrators: canManageAdministrators(account.role),
      viewTemporaryPasswords: canViewTemporaryPasswords(account.role),
      viewAuditLogs: canViewAuditLogs(account.role),
    },
  };
}

async function handleLogin(req, res, accountType) {
  const body = await readJson(req, getConfig().authJsonLimitBytes);
  const identifier = accountType === 'administrator' ? body.loginId : body.memberId;
  const result = await service.authenticate(accountType, identifier, body.password, clientMetadata(req));
  res.setHeader('Set-Cookie', sessionCookies(accountType, result.session));
  sendJson(res, 200, { ok: true, account: withAccountCapabilities(result.account), csrfToken: result.session.csrfToken, expiresAt: result.session.expiresAt });
}

async function handleSession(req, res, url) {
  const requested = url.searchParams.get('accountType');
  const accountType = requested === 'member' ? 'member' : 'administrator';
  const session = await requireSession(req, accountType);
  sendJson(res, 200, {
    ok: true,
    account: withAccountCapabilities(session.account),
    csrfToken: csrfTokenForSession(session.token),
    expiresAt: session.expiresAt,
  });
}

async function handleLogout(req, res) {
  const body = await readJson(req, getConfig().authJsonLimitBytes);
  const accountType = body.accountType === 'member' ? 'member' : 'administrator';
  const session = await requireSession(req, accountType);
  requireCsrf(req, accountType, session.token);
  await service.revokeCurrentSession(session, clientMetadata(req));
  res.setHeader('Set-Cookie', clearedCookies(accountType));
  sendJson(res, 200, { ok: true });
}

async function handleOwnPasswordChange(req, res, accountType) {
  const session = await requireSession(req, accountType);
  requireCsrf(req, accountType, session.token);
  const body = await readJson(req, getConfig().authJsonLimitBytes);
  if (body.newPassword !== body.newPasswordConfirmation) throw new AppError('新しいパスワードの確認入力が一致しません。');
  const result = await service.changeOwnPassword(session, body.currentPassword, body.newPassword, clientMetadata(req));
  res.setHeader('Set-Cookie', sessionCookies(accountType, result.session));
  sendJson(res, 200, {
    ok: true,
    message: 'パスワードを変更し、ほかの端末からログアウトしました。',
    account: withAccountCapabilities(result.account),
    csrfToken: result.session.csrfToken,
    expiresAt: result.session.expiresAt,
  });
}

async function handleMembers(req, res, url) {
  const session = await requireSession(req, 'administrator');
  const actor = requireAdminPermission(session, canManageMembers);
  if (req.method === 'GET' && url.pathname === '/api/admin/members') {
    return sendJson(res, 200, { ok: true, members: await service.listMembers() });
  }
  requireCsrf(req, 'administrator', session.token);
  if (req.method === 'POST' && url.pathname === '/api/admin/members') {
    const body = await readJson(req, getConfig().authJsonLimitBytes);
    return sendJson(res, 201, { ok: true, member: await service.createMember(actor, body) });
  }
  const temporaryMatch = url.pathname.match(/^\/api\/admin\/members\/(\d+)\/temporary-password$/);
  if (req.method === 'GET' && temporaryMatch) {
    if (!canViewTemporaryPasswords(actor.role)) throw new AuthorizationError();
    const password = await service.getTemporaryPassword(actor, temporaryMatch[1]);
    return sendJson(res, 200, { ok: true, temporaryPassword: password });
  }
  const statusMatch = url.pathname.match(/^\/api\/admin\/members\/(\d+)\/status$/);
  if (req.method === 'PATCH' && statusMatch) {
    const body = await readJson(req, getConfig().authJsonLimitBytes);
    return sendJson(res, 200, { ok: true, member: await service.setMemberStatus(actor, statusMatch[1], body.isActive) });
  }
  const resetMatch = url.pathname.match(/^\/api\/admin\/members\/(\d+)\/reset-password$/);
  if (req.method === 'POST' && resetMatch) {
    const body = await readJson(req, getConfig().authJsonLimitBytes);
    return sendJson(res, 200, { ok: true, member: await service.resetMemberPassword(actor, resetMatch[1], body.password) });
  }
  const unlockMatch = url.pathname.match(/^\/api\/admin\/members\/(\d+)\/unlock$/);
  if (req.method === 'POST' && unlockMatch) {
    return sendJson(res, 200, { ok: true, member: await service.unlockAccount(actor, 'member', unlockMatch[1]) });
  }
  const revokeMatch = url.pathname.match(/^\/api\/admin\/members\/(\d+)\/revoke-sessions$/);
  if (req.method === 'POST' && revokeMatch) {
    return sendJson(res, 200, { ok: true, member: await service.revokeAllSessions(actor, 'member', revokeMatch[1]) });
  }
  throw new AppError('APIが見つかりません。', { statusCode: 404, code: 'NOT_FOUND' });
}

async function handleGroups(req, res, url) {
  const session = await requireSession(req, 'administrator');
  const actor = requireAdminPermission(session, canManageGroups);
  if (req.method === 'GET' && url.pathname === '/api/admin/groups') {
    return sendJson(res, 200, { ok: true, groups: await service.listGroups() });
  }
  const membersMatch = url.pathname.match(/^\/api\/admin\/groups\/(\d+)\/members$/);
  if (req.method === 'GET' && membersMatch) {
    return sendJson(res, 200, { ok: true, memberIds: await service.getGroupMemberIds(membersMatch[1]) });
  }

  requireCsrf(req, 'administrator', session.token);
  if (req.method === 'POST' && url.pathname === '/api/admin/groups') {
    const body = await readJson(req, getConfig().authJsonLimitBytes);
    return sendJson(res, 201, { ok: true, group: await service.createGroup(actor, body) });
  }
  if (req.method === 'PUT' && membersMatch) {
    const body = await readJson(req, getConfig().authJsonLimitBytes);
    return sendJson(res, 200, { ok: true, membership: await service.replaceGroupMembers(actor, membersMatch[1], body.memberIds) });
  }
  const itemMatch = url.pathname.match(/^\/api\/admin\/groups\/(\d+)$/);
  if (req.method === 'PATCH' && itemMatch) {
    const body = await readJson(req, getConfig().authJsonLimitBytes);
    return sendJson(res, 200, { ok: true, group: await service.updateGroup(actor, itemMatch[1], body) });
  }
  if (req.method === 'DELETE' && itemMatch) {
    return sendJson(res, 200, { ok: true, group: await service.archiveGroup(actor, itemMatch[1]) });
  }
  throw new AppError('APIが見つかりません。', { statusCode: 404, code: 'NOT_FOUND' });
}

async function handleAdministrators(req, res, url) {
  const session = await requireSession(req, 'administrator');
  const actor = requireAdminPermission(session, canManageAdministrators);
  if (req.method === 'GET' && url.pathname === '/api/admin/administrators') {
    return sendJson(res, 200, { ok: true, administrators: await service.listAdministrators() });
  }
  requireCsrf(req, 'administrator', session.token);
  if (req.method === 'POST' && url.pathname === '/api/admin/administrators') {
    const body = await readJson(req, getConfig().authJsonLimitBytes);
    return sendJson(res, 201, { ok: true, administrator: await service.createAdministrator(actor, body) });
  }
  const itemMatch = url.pathname.match(/^\/api\/admin\/administrators\/(\d+)$/);
  if (req.method === 'PATCH' && itemMatch) {
    const body = await readJson(req, getConfig().authJsonLimitBytes);
    return sendJson(res, 200, { ok: true, administrator: await service.updateAdministrator(actor, itemMatch[1], body) });
  }
  const resetMatch = url.pathname.match(/^\/api\/admin\/administrators\/(\d+)\/reset-password$/);
  if (req.method === 'POST' && resetMatch) {
    const body = await readJson(req, getConfig().authJsonLimitBytes);
    return sendJson(res, 200, { ok: true, administrator: await service.resetAdministratorPassword(actor, resetMatch[1], body.password) });
  }
  const unlockMatch = url.pathname.match(/^\/api\/admin\/administrators\/(\d+)\/unlock$/);
  if (req.method === 'POST' && unlockMatch) {
    return sendJson(res, 200, { ok: true, administrator: await service.unlockAccount(actor, 'administrator', unlockMatch[1]) });
  }
  const revokeMatch = url.pathname.match(/^\/api\/admin\/administrators\/(\d+)\/revoke-sessions$/);
  if (req.method === 'POST' && revokeMatch) {
    return sendJson(res, 200, { ok: true, administrator: await service.revokeAllSessions(actor, 'administrator', revokeMatch[1]) });
  }
  throw new AppError('APIが見つかりません。', { statusCode: 404, code: 'NOT_FOUND' });
}

async function handleAuditLogs(req, res, url) {
  const session = await requireSession(req, 'administrator');
  requireAdminPermission(session, canViewAuditLogs);
  sendJson(res, 200, { ok: true, logs: await service.listAuditLogs(url.searchParams.get('limit')) });
}

function canHandle(pathname) {
  return pathname === '/api/auth/status'
    || pathname.startsWith('/api/auth/')
    || pathname.startsWith('/api/admin/')
    || pathname.startsWith('/api/member/');
}

async function route(req, res, url) {
  if (req.method === 'GET' && url.pathname === '/api/auth/status') return sendJson(res, 200, { ok: true, ...(await service.status()) });
  if (req.method === 'POST' && url.pathname === '/api/auth/admin/login') return handleLogin(req, res, 'administrator');
  if (req.method === 'POST' && url.pathname === '/api/auth/member/login') return handleLogin(req, res, 'member');
  if (req.method === 'GET' && url.pathname === '/api/auth/session') return handleSession(req, res, url);
  if (req.method === 'POST' && url.pathname === '/api/auth/logout') return handleLogout(req, res);
  if (req.method === 'POST' && url.pathname === '/api/member/change-password') return handleOwnPasswordChange(req, res, 'member');
  if (req.method === 'POST' && url.pathname === '/api/admin/change-password') return handleOwnPasswordChange(req, res, 'administrator');
  if (url.pathname === '/api/admin/groups' || url.pathname.startsWith('/api/admin/groups/')) return handleGroups(req, res, url);
  if (url.pathname === '/api/admin/members' || url.pathname.startsWith('/api/admin/members/')) return handleMembers(req, res, url);
  if (url.pathname === '/api/admin/administrators' || url.pathname.startsWith('/api/admin/administrators/')) return handleAdministrators(req, res, url);
  if (req.method === 'GET' && url.pathname === '/api/admin/audit-logs') return handleAuditLogs(req, res, url);
  throw new AppError('APIが見つかりません。', { statusCode: 404, code: 'NOT_FOUND' });
}

async function handle(req, res, url) {
  try {
    await route(req, res, url);
  } catch (error) {
    if (res.headersSent) return;
    if (db.isConnectionError(error)) {
      return sendJson(res, 503, {
        ok: false,
        code: 'DATABASE_UNAVAILABLE',
        error: '会員機能のデータベースに接続できません。\n既存の英語学習機能は引き続き利用できます。',
      });
    }
    if (error instanceof ConfigurationError) {
      return sendJson(res, 503, { ok: false, code: error.code, error: `${error.message}\n既存の英語学習機能は引き続き利用できます。` });
    }
    if (error instanceof AppError) {
      return sendJson(res, error.statusCode, { ok: false, code: error.code, error: error.message });
    }
    console.error('[member-auth] 予期しないエラー', { code: error?.code || null, message: error?.message || 'unknown' });
    return sendJson(res, 500, { ok: false, code: 'INTERNAL_ERROR', error: '処理中にエラーが発生しました。時間をおいて再試行してください。' });
  }
}

module.exports = {
  COOKIE_NAMES,
  canHandle,
  clearedCookies,
  handle,
  requestOriginAllowed,
  sessionCookies,
};
