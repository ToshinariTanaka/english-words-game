'use strict';

const form = document.querySelector('#password-form');
const message = document.querySelector('#message');
let csrfToken = '';

(async () => {
  try {
    csrfToken = (await AuthUi.session('member')).csrfToken;
  } catch (_) {
    location.replace('/member/login/');
  }
})();

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  AuthUi.clearMessage(message);
  const values = Object.fromEntries(new FormData(form));
  try {
    const data = await AuthUi.request('/api/member/change-password', { method: 'POST', body: values, csrfToken });
    csrfToken = data.csrfToken;
    form.reset();
    AuthUi.showMessage(message, data.message, 'success');
  } catch (error) {
    form.reset();
    AuthUi.showMessage(message, error.message);
  }
});
