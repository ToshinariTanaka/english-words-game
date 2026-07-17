'use strict';

const message = document.querySelector('#message');
const rows = document.querySelector('#log-rows');

async function loadLogs() {
  AuthUi.clearMessage(message);
  try {
    const session = await AuthUi.session('administrator');
    if (!session.account.capabilities.viewAuditLogs) return location.replace('/admin/dashboard/');
    const data = await AuthUi.request('/api/admin/audit-logs?limit=200');
    rows.innerHTML = data.logs.map((log) => `
      <tr>
        <td>${AuthUi.escapeHtml(AuthUi.formatDate(log.createdAt))}</td>
        <td>${AuthUi.escapeHtml(log.action)}</td>
        <td>${AuthUi.escapeHtml(log.actorType || '—')} #${AuthUi.escapeHtml(log.actorId || '—')}</td>
        <td>${AuthUi.escapeHtml(log.targetType || '—')} #${AuthUi.escapeHtml(log.targetId || '—')}</td>
        <td><code>${AuthUi.escapeHtml(JSON.stringify(log.metadata || {}))}</code></td>
      </tr>`).join('') || '<tr><td colspan="5">監査ログはありません。</td></tr>';
  } catch (error) {
    if (error.status === 401) return location.replace('/admin/login/');
    AuthUi.showMessage(message, error.message);
  }
}

document.querySelector('#refresh').addEventListener('click', loadLogs);
loadLogs();
