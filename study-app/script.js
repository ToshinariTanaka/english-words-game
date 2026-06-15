const MODES = {
  word: {
    label: '英単語モード',
    file: './data/word_mode.csv',
    description: '英単語を見て、日本語の意味を選びます。',
  },
  chunk: {
    label: 'チャンクモード',
    file: './data/chunk_mode.csv',
    description: '英語のかたまり表現を見て、自然な意味を選びます。',
  },
  definition: {
    label: '英英辞典モード',
    file: './data/definition_mode.csv',
    description: '英語の定義文を読んで、当てはまる英単語を選びます。',
  },
};

const UPLOAD_DB_NAME = 'english-study-app';
const UPLOAD_DB_VERSION = 1;
const UPLOAD_STORE_NAME = 'uploaded-files';

const state = {
  mode: 'word',
  questions: [],
  index: 0,
  answered: 0,
  correct: 0,
  mistakes: [],
  reviewMode: false,
  selected: false,
  sourceLabel: '',
  loadToken: 0,
};

const els = {
  modeButtons: document.querySelectorAll('.mode-button'),
  modeDescription: document.getElementById('modeDescription'),
  correctCount: document.getElementById('correctCount'),
  answeredCount: document.getElementById('answeredCount'),
  accuracyRate: document.getElementById('accuracyRate'),
  modeLabel: document.getElementById('modeLabel'),
  progressLabel: document.getElementById('progressLabel'),
  questionText: document.getElementById('questionText'),
  choices: document.getElementById('choices'),
  feedback: document.getElementById('feedback'),
  nextButton: document.getElementById('nextButton'),
  reviewSummary: document.getElementById('reviewSummary'),
  reviewButton: document.getElementById('reviewButton'),
  fileInput: document.getElementById('fileInput'),
  uploadStatus: document.getElementById('uploadStatus'),
};

function openUploadDatabase() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('このブラウザではアップロードファイルを保存できません。'));
      return;
    }

    const request = indexedDB.open(UPLOAD_DB_NAME, UPLOAD_DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(UPLOAD_STORE_NAME)) {
        database.createObjectStore(UPLOAD_STORE_NAME, { keyPath: 'mode' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('保存領域を開けませんでした。'));
  });
}

async function getSavedUpload(mode) {
  const database = await openUploadDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(UPLOAD_STORE_NAME, 'readonly');
    const request = transaction.objectStore(UPLOAD_STORE_NAME).get(mode);

    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error || new Error('保存済みファイルを読み込めませんでした。'));
    transaction.oncomplete = () => database.close();
    transaction.onerror = () => {
      database.close();
      reject(transaction.error || new Error('保存済みファイルを読み込めませんでした。'));
    };
  });
}

async function saveUpload(mode, rows, fileName) {
  const database = await openUploadDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(UPLOAD_STORE_NAME, 'readwrite');
    transaction.objectStore(UPLOAD_STORE_NAME).put({
      mode,
      rows,
      fileName,
      savedAt: new Date().toISOString(),
    });

    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error || new Error('アップロードファイルを保存できませんでした。'));
    };
    transaction.onabort = () => {
      database.close();
      reject(transaction.error || new Error('アップロードファイルの保存が中断されました。'));
    };
  });
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (quoted && char === '"' && next === '"') {
      cell += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (!quoted && char === ',') {
      row.push(cell);
      cell = '';
    } else if (!quoted && (char === '\n' || char === '\r')) {
      if (char === '\r' && next === '\n') i += 1;
      row.push(cell);
      if (row.some((value) => value.trim() !== '')) rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }
  row.push(cell);
  if (row.some((value) => value.trim() !== '')) rows.push(row);

  const [headers, ...records] = rows;
  return records.map((record) => Object.fromEntries(headers.map((header, index) => [header.trim(), (record[index] || '').trim()])));
}

function shuffle(items) {
  return [...items].sort(() => Math.random() - 0.5);
}

function stripBom(value) {
  return value.replace(/^\uFEFF/, '');
}

function assertRequiredHeaders(rows) {
  const required = ['row_number', 'level', 'question', 'correct', 'choice1', 'choice2', 'choice3', 'total_correct', 'total_wrong', 'accuracy', 'current_streak', 'note'];
  const headers = rows[0] ? Object.keys(rows[0]).map(stripBom) : [];
  const missing = required.filter((header) => !headers.includes(header));
  if (missing.length > 0) {
    throw new Error(`必須列が不足しています: ${missing.join(', ')}`);
  }
}

