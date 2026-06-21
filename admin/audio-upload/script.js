const fileInput = document.getElementById('audioFile');
const zipFileInput = document.getElementById('zipFile');
const tokenInput = document.getElementById('uploadToken');
const uploadButton = document.getElementById('uploadButton');
const zipUploadButton = document.getElementById('zipUploadButton');
const workbookFileInput = document.getElementById('workbookFile');
const generateModeInput = document.getElementById('generateMode');
const startKeyInput = document.getElementById('startKey');
const endKeyInput = document.getElementById('endKey');
const generateLimitInput = document.getElementById('generateLimit');
const overwriteAudioInput = document.getElementById('overwriteAudio');
const ttsVoiceInput = document.getElementById('ttsVoice');
const checkStatusButton = document.getElementById('checkStatusButton');
const fillNextRangeButton = document.getElementById('fillNextRangeButton');
let lastGenerationStatus = null;
const generateButton = document.getElementById('generateButton');
const result = document.getElementById('result');

function showResult(value) {
  result.textContent = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
}

async function uploadFile({ file, endpoint, button, emptyMessage }) {
  const token = tokenInput.value.trim();
  if (!file) {
    showResult(emptyMessage);
    return;
  }
  if (!token) {
    showResult('アップロードトークンを入力してください。');
    return;
  }

  const formData = new FormData();
  formData.append('file', file, file.name);
  button.disabled = true;
  showResult('アップロード中...');
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'X-Audio-Upload-Token': token },
      body: formData,
    });
    const data = await response.json().catch(() => ({ ok: false, error: 'JSONレスポンスを解析できませんでした。' }));
    showResult(data);
  } catch (error) {
    showResult(`アップロードに失敗しました: ${error.message}`);
  } finally {
    button.disabled = false;
  }
}

uploadButton.addEventListener('click', () => uploadFile({
  file: fileInput.files?.[0],
  endpoint: '/api/audio/upload',
  button: uploadButton,
  emptyMessage: 'MP3ファイルを選択してください。',
}));

zipUploadButton.addEventListener('click', () => uploadFile({
  file: zipFileInput.files?.[0],
  endpoint: '/api/audio/upload-zip',
  button: zipUploadButton,
  emptyMessage: 'ZIPファイルを選択してください。',
}));


generateButton.addEventListener('click', async () => {
  const token = tokenInput.value.trim();
  const file = workbookFileInput.files?.[0];
  if (!file) return showResult('Excelファイルを選択してください。');
  if (!token) return showResult('アップロードトークンを入力してください。');

  const formData = new FormData();
  formData.append('file', file, file.name);
  formData.append('mode', generateModeInput.value);
  formData.append('startKey', startKeyInput.value.trim());
  formData.append('endKey', endKeyInput.value.trim());
  formData.append('limit', generateLimitInput.value || '10');
  formData.append('overwrite', overwriteAudioInput.checked ? 'true' : 'false');
  formData.append('voice', ttsVoiceInput.value || 'marin');

  generateButton.disabled = true;
  showResult('MP3生成中...（最大10件）');
  try {
    const response = await fetch('/api/audio/generate-from-workbook', {
      method: 'POST',
      headers: { 'X-Audio-Upload-Token': token },
      body: formData,
    });
    const data = await response.json().catch(() => ({ ok: false, error: 'JSONレスポンスを解析できませんでした。' }));
    showResult(data);
  } catch (error) {
    showResult(`MP3生成に失敗しました: ${error.message}`);
  } finally {
    generateButton.disabled = false;
  }
});

async function checkGenerationStatus() {
  const token = tokenInput.value.trim();
  const file = workbookFileInput.files?.[0];
  if (!file) return showResult('Excelファイルを選択してください。');
  if (!token) return showResult('アップロードトークンを入力してください。');

  const formData = new FormData();
  formData.append('file', file, file.name);
  formData.append('mode', generateModeInput.value);
  formData.append('startKey', startKeyInput.value.trim());
  formData.append('endKey', endKeyInput.value.trim());

  checkStatusButton.disabled = true;
  showResult('MP3作成状況を確認中...');
  try {
    const response = await fetch('/api/audio/generation-status', {
      method: 'POST',
      headers: { 'X-Audio-Upload-Token': token },
      body: formData,
    });
    const data = await response.json().catch(() => ({ ok: false, error: 'JSONレスポンスを解析できませんでした。' }));
    lastGenerationStatus = data.ok ? data : null;
    showResult(data);
  } catch (error) {
    showResult(`MP3作成状況確認に失敗しました: ${error.message}`);
  } finally {
    checkStatusButton.disabled = false;
  }
}

checkStatusButton.addEventListener('click', checkGenerationStatus);
fillNextRangeButton.addEventListener('click', async () => {
  if (!lastGenerationStatus) await checkGenerationStatus();
  if (!lastGenerationStatus?.nextStartKey || !lastGenerationStatus?.nextEndKey) return showResult('次に作成すべき未作成MP3はありません。');
  startKeyInput.value = lastGenerationStatus.nextStartKey;
  endKeyInput.value = lastGenerationStatus.nextEndKey;
  generateLimitInput.value = '10';
  showResult({ message: '次の10件を入力しました。', nextStartKey: lastGenerationStatus.nextStartKey, nextEndKey: lastGenerationStatus.nextEndKey, nextMissingKeys: lastGenerationStatus.nextMissingKeys });
});
