'use strict';

const message = document.querySelector('#message');
const rows = document.querySelector('#group-rows');
const createForm = document.querySelector('#create-form');
const editDialog = document.querySelector('#edit-dialog');
const editForm = document.querySelector('#edit-form');
const membersDialog = document.querySelector('#members-dialog');
const membersForm = document.querySelector('#members-form');
const memberPicker = document.querySelector('#member-picker');
const memberSearch = document.querySelector('#member-search');
let csrfToken = '';
let groups = [];
let members = [];

function groupById(id) {
  return groups.find((group) => group.id === Number(id));
}

function renderGroups() {
  rows.innerHTML = groups.map((group) => `
    <tr>
      <td>${AuthUi.escapeHtml(group.name)}</td>
      <td>${AuthUi.escapeHtml(group.description || '—')}</td>
      <td>${group.memberCount}名</td>
      <td>${AuthUi.escapeHtml(AuthUi.formatDate(group.updatedAt))}</td>
      <td><div class="compact">
        <button data-action="members" data-id="${group.id}">所属会員</button>
        <button class="secondary" data-action="edit" data-id="${group.id}">編集</button>
        <button class="danger" data-action="archive" data-id="${group.id}">アーカイブ</button>
      </div></td>
    </tr>`).join('') || '<tr><td colspan="5">グループはまだ登録されていません。</td></tr>';
}

async function loadGroups() {
  const data = await AuthUi.request('/api/admin/groups');
  groups = data.groups;
  renderGroups();
}

async function loadMembers() {
  const data = await AuthUi.request('/api/admin/members');
  members = data.members;
}

function renderMemberPicker(selectedIds) {
  const selected = new Set(selectedIds.map(Number));
  memberPicker.innerHTML = members.map((member) => {
    const label = `${member.memberId} ${member.name}`;
    return `<label class="member-option" data-search="${AuthUi.escapeHtml(label.toLowerCase())}">
      <input type="checkbox" name="memberIds" value="${member.id}" ${selected.has(member.id) ? 'checked' : ''}>
      <span><strong>${AuthUi.escapeHtml(member.memberId)}</strong> ${AuthUi.escapeHtml(member.name)}${member.isActive ? '' : ' <span class="inactive-note">（利用停止中）</span>'}</span>
    </label>`;
  }).join('') || '<p class="empty-members">会員はまだ登録されていません。</p>';
}

async function openMembersDialog(group) {
  const data = await AuthUi.request(`/api/admin/groups/${group.id}/members`);
  document.querySelector('#members-target').value = group.id;
  document.querySelector('#members-heading').textContent = `${group.name}の所属会員`;
  memberSearch.value = '';
  renderMemberPicker(data.memberIds);
  membersDialog.showModal();
}

async function initialize() {
  try {
    const session = await AuthUi.session('administrator');
    if (!session.account.capabilities.manageGroups) return location.replace('/admin/dashboard/');
    csrfToken = session.csrfToken;
    await Promise.all([loadGroups(), loadMembers()]);
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
    await AuthUi.request('/api/admin/groups', { method: 'POST', body: values, csrfToken });
    createForm.reset();
    AuthUi.showMessage(message, 'グループを作成しました。', 'success');
    await loadGroups();
  } catch (error) {
    AuthUi.showMessage(message, error.message);
  }
});

rows.addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  const group = groupById(button.dataset.id);
  if (!group) return;
  AuthUi.clearMessage(message);
  try {
    if (button.dataset.action === 'edit') {
      document.querySelector('#edit-target').value = group.id;
      document.querySelector('#edit-name').value = group.name;
      document.querySelector('#edit-description').value = group.description || '';
      editDialog.showModal();
      return;
    }
    if (button.dataset.action === 'members') {
      button.disabled = true;
      await openMembersDialog(group);
      return;
    }
    if (button.dataset.action === 'archive') {
      if (!confirm(`「${group.name}」をアーカイブしますか？所属履歴は保持されます。`)) return;
      button.disabled = true;
      await AuthUi.request(`/api/admin/groups/${group.id}`, { method: 'DELETE', csrfToken });
      AuthUi.showMessage(message, 'グループをアーカイブしました。', 'success');
      await loadGroups();
    }
  } catch (error) {
    AuthUi.showMessage(message, error.message);
  } finally {
    button.disabled = false;
  }
});

editForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const id = document.querySelector('#edit-target').value;
  const body = {
    name: document.querySelector('#edit-name').value,
    description: document.querySelector('#edit-description').value,
  };
  try {
    await AuthUi.request(`/api/admin/groups/${id}`, { method: 'PATCH', body, csrfToken });
    editDialog.close();
    AuthUi.showMessage(message, 'グループを更新しました。', 'success');
    await loadGroups();
  } catch (error) {
    AuthUi.showMessage(message, error.message);
  }
});

membersForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const id = document.querySelector('#members-target').value;
  const memberIds = [...membersForm.querySelectorAll('input[name="memberIds"]:checked')].map((input) => Number(input.value));
  try {
    await AuthUi.request(`/api/admin/groups/${id}/members`, { method: 'PUT', body: { memberIds }, csrfToken });
    membersDialog.close();
    AuthUi.showMessage(message, '所属会員を更新しました。', 'success');
    await loadGroups();
  } catch (error) {
    AuthUi.showMessage(message, error.message);
  }
});

memberSearch.addEventListener('input', () => {
  const query = memberSearch.value.trim().toLowerCase();
  memberPicker.querySelectorAll('.member-option').forEach((option) => {
    option.hidden = Boolean(query) && !option.dataset.search.includes(query);
  });
});

document.querySelector('#edit-cancel').addEventListener('click', () => editDialog.close());
document.querySelector('#members-cancel').addEventListener('click', () => membersDialog.close());

initialize();
