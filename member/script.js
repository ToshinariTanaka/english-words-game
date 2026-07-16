'use strict';

let csrfToken = '';

async function loadSession() {
  try {
    const data = await AuthUi.session('member');
    csrfToken = data.csrfToken;
    document.querySelector('#name').textContent = data.account.name;
    document.querySelector('#member-id').textContent = data.account.memberId;
    document.querySelector('#last-login').textContent = AuthUi.formatDate(data.account.lastLoginAt);
  } catch (_) {
    location.replace('/member/login/');
  }
}

document.querySelector('#logout').addEventListener('click', async () => {
  try {
    await AuthUi.request('/api/auth/logout', { method: 'POST', body: { accountType: 'member' }, csrfToken });
  } finally {
    location.replace('/member/login/');
  }
});

loadSession();
