import { prepareWorkbook, MODES } from './parser.mjs';

const $ = (id) => document.getElementById(id);
let payload = null;
let checkedFile = null;
let checkedFilter = null;
let busy = false;

function setText(id, text) {
  $(id).textContent = text;
}

function updatePublishButton() {
  $('publish').disabled = busy || !payload || !$('confirm').checked || !$('token').value;
}

function invalidate() {
  payload = null;
  checkedFile = null;
  checkedFilter = null;
  $('confirm').checked = false;
  $('summary').hidden = true;
  setText('result', 'Excelが変更されたため、再検査してください。');
  updatePublishButton();
}

$('workbook').addEventListener('change', invalidate);
$('filter').addEventListener('change', invalidate);
$('confirm').addEventListener('change', updatePublishButton);
$('token').addEventListener('input', updatePublishButton);

$('check').addEventListener('click', async () => {
  const file = $('workbook').files?.[0];
  if (!file) { setText('result', 'Excelファイルを選択してください。'); return; }
  if (!/\.xlsx$/i.test(file.name)) { setText('result', '.xlsx形式のExcelを選択してください。'); return; }
  if (file.size > 15 * 1024 * 1024) { setText('result', 'Excelファイルが大きすぎます（15MB以内）。'); return; }
  if (!window.XLSX) { setText('result', 'Excel読み込みライブラリが利用できません。ネットワークを確認してください。'); return; }
  busy = true;
  updatePublishButton();
  setText('result', '検査中です。しばらくお待ちください…');
  try {
    const workbook = window.XLSX.read(await file.arrayBuffer(), { type: 'array' });
    const filter = $('filter').value;
    const converted = prepareWorkbook(workbook, filter,
      (sheet) => window.XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false }));
    const data = { version: 1, filename: file.name, filter, modes: converted.modes };
    if (new TextEncoder().encode(JSON.stringify(data)).length > 12 * 1024 * 1024) {
      throw new Error('変換後のデータが12MBを超えています。対象問題を絞ってください。');
    }
    payload = data;
    checkedFile = file;
    checkedFilter = filter;
    $('counts').replaceChildren();
    for (const [mode, spec] of Object.entries(MODES)) {
      const tr = document.createElement('tr');
      const label = document.createElement('td');
      const count = document.createElement('td');
      label.textContent = spec.sheet;
      count.textContent = converted.counts[mode].toLocaleString('ja-JP') + '問';
      tr.append(label, count);
      $('counts').appendChild(tr);
    }
    const warning = filter === 'all'
      ? '警告：上級レベルを含む全問題を一般公開します。システムテスト以外で使わないでください。'
      : '各モードをまとめて公開します。現在の公開教材は新しい版に切り替わります。';
    setText('releaseWarning', warning);
    setText('result', '検査完了：' + converted.total.toLocaleString('ja-JP') + '問。確認してから公開してください。');
    $('summary').hidden = false;
  } catch (error) {
    payload = null;
    $('summary').hidden = true;
    setText('result', '検査エラー：' + error.message);
  } finally {
    busy = false;
    updatePublishButton();
  }
});

$('publish').addEventListener('click', async () => {
  if (!payload || busy || !checkedFile || $('workbook').files?.[0] !== checkedFile
      || $('filter').value !== checkedFilter || !$('confirm').checked) return;
  const token = $('token').value.trim();
  if (token.length < 32) {
    setText('uploadResult', '管理者トークンを入力してください。');
    return;
  }
  if (!window.confirm('検査済みExcelを共有教材として公開しますか？公開中の問題が切り替わります。')) return;
  busy = true;
  updatePublishButton();
  setText('uploadResult', '公開処理中です。画面を閉じずにお待ちください…');
  try {
    const response = await fetch('/api/admin/questions/publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify(payload),
      cache: 'no-store',
      credentials: 'same-origin',
    });
    const result = await response.json();
    if (!response.ok || !result.ok) throw new Error(result.error || 'HTTP ' + response.status);
    setText('uploadResult', '公開しました：合計' + result.total.toLocaleString('ja-JP')
      + '問／公開日時 ' + new Date(result.updatedAt).toLocaleString('ja-JP'));
    $('token').value = '';
    $('confirm').checked = false;
    updatePublishButton();
    await refreshStatus();
  } catch (error) {
    setText('uploadResult', '公開に失敗しました：' + error.message + '。旧教材の状況を確認してください。');
  } finally {
    busy = false;
    updatePublishButton();
  }
});

async function refreshStatus() {
  try {
    const res = await fetch('/api/questions/status', { cache: 'no-store' });
    const result = await res.json();
    if (!res.ok || !result.ok) throw new Error(result.error || '読み込み失敗');
    if (!result.published) {
      setText('current', '共有教材は未公開です。生徒には内蔵サンプルが表示されます。');
      return;
    }
    const labels = { word:'英単語', chunk:'チャンク', phrase:'文節', definition:'英文' };
    const counts = Object.entries(result.counts || {})
      .map(([key, value]) => (labels[key] || key) + ' ' + value.toLocaleString('ja-JP') + '問')
      .join('／');
    setText('current', '公開済み：' + result.filename + '／' + counts
      + '／更新 ' + new Date(result.updatedAt).toLocaleString('ja-JP'));
  } catch (error) {
    setText('current', '公開状況を取得できません：' + error.message);
  }
}
$('refresh').addEventListener('click', refreshStatus);
refreshStatus();
