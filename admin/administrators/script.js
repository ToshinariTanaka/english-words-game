'use strict';

const message = document.querySelector('#message');
const rows = document.querySelector('#administrator-rows');
const createForm = document.querySelector('#create-form');
const resetDialog = document.querySelector('#reset-dialog');
let csrfToken = '';

const roleLabels = { owner: '代表管理者', admin: '一般管理者', viewer: '閲覧者' };

function roleOptions(selected) {
  return Object.entries(roleLabels).map(([value, label]) => `<option value="${value}" ${value === selected ? 'selected' : ''}>${label}</option>`).join('');
}

async function loadAdministrators() {
  const data = await AuthUi.request('/api/admin/administrators');
  rows.innerHTML = data.administrators.map((administrator) => `
    <tr>
      <td>${AuthUi.escapeHtml(administrator.displayName)}</td>
      <td>${AuthUi.escapeHtml(administrator.loginId)}</td>
      <td><select data-role-id="${administrator.id}">${roleOptions(administrator.role)}</select></td>
      <td><span class="badge ${administrator.isActive ? 'active' : 'inactive'}">${administrator.isActive ? '利用中' : '停止中'}</span></td>
      <td>${administrator.lockedUntil && new Date(administrator.lockedUntil) > new Date() ? `<span class="badge locked">${AuthUi.escapeHtml(AuthUi.formatDate(administrator.lockedUntil))}まで</span>` : '—'}</td>
      <td>${AuthUi.escapeHtml(AuthUi.formatDate(administrator.lastLoginAt))}</td>
      <td><div class="compact">
        <button data-action="save-role" data-id="${administrator.id}">権限を保存</button>
        <button class="secondary" data-action="toggle" data-id="${administrator.id}" data-active="${administrator.isActive}">${administrator.isActive ? '利用停止' : '利用再開'}</button>
        <button class="secondary" data-action="reset" data-id="${administrator.id}">パスワード再設定</button>
        <button class="secondary" data-action="unlock" data-id="${administrator.id}">停止解除</button>
        <button class="secondary" data-action="revoke" data-id="${administrator.id}">全端末ログアウト</button>
      </div></td>
    </tr>`).join('');
}

async function initialize() {
  try {
    const session = await AuthUi.session('administrator');
    if (!session.account.capabilities.manageAdministrators) return location.replace('/admin/dashboard/');
    csrfToken = session.csrfToken;
    await loadAdministrators();
  } catch (error) {
    if (error.status === 401) return location.replace('/admin/login/');
    AuthUi.showMessage(message, error.message);
  }
}

createForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  AuthUi.clearMessage(message);
  const values = Object.fromEntries(new FormData(createForm));
  try {
    await AuthUi.request('/api/admin/administrators', { method: 'POST', body: values, csrfToken });
    createForm.reset();
    AuthUi.showMessage(message, '管理者を作成しました。', 'success');
    await loadAdministrators();
  } catch (error) {
    createForm.elements.password.value = '';
    AuthUi.showMessage(message, error.message);
  }
});

rows.addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  const { action, id } = button.dataset;
  button.disabled = true;
  AuthUi.clearMessage(message);
  try {
    if (action === 'reset') {
      document.querySelector('#reset-target').value = id;
      resetDialog.showModal();
      return;
    }
    if (action === 'save-role') {
      const role = document.querySelector(`select[data-role-id="${id}"]`).value;
      await AuthUi.request(`/api/admin/administrators/${id}`, { method: 'PATCH', body: { role }, csrfToken });
    }
    if (action === 'toggle') {
      const isActive = button.dataset.active !== 'true';
      if (!confirm(isActive ? 'この管理者の利用を再開しますか？' : 'この管理者を利用停止し、全端末からログアウトしますか？')) return;
      await AuthUi.request(`/api/admin/administrators/${id}`, { method: 'PATCH', body: { isActive }, csrfToken });
    }
    if (action === 'unlock') await AuthUi.request(`/api/admin/administrators/${id}/unlock`, { method: 'POST', body: {}, csrfToken });
    if (action === 'revoke') {
      if (!confirm('この管理者を全端末からログアウトしますか？')) return;
      await AuthUi.request(`/api/admin/administrators/${id}/revoke-sessions`, { method: 'POST', body: {}, csrfToken });
    }
    AuthUi.showMessage(message, '操作が完了しました。', 'success');
    await loadAdministrators();
  } catch (error) {
    AuthUi.showMessage(message, error.message);
  } finally {
    button.disabled = false;
  }
});

document.querySelector('#reset-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const id = document.querySelector('#reset-target').value;
  const password = document.querySelector('#reset-password').value;
  try {
    await AuthUi.request(`/api/admin/administrators/${id}/reset-password`, { method: 'POST', body: { password }, csrfToken });
    resetDialog.close();
    AuthUi.showMessage(message, '管理者パスワードを再設定し、既存セッションを失効しました。', 'success');
    await loadAdministrators();
  } catch (error) {
    AuthUi.showMessage(message, error.message);
  }
});

document.querySelector('#reset-cancel').addEventListener('click', () => resetDialog.close());
resetDialog.addEventListener('close', () => { document.querySelector('#reset-password').value = ''; });

initialize();
