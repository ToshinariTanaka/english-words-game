const fs = require('fs');
const assert = require('assert');

const script = fs.readFileSync('script.js', 'utf8');
const index = fs.readFileSync('index.html', 'utf8');

assert.ok(script.includes('const QUESTIONS_API_CURRENT = "/api/questions/current";'), 'RPG should keep GET /api/questions/current configuration');
assert.ok(script.includes('fetch(QUESTIONS_API_CURRENT, { cache: "no-store" })'), 'RPG should keep shared question loading on startup');
assert.ok(!script.includes('POST /api/questions/upload'), 'RPG script should not mention legacy upload API');
assert.ok(!script.includes('POST /api/study-app/upload'), 'RPG script should not mention legacy study-app upload API');
assert.ok(!script.includes('QUESTIONS_API_UPLOAD'), 'RPG script should not keep legacy upload API constants');
assert.ok(!script.includes('fetch("/api/questions/upload"'), 'RPG script should not fetch legacy questions upload API');
assert.ok(!script.includes("fetch('/api/questions/upload'"), 'RPG script should not fetch legacy questions upload API');
assert.ok(!script.includes('fetch("/api/study-app/upload"'), 'RPG script should not fetch legacy study-app upload API');
assert.ok(!script.includes("fetch('/api/study-app/upload'"), 'RPG script should not fetch legacy study-app upload API');
assert.ok(script.includes('一時確認用として読み込みました'), 'RPG upload success should say the file was loaded for temporary checking');
assert.ok(script.includes('共通保存は行っていません'), 'RPG upload success should say shared saving is not performed');
assert.ok(script.includes('学習アプリから4シートExcelをアップロードしてください'), 'RPG upload success should guide users to study-app workbook upload');
assert.ok(index.includes('CSV/Excelを一時確認用に読み込む'), 'RPG upload label should describe temporary checking');
assert.ok(index.includes('href="/study-app/"'), 'RPG should include a /study-app/ management link');
assert.ok(index.includes('問題データを管理する'), 'RPG should include study-app management link text');

console.log('tests_rpg_upload_guidance: OK');
