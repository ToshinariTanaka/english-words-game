const assert = require('assert');
const fs = require('fs');

const source = fs.readFileSync('study-app/script.js', 'utf8');

assert.ok(source.includes("'★英単語テスト_001_生成': 'word'"), '英単語シートをwordへ対応付ける');
assert.ok(source.includes("'★チャンク_001_生成': 'chunk'"), 'チャンクシートをchunkへ対応付ける');
assert.ok(source.includes("'★英文和訳_001_生成': 'definition'"), '英文和訳シートをdefinitionへ対応付ける');
assert.ok(source.includes('parseWorkbookModeRows'), '複数シートExcelの解析関数がある');
assert.ok(source.includes('handleMultiModeWorkbookUpload'), '複数モード保存処理がある');
assert.ok(source.includes('state.localModeRows[mode]'), 'モード切替時にアップロード済みExcelブック由来データを参照する');
assert.ok(source.includes('Excelブックから読み込みました：${getWorkbookSummaryText'), '3モード件数の表示がある');

console.log('tests_study_app_workbook_modes: OK');
