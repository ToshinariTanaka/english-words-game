'use strict';

(function exposeAuthUi() {
  async function request(url, { method = 'GET', body, csrfToken } = {}) {
    const headers = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (csrfToken) headers['X-CSRF-Token'] = csrfToken;
    const response = await fetch(url, {
      method,
      credentials: 'same-origin',
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    let data;
    try { data = await response.json(); } catch (_) { data = { error: 'サーバーから不正な応答が返されました。' }; }
    if (!response.ok) {
      const error = new Error(data.error || '処理に失敗しました。');
      error.status = response.status;
      error.code = data.code;
      throw error;
    }
    return data;
  }

  function session(accountType) {
    return request(`/api/auth/session?accountType=${encodeURIComponent(accountType)}`);
  }

  function formatDate(value) {
    if (!value) return '—';
    return new Intl.DateTimeFormat('ja-JP', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Tokyo' }).format(new Date(value));
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
  }

  function showMessage(element, message, type = 'error') {
    element.textContent = message || '';
    element.className = `message visible ${type}`;
  }

  function clearMessage(element) {
    element.textContent = '';
    element.className = 'message';
  }

  window.AuthUi = { clearMessage, escapeHtml, formatDate, request, session, showMessage };
})();
