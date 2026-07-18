'use strict';

const message = document.querySelector('#message');
const passwordForm = document.querySelector('#password-form');
let csrfToken = '';

async function loadSession() {
  try {
    const data = await AuthUi.session('administrator');
    csrfToken = data.csrfToken;
    const account = data.account;
    document.querySelector('#display-name').textContent = account.displayName;
    document.querySelector('#role').textContent = account.roleLabel;
    document.querySelector('#last-login').textContent = AuthUi.formatDate(account.lastLoginAt);
    const links = [];
    if (account.capabilities.manageGroups) links.push('<a class="button" href="/admin/groups/">グループ管理</a>');
    if (account.capabilities.manageMembers) links.push('<a class="button" href="/admin/members/">会員管理</a>');
    if (account.capabilities.manageAdministrators) links.push('<a class="button" href="/admin/administrators/">管理者管理</a>');
    if (account.capabilities.viewAuditLogs) links.push('<a class="button" href="/admin/audit-logs/">監査ログ</a>');
    document.querySelector('#links').innerHTML = links.join('') || '<span class="muted">閲覧できる管理機能はありません。</span>';
  } catch (error) {
    location.replace('/admin/login/');
  }
}

document.querySelector('#logout').addEventListener('click', async () => {
  try {
    await AuthUi.request('/api/auth/logout', { method: 'POST', body: { accountType: 'administrator' }, csrfToken });
  } finally {
    location.replace('/admin/login/');
  }
});

passwordForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  AuthUi.clearMessage(message);
  const values = Object.fromEntries(new FormData(passwordForm));
  try {
    const data = await AuthUi.request('/api/admin/change-password', { method: 'POST', body: values, csrfToken });
    csrfToken = data.csrfToken;
    passwordForm.reset();
    AuthUi.showMessage(message, data.message, 'success');
  } catch (error) {
    passwordForm.reset();
    AuthUi.showMessage(message, error.message);
  }
});

loadSession();
