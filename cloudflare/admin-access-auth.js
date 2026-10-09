// Cloudflare Access JWT validation for the *separate* administrator Pages project.
// Never use client-provided email headers as an authentication decision.
// Validate JWT signature (Cloudflare JWKS), issuer, application audience, times
// and an exact email allowlist. The public student project does not use this file.
function decodeSegment(segment) {
  if (typeof segment !== 'string' || !/^[\w-]+$/.test(segment) || segment.length > 12000) {
    throw new Error('Malformed JWT encoding');
  }
  const base64 = segment.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
  const data = atob(padded);
  return Uint8Array.from(data, char => char.charCodeAt(0));
}

function decodeJson(segment) {
  return JSON.parse(new TextDecoder().decode(decodeSegment(segment)));
}

export function accessConfig(env) {
  const domainValue = String(env?.CF_ACCESS_TEAM_DOMAIN || '').trim();
  const audience = String(env?.CF_ACCESS_AUD || '').trim();
  const rawEmails = String(env?.ADMIN_ALLOWED_EMAILS || '');
  let domain;
  try {
    domain = new URL(domainValue);
  } catch { return null; }
  if (domain.protocol !== 'https:' || !domain.hostname.endsWith('.cloudflareaccess.com')
      || domain.username || domain.password || domain.pathname !== '/'
      || domain.search || domain.hash || audience.length < 16 || audience.length > 256) {
    return null;
  }
  const emails = rawEmails.split(',').map(email => email.trim().toLowerCase());
  if (!emails.length || emails.length > 20
      || emails.some(email => email.length > 254 || email.includes('*')
        || !/^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/.test(email))) {
    return null;
  }
  return { domain: domain.origin, audience, allowedEmails: new Set(emails) };
}

export async function verifyAccessJWT(request, config, fetchCerts = fetch, now = Date.now()) {
  if (!config) return null;
  const token = request.headers.get('Cf-Access-Jwt-Assertion') || '';
  if (!token || token.length > 16000) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const header = decodeJson(parts[0]);
    if (header.alg !== 'RS256' || typeof header.kid !== 'string'
        || !header.kid || header.kid.length > 256) return null;
    const claims = decodeJson(parts[1]);
    const ts = Math.floor(now / 1000);
    if (claims.iss !== config.domain
        || !(typeof claims.aud === 'string'
          ? claims.aud === config.audience
          : Array.isArray(claims.aud) && claims.aud.includes(config.audience))
        || !Number.isInteger(claims.exp) || claims.exp <= ts
        || (claims.nbf !== undefined && (!Number.isInteger(claims.nbf) || claims.nbf > ts + 30))
        || (claims.iat !== undefined && (!Number.isInteger(claims.iat) || claims.iat > ts + 30))
        || typeof claims.sub !== 'string' || !claims.sub
        || typeof claims.email !== 'string' || !config.allowedEmails.has(claims.email.toLowerCase())) {
      return null;
    }
    const jwksResponse = await fetchCerts(config.domain + '/cdn-cgi/access/certs', { redirect: 'error' });
    if (!jwksResponse.ok) return null;
    const certs = await jwksResponse.json();
    const candidates = Array.isArray(certs?.keys) ? certs.keys : [];
    const jwk = candidates.find(k => k.kid === header.kid && k.kty === 'RSA'
      && k.n && k.e && (k.alg === undefined || k.alg === 'RS256')
      && (k.use === undefined || k.use === 'sig'));
    if (!jwk) return null;
    const publicKey = await crypto.subtle.importKey(
      'jwk', { kty: 'RSA', n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify'],
    );
    const isValid = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5', publicKey, decodeSegment(parts[2]),
      new TextEncoder().encode(parts[0] + '.' + parts[1]),
    );
    return isValid ? { email: claims.email.toLowerCase(), subject: claims.sub } : null;
  } catch {
    return null;
  }
}

export function authenticationFailure(status = 403) {
  return new Response(status === 503 ? '管理者認証の設定を確認してください。' : '管理者認証が必要です。', {
    status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY' },
  });
}
