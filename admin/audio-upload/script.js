const fileInput = document.getElementById('audioFile');
const tokenInput = document.getElementById('uploadToken');
const uploadButton = document.getElementById('uploadButton');
const result = document.getElementById('result');

function showResult(value) {
  result.textContent = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
}

uploadButton.addEventListener('click', async () => {
  const file = fileInput.files?.[0];
  const token = tokenInput.value.trim();
  if (!file) {
    showResult('MP3ファイルを選択してください。');
    return;
  }
  if (!token) {
    showResult('アップロードトークンを入力してください。');
    return;
  }

  const formData = new FormData();
  formData.append('file', file, file.name);
  uploadButton.disabled = true;
  showResult('アップロード中...');
  try {
    const response = await fetch('/api/audio/upload', {
      method: 'POST',
      headers: { 'X-Audio-Upload-Token': token },
      body: formData,
    });
    const data = await response.json().catch(() => ({ ok: false, error: 'JSONレスポンスを解析できませんでした。' }));
    showResult(data);
  } catch (error) {
    showResult(`アップロードに失敗しました: ${error.message}`);
  } finally {
    uploadButton.disabled = false;
  }
});
