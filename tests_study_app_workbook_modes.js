const assert = require('assert');
const fs = require('fs');

const source = fs.readFileSync('study-app/script.js', 'utf8');

for (const name of ['★英単語', '★チャンク', '★文節和訳', '★英文和訳']) {
  assert.ok(source.includes(`'${name}'`), `正式アップロードのシート名 ${name} を定義する`);
}

assert.ok(source.includes('OFFICIAL_WORKBOOK_SHEETS'), '正式アップロード用の完全一致シート名を持つ');
assert.ok(source.includes('officialOnly'), '正式アップロードでは別名ではなく公式シート名だけを使う');
assert.ok(source.includes('parseWorkbookModeRows(await file.arrayBuffer(), uploadMode, { officialOnly: true })'), 'study-appの正式アップロードは公式4シートExcelとして解析する');
assert.ok(source.includes('正式アップロードは .xlsx の4シートExcelのみ対応です'), '公式4シート以外のエラーを表示する');
assert.ok(source.includes('fetch(`${API_BASE}/api/questions/upload-workbook`'), '4シートExcelは一括アップロードAPIへ送信する');
assert.ok(source.includes('単一CSV/単一シートExcelは一時確認用として読み込みました。共通保存は行いません。'), '単一CSV/単一シートExcelは共通保存しない');
assert.ok(source.includes('state.localModeRows[mode]'), 'モード切替時にアップロード済みExcelブック由来データを参照する');
assert.ok(!source.includes('detectModeFromFilename'), 'ファイル名だけでモード判定しない');

console.log('tests_study_app_workbook_modes: OK');
