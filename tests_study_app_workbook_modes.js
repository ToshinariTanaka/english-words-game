const assert = require('assert');
const fs = require('fs');

const source = fs.readFileSync('study-app/script.js', 'utf8');

for (const name of ['英単語', '英単語テスト', 'word', 'word_mode', '単語']) {
  assert.ok(source.includes(`'${name}'`), `英単語モードのシート名 ${name} を許可する`);
}
for (const name of ['チャンク', 'chunk', 'chunk_mode']) {
  assert.ok(source.includes(`'${name}'`), `チャンクモードのシート名 ${name} を許可する`);
}
for (const name of ['文節和訳', 'phrase', 'phrase_mode']) {
  assert.ok(source.includes(`'${name}'`), `文節和訳モードのシート名 ${name} を許可する`);
}
for (const name of ['英文和訳', '英文', '和訳', 'definition', 'definition_mode']) {
  assert.ok(source.includes(`'${name}'`), `英文和訳モードのシート名 ${name} を許可する`);
}

assert.ok(source.includes('parseWorkbookModeRows(arrayBuffer, selectedMode = state.mode)'), '現在選択中モードを指定してExcelを解析する');
assert.ok(source.includes('findWorkbookSheetNameForMode(workbook, mode)'), 'ファイル名ではなくシート名でモード別シートを探す');
assert.ok(source.includes('if (!modeRows[selectedMode])'), '複数シートExcelで現在モードのシートがない場合に先頭シートへフォールバックしない');
assert.ok(source.includes('対応するシートが見つかりません'), '対応シートがない場合のエラーを表示する');
assert.ok(source.includes('const uploadMode = state.mode'), 'アップロード保存先は現在選択中モードに固定する');
assert.ok(!source.includes('detectModeFromFilename'), 'ファイル名だけでモード判定しない');
assert.ok(source.includes('state.localModeRows[mode]'), 'モード切替時にアップロード済みExcelブック由来データを参照する');
assert.ok(source.includes('for (const mode of Object.keys(modeRows))'), 'モード別rowsを個別にPersistent Diskへ保存する');

console.log('tests_study_app_workbook_modes: OK');
