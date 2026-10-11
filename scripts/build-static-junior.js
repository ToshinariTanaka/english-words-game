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
    "async function loadAppVariantConfig() {\n  if (STATIC_JUNIOR_PREVIEW) {\n    await window.UpJuniorStudent?.ready;\n    return applyAppVariantConfig({variant: 'junior-static-preview', title: '中学生英単語アプリ（試験版）', subtitle: '4モード・静的配信の動作確認'});\n  }",
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
    'keep legacy Render endpoint disabled; saved audio uses its own controller',
  );
  js = replaceExactlyOnce(js, 'function getSelectedVoiceValue() {',
    "function getSelectedVoiceValue() {\n  if (STATIC_JUNIOR_PREVIEW) return '';", 'device fallback voice');
  js = replaceExactlyOnce(js, 'function populateVoiceSelect() {',
    'function populateVoiceSelect() {\n  if (STATIC_JUNIOR_PREVIEW) return window.UpJuniorAudio.populate();', 'saved voice options');
  js = replaceExactlyOnce(js, 'function setupVoiceSelect() {',
    'function setupVoiceSelect() {\n  if (STATIC_JUNIOR_PREVIEW) return window.UpJuniorAudio.setup(stopQuestionPlayback);', 'saved voice settings');
  js = replaceExactlyOnce(js, 'function stopQuestionPlayback() {',
    'function stopQuestionPlayback() {\n  if (STATIC_JUNIOR_PREVIEW) window.UpJuniorAudio?.stop();', 'stop saved playback');
  js = replaceExactlyOnce(js, 'async function speakCurrentQuestion(options = {}) {',
    "async function speakCurrentQuestion(options = {}) {\n  if (STATIC_JUNIOR_PREVIEW) return window.UpJuniorAudio.speak({mode:state.mode, question:state.questions[state.index], manual:options.statusPrefix === '手動再生：', fallback:() => speakCurrentQuestionWithWebSpeech('保存音声は未準備のため、端末音声を使用します。', {synchronous:true,exactStatus:true})});",
    'saved playback before iOS legacy branch');
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
  // Student tracking is opt-in during the pilot. Rendering and scoring are
  // unchanged; the answer hook sends only question ID, correctness and bounded time.
  js = replaceExactlyOnce(js,
    '  state.currentQuestion = current || null;',
    '  state.currentQuestion = current || null;\n  if (STATIC_JUNIOR_PREVIEW) { window.UpJuniorStudent?.questionShown(); void window.UpJuniorAudio.showQuestion(state.mode, current); }',
    'question displayed hook');
  js = replaceExactlyOnce(js,
    '  updateLearningStat(current, isCorrect);',
    "  updateLearningStat(current, isCorrect);\n  if (STATIC_JUNIOR_PREVIEW) window.UpJuniorStudent?.recordAnswer({mode:state.mode,questionKey:current.questionKey||current.id,correct:isCorrect});",
    'answer log hook');
  // Local practice statistics also belong to the signed-in student on shared devices.
  // Existing anonymous history remains untouched in its original storage key.
  js = js.replace(/localStorage\.(getItem|setItem|removeItem)\((LEARNING_STATS_STORAGE_KEY|STUDY_COUNTS_STORAGE_KEY)/g,
    (_,method,key) => 'localStorage.'+method+'('+key+" + (window.UpJuniorStudent?.studentId ? ':' + window.UpJuniorStudent.studentId : '')");
  js += "\nwindow.addEventListener('up-junior-student-changed', () => { void loadMode(state.mode); });\n";
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
  html = replacePatternOnce(html, /<select id="voiceSelect">[\s\S]*?<\/select>/,
    '<select id="voiceSelect"><option value="nova" selected>Nova</option><option value="ash">Ash</option><option value="random">ランダム（Nova／Ash）</option></select>', 'saved voice options');
  html = replaceExactlyOnce(html,
    '音声候補は指定した10種類のうち、このブラウザで利用できるものだけを表示します。',
    'AI生成音声を使用します。ランダムは問題ごとに声を選び、聞き直すときは同じ声です。未準備の問題は端末音声を使います。', 'saved voice disclosure');
  html = replaceExactlyOnce(html, '現在の音声：ブラウザ自動選択', '音声：Nova', 'initial saved voice');
  html = replaceExactlyOnce(html,'    </header>', '    </header>\n'+
    '    <section class="junior-student-login" id="juniorStudentPanel" aria-label="学習記録用の生徒ログイン">\n'+
    '      <h2>生徒ログイン（学習履歴の共有・試験中）</h2>\n'+
    '      <p id="juniorStudentStatus" role="status">ログイン状態を確認中です。</p>\n'+
    '      <p id="juniorStudentSyncStatus" role="status" aria-live="polite">未送信記録は端末内に保存し、自動再送します。</p>\n'+
    '      <div id="juniorStudentLoginFields">\n'+
    '        <label>生徒ID <input id="juniorStudentId" autocomplete="username" maxlength="24"></label>\n'+
    '        <label>パスワード <input id="juniorStudentPassword" type="password" autocomplete="current-password"></label>\n'+
    '        <button id="juniorStudentLogin" type="button">ログイン</button>\n'+
    '      </div>\n'+
    '      <div id="juniorStudentChangeFields" hidden>\n'+
    '        <p>初回は仮パスワードを変更してください。</p>\n'+
    '        <label>現在のパスワード <input id="juniorStudentCurrentPassword" type="password" autocomplete="current-password"></label>\n'+
    '        <label>新しいパスワード（12文字以上） <input id="juniorStudentNewPassword" type="password" autocomplete="new-password"></label>\n'+
    '        <button id="juniorStudentChange" type="button">パスワードを変更する</button>\n'+
    '      </div>\n'+
    '      <button id="juniorStudentLogout" type="button" hidden>ログアウト</button>\n'+
    '      <button id="juniorStudentRetry" type="button">学習記録の再送信</button>\n'+
    '      <p class="student-login-hint">未ログインでも演習できますが、塾長に学習記録は共有されません。学習時間は解答間隔から求める推定値です。</p>\n'+
    '    </section>', 'student login section');
  html = replaceExactlyOnce(html,
    '  <script src="./script.js"></script>',
    '  <script src="./junior-student-queue.js"></script>\n  <script src="./junior-student-sync.js"></script>\n  <script src="./junior-saved-audio.js"></script>\n  <script src="./script.js"></script>',
    'student session UI script');
  return html;
}

