'use strict';

// Build a standalone, Render-independent *demo* of the junior study app.
// This command never reads live question data, saved audio, or credentials.
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SOURCE = path.join(ROOT, 'study-app');
const OUTPUT = path.join(ROOT, 'dist-junior');
const DEMO_FILES = ['word_mode.csv', 'chunk_mode.csv', 'phrase_mode.csv', 'definition_mode.csv'];

function replaceExactlyOnce(text, needle, replacement, label) {
  const first = text.indexOf(needle);
  if (first < 0 || text.indexOf(needle, first + needle.length) >= 0) {
    throw new Error('Static junior build: unexpected source for ' + label);
  }
  return text.slice(0, first) + replacement + text.slice(first + needle.length);
}

function replacePatternOnce(text, pattern, replacement, label) {
  const matches = [...text.matchAll(new RegExp(pattern.source, 'gm'))];
  if (matches.length !== 1) {
    throw new Error('Static junior build: unexpected source pattern for ' + label + ' (' + matches.length + ')');
  }
  return text.replace(pattern, replacement);
}

function rewriteJavaScript(js) {
  js = replaceExactlyOnce(
    js,
    "const RENDER_API_BASE_URL = 'https://english-words-game-1ph3.onrender.com';",
    "const STATIC_JUNIOR_PREVIEW = true;\nconst RENDER_API_BASE_URL = '';",
    'preview flag',
  );
  js = replacePatternOnce(
    js,
    /^const RENDER_STUDY_APP_URL = .*;$/m,
    "const RENDER_STUDY_APP_URL = '';",
    'legacy Render link',
  );
  js = replaceExactlyOnce(
    js,
    'async function loadAppVariantConfig() {',
    "async function loadAppVariantConfig() {\n  if (STATIC_JUNIOR_PREVIEW) {\n    return applyAppVariantConfig({variant: 'junior-static-preview', title: '中学生英単語アプリ（試験版）', subtitle: '4モード・静的配信の動作確認'});\n  }",
    'local-only app config',
  );
  js = replaceExactlyOnce(
    js,
    'async function fetchSharedQuestions(mode) {',
    "async function fetchSharedQuestions(mode) {\n  if (STATIC_JUNIOR_PREVIEW) {\n    const response = await fetch('/api/questions/current?mode=' + encodeURIComponent(mode), {cache:'no-store'});\n    if (!response.ok) throw new Error('共有教材の読み込みに失敗しました：HTTP ' + response.status);\n    const data = await response.json();\n    if (!data.ok || !Array.isArray(data.rows)) throw new Error('共有教材の形式が不正です。');\n    return data;\n  }",
    'Cloudflare R2 question API',
  );
  js = replaceExactlyOnce(
    js,
    'function getCurrentQuestionAudioUrl() {',
    "function getCurrentQuestionAudioUrl() {\n  if (STATIC_JUNIOR_PREVIEW) return null;",
    'disable Render MP3 endpoint',
  );
  js = replaceExactlyOnce(
    js,
    'function updateHostingStatus() {',
    "function updateHostingStatus() {\n  if (STATIC_JUNIOR_PREVIEW) {\n    els.hostingStatus.textContent = 'Cloudflare共有教材：公開済み教材を優先／未公開時はデモ教材／履歴はこの端末に保存';\n    els.hostingStatus.className = 'hosting-status hosting-status-ok';\n    return;\n  }",
    'static hosting status',
  );
  js = replaceExactlyOnce(
    js,
    'function serverSaveUnavailableMessage() {',
    "function serverSaveUnavailableMessage() {\n  if (STATIC_JUNIOR_PREVIEW) return '試験版ではサーバーへの保存を行いません。';",
    'static save notice',
  );
  js = replaceExactlyOnce(
    js,
    'async function uploadOfficialWorkbook(file) {',
    "async function uploadOfficialWorkbook(file) {\n  if (STATIC_JUNIOR_PREVIEW) throw new Error('静的試験版はアップロードAPIを使用しません。');",
    'disable workbook upload API',
  );
  js = replaceExactlyOnce(
    js,
    '  state.localModeRows = modeRows;\n  let saveMessage =',
    "  state.localModeRows = modeRows;\n  if (STATIC_JUNIOR_PREVIEW) {\n    state.mode = parsed.activeMode || state.mode;\n    updateModeUi();\n    const summary = getWorkbookSummaryText(modeRows);\n    applyQuestions(modeRows[state.mode] || [], 'この端末のExcelブック', {\n      message: '4シートを一時的に読み込みました：' + summary + '。サーバーには保存しません。ページ更新で消えます。',\n    });\n    return;\n  }\n  let saveMessage =",
    'local-only four-sheet Excel',
  );
  js = replaceExactlyOnce(
    js,
    "message: '単一CSV/単一シートExcelは一時確認用として読み込みました。共通保存は行いません。正式保存は4シート.xlsxを使用してください。'",
    "message: STATIC_JUNIOR_PREVIEW ? 'CSVの問題をこの画面だけに読み込みました。サーバーへ送信せず、ページ更新で消えます。' : '単一CSV/単一シートExcelは一時確認用として読み込みました。共通保存は行いません。正式保存は4シート.xlsxを使用してください。'",
    'one-file import notice',
  );
  js = replaceExactlyOnce(
    js,
    'const hostingMessage = IS_GITHUB_PAGES ?',
    "const hostingMessage = STATIC_JUNIOR_PREVIEW ? 'Cloudflareの共有教材を優先します。未公開なら各3問のデモを表示します。' : IS_GITHUB_PAGES ?",
    'mode-level hosting notice',
  );
  return js;
}

