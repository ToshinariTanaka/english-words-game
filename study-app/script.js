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

const state = {
  mode: 'word',
  questions: [],
  index: 0,
  answered: 0,
  correct: 0,
  mistakes: [],
  reviewMode: false,
  selected: false,
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
};

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

function normalizeQuestions(rows) {
  return rows.map((row) => {
    const choices = [row.correct, row.choice1, row.choice2, row.choice3].filter(Boolean);
    return {
      id: row.row_number,
      question: row.question,
      correct: row.correct,
      choices: shuffle(choices),
      totalCorrect: row.total_correct || '0',
      totalWrong: row.total_wrong || '0',
      csvAccuracy: row.accuracy || '0%',
      currentStreak: row.current_streak || '0',
      note: row.note || '',
    };
  }).filter((item) => item.id && item.question && item.correct && item.choices.length === 4);
}

async function loadMode(mode) {
  state.mode = mode;
  state.reviewMode = false;
  state.index = 0;
  state.answered = 0;
  state.correct = 0;
  state.mistakes = [];
  state.selected = false;
  els.questionText.textContent = 'CSVを読み込み中...';
  els.choices.innerHTML = '';
  els.feedback.hidden = true;
  els.nextButton.disabled = true;
  updateModeUi();
  updateStats();

  try {
    const response = await fetch(MODES[mode].file);
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    state.questions = normalizeQuestions(parseCsv(await response.text()));
    showQuestion();
  } catch (error) {
    els.questionText.textContent = 'CSVの読み込みに失敗しました。GitHub PagesなどのWebサーバー上で開いてください。';
    els.feedback.textContent = error.message;
    els.feedback.className = 'feedback wrong';
    els.feedback.hidden = false;
  }
}

function updateModeUi() {
  els.modeButtons.forEach((button) => button.classList.toggle('active', button.dataset.mode === state.mode));
  els.modeDescription.textContent = MODES[state.mode].description;
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
  els.feedback.textContent = `問題ID: ${current.id} / CSV成績: 正解 ${current.totalCorrect}・不正解 ${current.totalWrong}・正答率 ${current.csvAccuracy}・連続正解 ${current.currentStreak}`;
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

loadMode(state.mode);