function parseWorkbookRows(arrayBuffer) {
  if (!window.XLSX) {
    throw new Error('Excel読み込みライブラリの読み込みに失敗しました。ネットワーク接続またはCDN設定を確認してください。');
  }
  const workbook = window.XLSX.read(arrayBuffer, { type: 'array' });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) throw new Error('Excelファイルにシートがありません。');
  return window.XLSX.utils.sheet_to_json(workbook.Sheets[firstSheetName], { defval: '', raw: false });
}

function normalizeQuestions(rows) {
  assertRequiredHeaders(rows);
  return rows.map((row) => {
    const normalizedRow = Object.fromEntries(Object.entries(row).map(([key, value]) => [stripBom(key).trim(), String(value || '').trim()]));
    const choices = [normalizedRow.correct, normalizedRow.choice1, normalizedRow.choice2, normalizedRow.choice3].filter(Boolean);
    return {
      id: normalizedRow.row_number,
      level: normalizedRow.level,
      question: normalizedRow.question,
      correct: normalizedRow.correct,
      choices: shuffle(choices),
      totalCorrect: normalizedRow.total_correct || '0',
      totalWrong: normalizedRow.total_wrong || '0',
      csvAccuracy: normalizedRow.accuracy || '0%',
      currentStreak: normalizedRow.current_streak || '0',
      note: normalizedRow.note || '',
    };
  }).filter((item) => item.id && item.question && item.correct && item.choices.length === 4);
}

function resetSession(mode) {
  state.mode = mode;
  state.reviewMode = false;
  state.index = 0;
  state.answered = 0;
  state.correct = 0;
  state.mistakes = [];
  state.selected = false;
}

function applyQuestions(rows, sourceLabel) {
  state.questions = normalizeQuestions(rows);
  if (state.questions.length === 0) {
    throw new Error('有効な4択問題がありません。問題文・正解・3つの誤答を確認してください。');
  }
  state.sourceLabel = sourceLabel;
  els.uploadStatus.textContent = `${sourceLabel} から ${state.questions.length}問を読み込みました。`;
  showQuestion();
}

async function loadMode(mode) {
  const loadToken = state.loadToken + 1;
  state.loadToken = loadToken;
  resetSession(mode);
  els.questionText.textContent = '問題を読み込み中...';
  els.choices.innerHTML = '';
  els.feedback.hidden = true;
  els.nextButton.disabled = true;
  updateModeUi();
  updateStats();

  try {
    const savedUpload = await getSavedUpload(mode);
    if (loadToken !== state.loadToken || state.mode !== mode) return;
    if (savedUpload && Array.isArray(savedUpload.rows) && savedUpload.rows.length > 0) {
      applyQuestions(savedUpload.rows, `${savedUpload.fileName}（保存済みアップロード）`);
      return;
    }
  } catch (error) {
    console.warn('保存済みアップロードの読み込みに失敗しました。', error);
  }

  try {
    const response = await fetch(MODES[mode].file);
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    const rows = parseCsv(await response.text());
    if (loadToken !== state.loadToken || state.mode !== mode) return;
    applyQuestions(rows, `${MODES[mode].label}の標準CSV`);
  } catch (error) {
    if (loadToken !== state.loadToken || state.mode !== mode) return;
    els.questionText.textContent = 'CSVの読み込みに失敗しました。GitHub PagesなどのWebサーバー上で開いてください。';
    els.feedback.textContent = error.message;
    els.feedback.className = 'feedback wrong';
    els.feedback.hidden = false;
    els.uploadStatus.textContent = '標準CSVの読み込みに失敗しました。';
  }
}

