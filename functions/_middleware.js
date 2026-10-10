import { SITE_ROLE } from '../cloudflare/junior-site-role.js';
import { onRequest as adminMiddleware } from '../cloudflare/junior-admin-middleware.js';
import { jsonResponse } from '../cloudflare/junior-questions.js';

// Build-time constant, never a browser header. Unknown builds fail closed.
export async function onRequest(context) {
  if (SITE_ROLE === 'admin') return adminMiddleware(context);
  if (SITE_ROLE !== 'student') return jsonResponse({ok:false,error:'サイト設定を確認してください。'},503);
  delete context.data.verifiedAdminEmail;
  if (new URL(context.request.url).pathname.startsWith('/api/admin/students')) {
    return jsonResponse({ok:false,error:'管理者専用サイトを利用してください。'},403);
  }
  return context.next();
}
