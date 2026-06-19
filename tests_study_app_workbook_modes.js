const assert = require('assert');
const fs = require('fs');

const source = fs.readFileSync('study-app/script.js', 'utf8');
const html = fs.readFileSync('study-app/index.html', 'utf8');

for (const name of ['★英単語', '★チャンク', '★文節和訳', '★英文和訳']) {
  assert.ok(source.includes(`'${name}'`) || source.includes(`${name}`), `正式シート名 ${name} を使う`);
}
assert.ok(source.includes('REQUIRED_WORKBOOK_SHEETS'), '正式4シート完全一致チェックを持つ');
assert.ok(source.includes("extension !== 'xlsx'"), '.xlsx以外を拒否する');
assert.ok(source.includes('/api/questions/upload-workbook'), '新APIへ一括送信する');
assert.ok(source.includes('schema_version: 2'), 'schema_version: 2を送る');
assert.ok(source.includes('isCompleteUploadRow'), 'C〜G列とM列の完成行チェックを持つ');
assert.ok(source.includes('state.mode = currentMode'), 'アップロード成功後に現在選択中モードを維持する');
assert.ok(source.includes('保存済みの共通問題データは旧形式のため使用できません'), '旧保存データ警告を表示する');
assert.ok(source.includes('questionKey'), 'question_keyを履歴キーに使う処理を維持する');
assert.ok(html.includes('4シートExcelをアップロード'), 'ラベルを4シートExcelにする');
assert.ok(html.includes('accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"'), 'file acceptを.xlsxのみにする');
assert.ok(!html.includes('CSV/Excelをアップロード'), 'CSVアップロード表記を消す');

console.log('tests_study_app_workbook_modes: OK');
