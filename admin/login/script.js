'use strict';

const form = document.querySelector('#login-form');
const message = document.querySelector('#message');

(async () => {
  try {
    await AuthUi.request('/api/auth/status');
  } catch (error) {
    AuthUi.showMessage(message, error.message);
    form.querySelector('button').disabled = true;
  }
})();

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  AuthUi.clearMessage(message);
  const button = form.querySelector('button');
  button.disabled = true;
  try {
    const values = new FormData(form);
    await AuthUi.request('/api/auth/admin/login', {
      method: 'POST',
      body: { loginId: values.get('loginId'), password: values.get('password') },
    });
    form.reset();
    location.replace('/admin/dashboard/');
  } catch (error) {
    form.elements.password.value = '';
    AuthUi.showMessage(message, error.message);
  } finally {
    button.disabled = false;
  }
});