function build() {
  fs.writeFileSync(path.join(ROOT, 'cloudflare', 'junior-site-role.js'), "export const SITE_ROLE = 'student';\n");
  if (!fs.existsSync(path.join(SOURCE, 'index.html'))) {
    throw new Error('Cannot locate study-app sources.');
  }
  fs.rmSync(OUTPUT, { recursive: true, force: true });
  fs.mkdirSync(path.join(OUTPUT, 'data'), { recursive: true });

  const html = rewriteHtml(fs.readFileSync(path.join(SOURCE, 'index.html'), 'utf8'));
  const js = rewriteJavaScript(fs.readFileSync(path.join(SOURCE, 'script.js'), 'utf8'));
  const css = fs.readFileSync(path.join(SOURCE, 'style.css'), 'utf8')
    + '\n.static-preview-notice { color: #fff; background: #573e10; padding: 8px 12px; border-radius: 9px; font-weight: 700; }\n'
    + '.junior-student-login {background:#203458;color:#fff;border:1px solid #4c6ea4;border-radius:14px;padding:18px;margin:12px 0}\n'
    + '.junior-student-login h2 {font-size:1.2rem;margin:0 0 10px}\n'
    + '.junior-student-login label {display:block;margin:8px 0;font-size:1rem}\n'
    + '.junior-student-login input {display:block;width:100%;box-sizing:border-box;padding:10px;font-size:1rem;border-radius:8px}\n'
    + '.junior-student-login button {margin:6px 6px 6px 0;padding:10px 14px;cursor:pointer;border-radius:9px;background:#2378c9;color:#fff;font-size:1rem}\n'
    + '.junior-student-login [hidden] {display:none !important}\n'
    + '.junior-student-login .student-login-hint {font-size:.85rem;opacity:.9}\n';

  fs.writeFileSync(path.join(OUTPUT, 'index.html'), html);
  fs.writeFileSync(path.join(OUTPUT, 'script.js'), js);
  fs.copyFileSync(path.join(SOURCE, 'junior-student-queue.js'), path.join(OUTPUT, 'junior-student-queue.js'));
  fs.copyFileSync(path.join(SOURCE, 'junior-student-sync.js'), path.join(OUTPUT, 'junior-student-sync.js'));
  fs.copyFileSync(path.join(SOURCE, 'junior-saved-audio.js'), path.join(OUTPUT, 'junior-saved-audio.js'));
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