function rewriteHtml(html) {
  html = replaceExactlyOnce(html, '<title>英語学習アプリ</title>',
    '<title>中学生英単語アプリ（静的試験版）</title>\n  <meta name="robots" content="noindex,nofollow">', 'page title and indexing');
  html = replaceExactlyOnce(html, '<h1 id="appTitle">英語学習アプリ</h1>',
    '<h1 id="appTitle">中学生英単語アプリ（試験版）</h1>', 'visible title');
  html = replaceExactlyOnce(html, '<header class="hero">',
    '<header class="hero">\n      <p class="static-preview-notice">試験公開｜共有教材が未公開の場合、各モード3問の内蔵デモを表示します。実際の塾生データは含みません。</p>',
    'preview banner');
  html = replacePatternOnce(html, /<p id="uploadStatus" class="upload-status">.*<\/p>/m,
    '<p id="uploadStatus" class="upload-status">この画面で選んだCSV・Excelは一時確認用です。サーバーに保存されず、ほかの端末にも共有されません。教材の共通更新は管理者用のアップロード画面から行います。</p>',
    'upload disclosure');
  html = replacePatternOnce(html, /<link rel="stylesheet" href="\.\/style\.css[^"]*">/m,
    '<link rel="stylesheet" href="./style.css">', 'stylesheet URL');
  html = replacePatternOnce(html, /<script src="\.\/script\.js[^"]*"><\/script>/m,
    '<script src="./script.js"></script>', 'script URL');
  return html;
}

function build() {
  if (!fs.existsSync(path.join(SOURCE, 'index.html'))) {
    throw new Error('Cannot locate study-app sources.');
  }
  fs.rmSync(OUTPUT, { recursive: true, force: true });
  fs.mkdirSync(path.join(OUTPUT, 'data'), { recursive: true });

  const html = rewriteHtml(fs.readFileSync(path.join(SOURCE, 'index.html'), 'utf8'));
  const js = rewriteJavaScript(fs.readFileSync(path.join(SOURCE, 'script.js'), 'utf8'));
  const css = fs.readFileSync(path.join(SOURCE, 'style.css'), 'utf8')
    + '\n.static-preview-notice { color: #fff; background: #573e10; padding: 8px 12px; border-radius: 9px; font-weight: 700; }\n';

  fs.writeFileSync(path.join(OUTPUT, 'index.html'), html);
  fs.writeFileSync(path.join(OUTPUT, 'script.js'), js);
  fs.writeFileSync(path.join(OUTPUT, 'style.css'), css);
  fs.writeFileSync(path.join(OUTPUT, '_headers'), '/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n  X-Frame-Options: DENY\n');
  fs.writeFileSync(path.join(OUTPUT, 'robots.txt'), 'User-agent: *\nDisallow: /\n');

  // Pages Functions are located in repository /functions and not copied to dist-junior.
  // Only /api/* requests are routed to Functions; all static assets stay free to serve.
  fs.writeFileSync(path.join(OUTPUT, '_routes.json'), JSON.stringify({
    version: 1, include: ['/api/*'], exclude: [],
  }, null, 2) + '\n');
  const adminSrc = path.join(ROOT, 'admin', 'junior-data');
  const adminOut = path.join(OUTPUT, 'admin', 'junior-data');
  fs.mkdirSync(adminOut, { recursive: true });
  for (const name of ['index.html', 'style.css', 'script.js', 'parser.mjs']) {
    fs.copyFileSync(path.join(adminSrc, name), path.join(adminOut, name));
  }

  for (const filename of DEMO_FILES) {
    let content = fs.readFileSync(path.join(SOURCE, 'data', filename), 'utf8');
    if (filename === 'definition_mode.csv') {
      // The original third sample sentence contains an unquoted CSV comma.
      content = replaceExactlyOnce(content,
        'If it rains tomorrow, we will stay home.',
        '"If it rains tomorrow, we will stay home."',
        'third demo sentence CSV quoting');
    }
    fs.writeFileSync(path.join(OUTPUT, 'data', filename), content);
  }
  process.stdout.write('Created static junior preview in dist-junior (four demo CSV files, no Render data).\n');
}

if (require.main === module) build();
module.exports = { build, rewriteHtml, rewriteJavaScript };