async function handleUpload(event) {
  const [file] = event.target.files;
  if (!file) return;
  const uploadMode = state.mode;
  state.loadToken += 1;
  els.questionText.textContent = 'ファイルを読み込み中...';
  els.choices.innerHTML = '';
  els.feedback.hidden = true;
  els.nextButton.disabled = true;

  try {
    const extension = file.name.split('.').pop().toLowerCase();
    const rows = extension === 'xlsx'
      ? parseWorkbookRows(await file.arrayBuffer())
      : parseCsv(await file.text());

    const validQuestions = normalizeQuestions(rows);
    if (validQuestions.length === 0) {
      throw new Error('有効な4択問題がありません。問題文・正解・3つの誤答を確認してください。');
    }

    await saveUpload(uploadMode, rows, file.name);
    resetSession(uploadMode);
    updateModeUi();
    updateStats();
    applyQuestions(rows, `${file.name}（アップロード・保存済み）`);
  } catch (error) {
    els.questionText.textContent = 'アップロードファイルの読み込みまたは保存に失敗しました。';
    els.feedback.textContent = error.message;
    els.feedback.className = 'feedback wrong';
    els.feedback.hidden = false;
    els.uploadStatus.textContent = 'アップロードに失敗しました。以前の保存済みファイルは保持されています。';
  } finally {
    event.target.value = '';
  }
}

function updateModeUi() {
  els.modeButtons.forEach((button) => button.classList.toggle('active', button.dataset.mode === state.mode));
  els.modeDescription.textContent = `${MODES[state.mode].description} 標準CSVまたは手元のCSV/Excelを読み込めます。`;
  els.modeLabel.textContent = state.reviewMode ? `${MODES[state.mode].label}（復習）` : MODES[state.mode].label;
}

function updateStats() {
  els.correctCount.textContent = String(state.correct);
  els.answeredCount.textContent = String(state.answered);
  els.accuracyRate.textContent = state.answered === 0 ? '0%' : `${Math.round((state.correct / state.answered) * 100)}%`;
  els.reviewSummary.textContent = state.mistakes.length === 0 ? 'まだ間違えた問題はありません。' : `${state.mistakes.length}問を復習できます。`;
  els.reviewButton.disabled = state.mistakes.length === 0;
}

function showQuestion() {
  state.selected = false;
  els.feedback.hidden = true;
  els.nextButton.disabled = true;
  const current = state.questions[state.index];
  els.progressLabel.textContent = state.questions.length === 0 ? '0 / 0' : `${state.index + 1} / ${state.questions.length}`;
  if (!current) {
    els.questionText.textContent = 'このモードの問題はありません。';
    els.choices.innerHTML = '';
    return;
  }
  els.questionText.textContent = current.question;
  els.feedback.className = 'feedback';
  els.feedback.textContent = `問題ID: ${current.id} / レベル: ${current.level || '未設定'} / CSV成績: 正解 ${current.totalCorrect}・不正解 ${current.totalWrong}・正答率 ${current.csvAccuracy}・連続正解 ${current.currentStreak}`;
  els.feedback.hidden = false;
  els.choices.innerHTML = '';
  current.choices.forEach((choice) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'choice-button';
    button.textContent = choice;
    button.addEventListener('click', () => answer(choice, button));
    els.choices.appendChild(button);
  });
  updateModeUi();
}

function answer(choice) {
  if (state.selected) return;
  state.selected = true;
  const current = state.questions[state.index];
  const isCorrect = choice === current.correct;
  state.answered += 1;
  if (isCorrect) {
    state.correct += 1;
  } else if (!state.reviewMode) {
    state.mistakes.push(current);
  }
  document.querySelectorAll('.choice-button').forEach((button) => {
    button.disabled = true;
    if (button.textContent === current.correct) button.classList.add('correct');
    if (button.textContent === choice && !isCorrect) button.classList.add('wrong');
  });
  els.feedback.className = `feedback ${isCorrect ? 'correct' : 'wrong'}`;
  els.feedback.textContent = `${isCorrect ? '正解です。' : `不正解です。正解は「${current.correct}」です。`} ${current.note}`;
  els.feedback.hidden = false;
  els.nextButton.disabled = false;
  updateStats();
}

function nextQuestion() {
  if (state.questions.length === 0) return;
  state.index = (state.index + 1) % state.questions.length;
  showQuestion();
}

function startReview() {
  if (state.mistakes.length === 0) return;
  state.questions = shuffle(state.mistakes);
  state.mistakes = [];
  state.index = 0;
  state.reviewMode = true;
  showQuestion();
  updateStats();
}

els.modeButtons.forEach((button) => button.addEventListener('click', () => loadMode(button.dataset.mode)));
els.nextButton.addEventListener('click', nextQuestion);
els.reviewButton.addEventListener('click', startReview);
els.fileInput.addEventListener('change', handleUpload);

loadMode(state.mode);
