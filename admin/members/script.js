'use strict';

const message = document.querySelector('#message');
const rows = document.querySelector('#member-rows');
const createForm = document.querySelector('#create-form');
const secretDialog = document.querySelector('#secret-dialog');
const resetDialog = document.querySelector('#reset-dialog');
let csrfToken = '';
let canViewTemporaryPasswords = false;

function statusBadge(active) {
  return `<span class="badge ${active ? 'active' : 'inactive'}">${active ? '利用中' : '停止中'}</span>`;
}

async function loadMembers() {
  const data = await AuthUi.request('/api/admin/members');
  rows.innerHTML = data.members.map((member) => `
    <tr>
      <td>${AuthUi.escapeHtml(member.memberId)}</td>
      <td>${AuthUi.escapeHtml(member.name)}</td>
      <td>${statusBadge(member.isActive)}</td>
      <td>${member.lockedUntil && new Date(member.lockedUntil) > new Date() ? `<span class="badge locked">${AuthUi.escapeHtml(AuthUi.formatDate(member.lockedUntil))}まで</span>` : '—'}</td>
      <td>${AuthUi.escapeHtml(AuthUi.formatDate(member.lastLoginAt))}</td>
      <td>${member.hasTemporaryPassword ? (canViewTemporaryPasswords ? `<button data-action="view" data-id="${member.id}">確認</button>` : '確認権限なし') : '変更済み'}</td>
      <td><div class="compact">
        <button class="secondary" data-action="toggle" data-id="${member.id}" data-active="${member.isActive}">${member.isActive ? '利用停止' : '利用再開'}</button>
        <button class="secondary" data-action="reset" data-id="${member.id}">仮パスワード</button>
        <button class="secondary" data-action="unlock" data-id="${member.id}">停止解除</button>
        <button class="secondary" data-action="revoke" data-id="${member.id}">全端末ログアウト</button>
      </div></td>
    </tr>`).join('') || '<tr><td colspan="7">会員はまだ登録されていません。</td></tr>';
}

async function initialize() {
  try {
    const session = await AuthUi.session('administrator');
    if (!session.account.capabilities.manageMembers) return location.replace('/admin/dashboard/');
    csrfToken = session.csrfToken;
    canViewTemporaryPasswords = session.account.capabilities.viewTemporaryPasswords;
    await loadMembers();
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
    const data = await AuthUi.request('/api/admin/members', { method: 'POST', body: values, csrfToken });
    createForm.reset();
    AuthUi.showMessage(message, `会員を作成しました。会員ID: ${data.member.memberId}`, 'success');
    await loadMembers();
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
    if (action === 'view') {
      const data = await AuthUi.request(`/api/admin/members/${id}/temporary-password`, { csrfToken });
      document.querySelector('#secret-value').textContent = data.temporaryPassword;
      secretDialog.showModal();
      return;
    }
    if (action === 'reset') {
      document.querySelector('#reset-target').value = id;
      document.querySelector('#reset-password').value = '';
      resetDialog.showModal();
      return;
    }
    if (action === 'toggle') {
      const next = button.dataset.active !== 'true';
      if (!confirm(next ? 'この会員の利用を再開しますか？' : 'この会員を利用停止し、全端末からログアウトしますか？')) return;
      await AuthUi.request(`/api/admin/members/${id}/status`, { method: 'PATCH', body: { isActive: next }, csrfToken });
    }
    if (action === 'unlock') await AuthUi.request(`/api/admin/members/${id}/unlock`, { method: 'POST', body: {}, csrfToken });
    if (action === 'revoke') {
      if (!confirm('この会員を全端末からログアウトしますか？')) return;
      await AuthUi.request(`/api/admin/members/${id}/revoke-sessions`, { method: 'POST', body: {}, csrfToken });
    }
    AuthUi.showMessage(message, '操作が完了しました。', 'success');
    await loadMembers();
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
    await AuthUi.request(`/api/admin/members/${id}/reset-password`, { method: 'POST', body: { password }, csrfToken });
    resetDialog.close();
    document.querySelector('#reset-password').value = '';
    AuthUi.showMessage(message, '仮パスワードを再設定し、既存セッションを失効しました。', 'success');
    await loadMembers();
  } catch (error) {
    AuthUi.showMessage(message, error.message);
  }
});

document.querySelector('#reset-cancel').addEventListener('click', () => resetDialog.close());
secretDialog.addEventListener('close', () => { document.querySelector('#secret-value').textContent = ''; });
resetDialog.addEventListener('close', () => { document.querySelector('#reset-password').value = ''; });

initialize();
