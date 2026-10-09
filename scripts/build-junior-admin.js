'use strict';

// Generate a separate Cloudflare Access-protected admin Pages artifact.
// Preserve the proven Excel validation/upload UI, but REMOVE all upload-token
// inputs and Authorization headers. Do not modify the public student build.
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const source = path.join(root, 'admin', 'junior-data');
const output = path.join(root, 'dist-junior-admin');

function once(text, original, replacement, label) {
  const start = text.indexOf(original);
  if (start === -1 || text.indexOf(original, start + original.length) !== -1) {
    throw new Error('Admin build: source drift in ' + label);
  }
  return text.slice(0, start) + replacement + text.slice(start + original.length);
}

function adminHTML(html) {
  html = once(html, '<title>教材アップロード | 中学生英単語アプリ</title>',
    '<title>Up塾・教材アップロード（管理者専用）</title>', 'title');
  html = once(html,
    '※このページへのアクセス自体は公開されています。保存操作には管理者専用の認証トークンが必要です。一般利用者にURLやトークンを配布しないでください。',
    'Cloudflare Accessで認証された管理者のみ、このサイトと教材更新APIを利用できます。ログイン状態は一定期間維持されます。',
    'admin security description');
  html = once(html,
    '      <label for="token">管理者専用トークン</label>\n      <input id="token" type="password" autocomplete="off" placeholder="Cloudflareのシークレットに設定した値">\n      <p class="note">トークンはこの画面内だけで使用し、ブラウザには保存しません。Cloudflare側のシークレット設定が必要です。</p>\n',
    '      <p class="note">認証済みの管理者として操作できます。64文字の認証キーの入力は不要です。</p>\n',
    'remove secret input');
  html = once(html,'<p><a href="../../">学習画面を開く</a></p>',
    '<p><a href="https://up-junior-words-preview.pages.dev/" target="_blank" rel="noopener noreferrer">公開中の学習画面を開く</a></p>',
    'link to public student site');
  return html;
}

function adminJS(js) {
  js = once(js, "$('publish').disabled = busy || !payload || !$('confirm').checked || !$('token').value;",
    "$('publish').disabled = busy || !payload || !$('confirm').checked;",
    'publish button and secret');
  js = once(js, "$('token').addEventListener('input', updatePublishButton);\n", '',
    'remove token event');
  js = once(js,
    "  const token = $('token').value.trim();\n  if (token.length < 32) {\n    setText('uploadResult', '管理者トークンを入力してください。');\n    return;\n  }\n",
    '',
    'remove token requirement');
  js = once(js, "          'Authorization': 'Bearer ' + token,\n", '',
    'stage API token header');
  js = once(js, "headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },",
    "headers: { 'Content-Type': 'application/json' },", 'publish API token header');
  js = once(js, "    $('token').value = '';\n", '', 'remove token clearing');
  return js;
}

function build() {
  fs.rmSync(output, { recursive: true, force: true });
  fs.mkdirSync(output, { recursive: true });
  const html = adminHTML(fs.readFileSync(path.join(source, 'index.html'), 'utf8'));
  const script = adminJS(fs.readFileSync(path.join(source, 'script.js'), 'utf8'));
  fs.writeFileSync(path.join(output, 'index.html'), html);
  fs.writeFileSync(path.join(output, 'script.js'), script);
  for (const file of ['style.css', 'parser.mjs']) {
    fs.copyFileSync(path.join(source, file), path.join(output, file));
  }
  fs.writeFileSync(path.join(output, '_routes.json'),
    JSON.stringify({ version: 1, include: ['/*'], exclude: [] }, null, 2) + '\n');
  fs.writeFileSync(path.join(output, 'robots.txt'), 'User-agent: *\nDisallow: /\n');
  fs.writeFileSync(path.join(output, '_headers'),
    '/*\n  X-Content-Type-Options: nosniff\n  X-Frame-Options: DENY\n  Referrer-Policy: no-referrer\n  Cache-Control: private, no-store\n');
  process.stdout.write('Created isolated Cloudflare Access admin site in dist-junior-admin.\n');
}

// The signing keys are intentionally PUBLIC. Capture fresh Cloudflare Access
// verification keys at deploy time so Pages Functions do not need a working
// outbound fetch on every request. Never bundle JWTs, cookies, or private keys.
async function refreshPublicJwksSnapshot() {
  const issuer = 'https://tight-voice-62ae.cloudflareaccess.com';
  try {
    const response = await fetch(issuer + '/cdn-cgi/access/certs', {
      redirect: 'manual',
      signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) throw new Error('JWKS HTTP error');
    const obj = await response.json();
    const keys = obj?.keys;
    if (!Array.isArray(keys) || keys.length < 1 || keys.length > 10
        || !keys.every(k => typeof k.kid === 'string'
          && k.kid.length > 5 && k.kty === 'RSA' && k.alg === 'RS256'
          && k.use === 'sig' && typeof k.n === 'string'
          && k.n.length > 150 && k.e === 'AQAB')) {
      throw new Error('JWKS format invalid');
    }
    const snapshot = {
      issuer,
      fetchedAt: new Date().toISOString(),
      keys: keys.map(({ kid, kty, alg, use, e, n }) => ({ kid, kty, alg, use, e, n })),
    };
    fs.writeFileSync(path.join(root, 'cloudflare', 'admin-public-jwks-snapshot.js'),
      '// PUBLIC signing keys automatically refreshed during the admin Pages build.\n' +
      'export const ACCESS_PUBLIC_JWKS_SNAPSHOT = ' +
      JSON.stringify(snapshot, null, 2) + ';\n');
    process.stdout.write('Access public JWKS snapshot refreshed for this build.\n');
    return true;
  } catch {
    // Retain the known public-key snapshot already committed to the repository.
    // The Functions middleware refuses old (>30-day) or mismatched keys.
    process.stderr.write('Unable to refresh Access public JWKS; using bounded-age snapshot.\n');
    return false;
  }
}

if (require.main === module) {
  build();
  refreshPublicJwksSnapshot().catch(() => { process.exitCode = 1; });
}
module.exports = { adminHTML, adminJS, build, refreshPublicJwksSnapshot };
