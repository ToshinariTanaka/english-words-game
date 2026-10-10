import { accessConfig, verifyAccessJWT, authenticationFailure } from './admin-access-auth.js';

// Runs for EVERY request on the separate administrator Pages project.
// dist-junior-admin/_routes.json must include "/*" with no exclusions.
// A missing or invalid Access setup fails closed, including static files.
export async function onRequest({ request, env, data, next }) {
  const config = accessConfig(env);
  if (!config) {
    console.warn('junior_admin_access_denied', 'config_invalid');
    return authenticationFailure(503);
  }
  const identity = await verifyAccessJWT(request, config);
  if (!identity) return authenticationFailure(403);
  data.verifiedAdminEmail = identity.email;
  const response = await next();
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', 'private, no-store, max-age=0');
  headers.set('X-Frame-Options', 'DENY');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Referrer-Policy', 'no-referrer');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
