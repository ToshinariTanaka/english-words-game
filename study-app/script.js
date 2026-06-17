const MODES = {
  word: {
    label: '英単語モード',
    file: './data/word_mode.csv',
    description: '英単語を見て、日本語の意味を選びます。',
    questionAliases: ['C question', 'question', 'word', '英単語', '単語', '問題'],
    correctAliases: ['D correct', 'correct', 'meaning', '和訳', '意味', '正解'],
  },
  chunk: {
    label: 'チャンクモード',
    file: './data/chunk_mode.csv',
    description: '英語のかたまり表現を見て、自然な意味を選びます。',
    questionAliases: ['C question', 'question', 'chunk', 'チャンク', '問題'],
    correctAliases: ['D correct', 'correct', 'chunk_meaning', 'チャンク和訳', '和訳', '意味', '正解'],
  },
  definition: {
    label: '英文和訳モード',
    file: './data/definition_mode.csv',
    description: '英文を読んで、正しい日本語訳を選びます。',
    questionAliases: ['C question', 'question', '英文', '英語', '問題', 'sentence', 'english', 'definition', '英語定義', '定義'],
    correctAliases: ['D correct', 'correct', '和訳', '日本語訳', '意味', '正解', 'translation', 'japanese', 'definition_meaning'],
  },
};

const API_BASE = typeof window !== 'undefined' ? window.location.origin : '';
const RENDER_STUDY_APP_URL = ''; // 未確認のRender URLは設定しない。確定後に /study-app/ まで含めて設定する。
const HOSTNAME = typeof window !== 'undefined' ? window.location.hostname : '';
const IS_GITHUB_PAGES = HOSTNAME.endsWith('github.io');
const IS_RENDER = HOSTNAME.endsWith('onrender.com') || HOSTNAME === 'localhost' || HOSTNAME === '127.0.0.1';
const SHARED_CACHE_PREFIX = 'englishWordsGame.sharedQuestions.';
const SOUND_ENABLED_STORAGE_KEY = 'englishWordsGame.soundEnabled';
const QUESTION_COUNT_STORAGE_KEY = 'englishWordsGame.studyApp.questionCount';
const VOICE_STORAGE_KEY = 'englishWordsGame.studyApp.voiceURI';
const DEFAULT_QUESTION_COUNT = '10';



const STANDARD_COLUMNS = [
  'row_number', 'level', 'question', 'correct', 'choice1', 'choice2', 'choice3',
  'total_correct', 'total_wrong', 'accuracy', 'current_streak', 'note',
];

function normalizeStandardRow(row) {
  const cells = Array.isArray(row) ? row : STANDARD_COLUMNS.map((column) => row?.[column] ?? '');
  return Object.fromEntries(STANDARD_COLUMNS.map((column, index) => [column, stripBom(cells[index] ?? '').trim()]));
}

function normalizeMatrixRows(matrix) {
  if (!matrix.length) return [];
  return matrix.slice(1).map(normalizeStandardRow);
}

function detectModeFromFilename(filename, fallbackMode) {
  if (/英単語|英単語テスト/.test(filename)) return 'word';
  if (/チャンク/.test(filename)) return 'chunk';
  if (/英文和訳/.test(filename)) return 'definition';
  return fallbackMode;
}

function decodeText(buffer) {
  const bytes = buffer instanceof ArrayBuffer ? buffer : buffer.buffer;
  const utf8 = new TextDecoder('utf-8').decode(bytes);
  if (!utf8.includes('�')) return utf8;
  try {
    return new TextDecoder('shift_jis').decode(bytes);
  } catch (error) {
    return utf8;
  }
}

const COMMON_ALIASES = {
  id: ['A row_number', 'row_number', 'row', 'id', '番号', '行番号'],
  level: ['B level', 'level', 'レベル'],
  choice1: ['E choice1', 'choice1', 'choice_1', 'wrong1', 'incorrect1', '誤答1', '選択肢1'],
  choice2: ['F choice2', 'choice2', 'choice_2', 'wrong2', 'incorrect2', '誤答2', '選択肢2'],
  choice3: ['G choice3', 'choice3', 'choice_3', 'wrong3', 'incorrect3', '誤答3', '選択肢3'],
  totalCorrect: ['H total_correct', 'total_correct', 'totalCorrect', '累計正解回数', '正解数'],
  totalWrong: ['I total_wrong', 'total_wrong', 'totalWrong', '累計不正解回数', '不正解数'],
  accuracy: ['J accuracy', 'accuracy', '正答率', '累計正解率'],
  currentStreak: ['K current_streak', 'current_streak', 'currentStreak', '現在の連勝数', '連続正解'],
  note: ['L note', 'note', '備考', 'メモ'],
};


const state = {
  mode: 'word',
  questionPool: [],
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
  questionCount: document.getElementById('questionCount'),
  randomOrder: document.getElementById('randomOrder'),
  startQuizButton: document.getElementById('startQuizButton'),
  settingsStatus: document.getElementById('settingsStatus'),
  hostingStatus: document.getElementById('hostingStatus'),
  autoSpeak: document.getElementById('autoSpeak'),
  soundEffects: document.getElementById('soundEffects'),
  speakQuestionButton: document.getElementById('speakQuestionButton'),
  voiceSelect: document.getElementById('voiceSelect'),
  voiceStatus: document.getElementById('voiceStatus'),
};

let audioContext = null;
let soundEnabled = loadStoredBoolean(SOUND_ENABLED_STORAGE_KEY, true);
let lastRandomVoiceURI = '';


function loadStoredBoolean(key, defaultValue) {
  try {
    if (typeof localStorage === 'undefined') return defaultValue;
    const stored = localStorage.getItem(key);
    if (stored === 'true') return true;
    if (stored === 'false') return false;
  } catch (error) {
    console.warn('Failed to load boolean setting:', error);
  }
  return defaultValue;
}

function saveStoredBoolean(key, value) {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(key, value ? 'true' : 'false');
  } catch (error) {
    console.warn('Failed to save boolean setting:', error);
  }
}


function loadStoredString(key, defaultValue = '') {
  try {
    if (typeof localStorage === 'undefined') return defaultValue;
    const stored = localStorage.getItem(key);
    return stored === null ? defaultValue : stored;
  } catch (error) {
    console.warn('Failed to load string setting:', error);
    return defaultValue;
  }
}

function saveStoredString(key, value) {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(key, value);
  } catch (error) {
    console.warn('Failed to save string setting:', error);
  }
}

function sanitizeQuestionCountValue(value) {
  const allowedValues = Array.from(els.questionCount?.options || []).map((option) => option.value);
  if (value === 'all') return 'all';
  if (allowedValues.includes(String(value))) return String(value);
  return DEFAULT_QUESTION_COUNT;
}

function setupQuestionCountSetting() {
  if (!els.questionCount) return;
  els.questionCount.value = sanitizeQuestionCountValue(loadStoredString(QUESTION_COUNT_STORAGE_KEY, DEFAULT_QUESTION_COUNT));
  if (els.questionCount.value === 'all') {
    els.questionCount.value = DEFAULT_QUESTION_COUNT;
  }
  els.questionCount.addEventListener('change', () => {
    const value = sanitizeQuestionCountValue(els.questionCount.value);
    els.questionCount.value = value;
    saveStoredString(QUESTION_COUNT_STORAGE_KEY, value);
  });
}

function getAvailableVoices() {
  const synthesis = getSpeechSynthesis();
  return synthesis?.getVoices?.() || [];
}

function getDisplayVoices(voices) {
  const englishVoices = voices.filter((voice) => /^en[-_]/i.test(voice.lang || ''));
  return englishVoices.length > 0 ? englishVoices : voices;
}

function getVoiceOptionValue(voice) {
  return voice.voiceURI || `${voice.name}|${voice.lang}`;
}

function formatVoiceName(voice) {
  return voice ? `${voice.name} / ${voice.lang}` : 'ブラウザ自動選択';
}

function updateVoiceStatus(voice, label = '現在の音声') {
  if (!els.voiceStatus) return;
  els.voiceStatus.textContent = `${label}：${formatVoiceName(voice)}`;
}

function getSelectedVoiceValue() {
  return els.voiceSelect?.value ?? loadStoredString(VOICE_STORAGE_KEY, '');
}

function populateVoiceSelect() {
  if (!els.voiceSelect) return;
  const storedVoice = loadStoredString(VOICE_STORAGE_KEY, '');
  const voices = getDisplayVoices(getAvailableVoices());
  els.voiceSelect.innerHTML = '';
  const autoOption = document.createElement('option');
  autoOption.value = '';
  autoOption.textContent = '自動選択';
  els.voiceSelect.appendChild(autoOption);
  const randomOption = document.createElement('option');
  randomOption.value = 'random';
  randomOption.textContent = 'ランダム';
  els.voiceSelect.appendChild(randomOption);
  voices.forEach((voice) => {
    const option = document.createElement('option');
    option.value = getVoiceOptionValue(voice);
    option.textContent = formatVoiceName(voice);
    els.voiceSelect.appendChild(option);
  });
  const storedVoiceObject = voices.find((voice) => getVoiceOptionValue(voice) === storedVoice) || null;
  const hasStoredVoice = storedVoice === 'random' || Boolean(storedVoiceObject);
  els.voiceSelect.value = hasStoredVoice ? storedVoice : '';
  if (storedVoice && !hasStoredVoice && voices.length > 0) saveStoredString(VOICE_STORAGE_KEY, '');
  updateVoiceStatus(storedVoiceObject, els.voiceSelect.value === 'random' ? '今回の音声' : '現在の音声');
}

function setupVoiceSelect() {
  if (!els.voiceSelect) return;
  populateVoiceSelect();
  els.voiceSelect.addEventListener('change', () => {
    saveStoredString(VOICE_STORAGE_KEY, els.voiceSelect.value);
    if (els.voiceSelect.value !== 'random') lastRandomVoiceURI = '';
    updateVoiceStatus(null, els.voiceSelect.value === 'random' ? '今回の音声' : '現在の音声');
  });
  const synthesis = getSpeechSynthesis();
  if (synthesis) {
    synthesis.onvoiceschanged = populateVoiceSelect;
  }
}

function getSelectedVoice() {
  const selectedValue = getSelectedVoiceValue();
  if (!selectedValue || selectedValue === 'random') return null;
  return getAvailableVoices().find((voice) => getVoiceOptionValue(voice) === selectedValue) || null;
}

function getAvailableVoiceCandidates() {
  return getDisplayVoices(getAvailableVoices());
}

function pickRandomVoice() {
  const voices = getAvailableVoiceCandidates();
  if (voices.length === 0) return null;
  if (voices.length === 1) {
    lastRandomVoiceURI = getVoiceOptionValue(voices[0]);
    return voices[0];
  }
  const candidates = voices.filter((voice) => getVoiceOptionValue(voice) !== lastRandomVoiceURI);
  const pool = candidates.length > 0 ? candidates : voices;
  const picked = pool[Math.floor(Math.random() * pool.length)];
  lastRandomVoiceURI = getVoiceOptionValue(picked);
  return picked;
}

function getAudioContext() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;
  if (!audioContext) audioContext = new AudioContextClass();
  return audioContext;
}

function resumeAudioContextAfterUserGesture() {
  try {
    const ctx = getAudioContext();
    if (ctx?.state === 'suspended') {
      ctx.resume?.().catch((error) => {
        console.warn('AudioContext resume failed:', error);
      });
    }
  } catch (error) {
    console.warn('AudioContext resume failed:', error);
  }
}

function setupAudioUnlock() {
  const unlock = () => resumeAudioContextAfterUserGesture();
  window.addEventListener('pointerdown', unlock, { once: true });
  window.addEventListener('keydown', unlock, { once: true });
}

function playTone(frequency, startTime, duration, type, volume) {
  const ctx = getAudioContext();
  if (!ctx) return;
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, startTime);
  gain.gain.setValueAtTime(volume, startTime);
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
  oscillator.connect(gain);
  gain.connect(ctx.destination);
  oscillator.start(startTime);
  oscillator.stop(startTime + duration);
}

function playSoundPattern(pattern, type, volume) {
  if (!soundEnabled) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    resumeAudioContextAfterUserGesture();
    const now = ctx.currentTime;
    pattern.forEach((frequency, index) => {
      playTone(frequency, now + index * 0.09, 0.18, type, volume);
    });
  } catch (error) {
    console.warn('Sound effect failed:', error);
  }
}

function playCorrectSound() {
  playSoundPattern([523, 659, 784], 'triangle', 0.08);
}

function playWrongSound() {
  playSoundPattern([220, 147], 'sawtooth', 0.06);
}

function setupSoundSetting() {
  if (!els.soundEffects) return;
  els.soundEffects.checked = soundEnabled;
  els.soundEffects.addEventListener('change', (event) => {
    soundEnabled = event.target.checked;
    saveStoredBoolean(SOUND_ENABLED_STORAGE_KEY, soundEnabled);
  });
}

function getQuizCardElement() {
  return document.querySelector('.quiz-card');
}

function playStartSound() {
  if (!soundEnabled) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    resumeAudioContextAfterUserGesture();

    const now = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99];

    notes.forEach((freq, index) => {
      const startTime = now + index * 0.08;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, startTime);
      gain.gain.setValueAtTime(0.06, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.16);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(startTime);
      osc.stop(startTime + 0.16);
    });

  } catch (error) {
    console.warn('Start sound failed:', error);
  }
}

function scrollToQuestionArea() {
  const target = getQuizCardElement() || els.questionText;
  if (!target) return;

  requestAnimationFrame(() => {
    target.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });

    requestAnimationFrame(() => {
      const margin = 16;
      const top = target.getBoundingClientRect().top + window.scrollY - margin;
      window.scrollTo({
        top: Math.max(top, 0),
        behavior: 'smooth',
      });
    });
  });
}

function handleStartQuizClick() {
  playStartSound();
  beginConfiguredSession();
  scrollToQuestionArea();
}

function getSpeechSynthesis() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null;
}

function getCurrentQuestionText() {
  const current = state.questions[state.index];
  return current?.question ? String(current.question).trim() : '';
}

function cancelSpeech() {
  const synthesis = getSpeechSynthesis();
  if (synthesis) synthesis.cancel();
}

function speakCurrentQuestion() {
  const synthesis = getSpeechSynthesis();
  const text = getCurrentQuestionText();
  if (!synthesis || !text || typeof SpeechSynthesisUtterance === 'undefined') return;

  synthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'en-US';
  const isRandomVoice = getSelectedVoiceValue() === 'random';
  const selectedVoice = isRandomVoice ? pickRandomVoice() : getSelectedVoice();
  if (selectedVoice) {
    utterance.voice = selectedVoice;
    utterance.lang = selectedVoice.lang || utterance.lang;
  }
  updateVoiceStatus(selectedVoice, isRandomVoice ? '今回の音声' : '現在の音声');
  utterance.rate = 0.9;
  utterance.pitch = 1.0;

  synthesis.speak(utterance);
}

function initializeSpeech() {
  const synthesis = getSpeechSynthesis();
  if (!synthesis) return;
  // iPhone Safariでは、ユーザー操作の中でspeechSynthesisへ触れておくと
  // 以後の手動再生が安定しやすい。音声は出さず、既存キューだけを止める。
  synthesis.cancel();
}

function updateSpeakButton() {
  if (!els.speakQuestionButton) return;
  els.speakQuestionButton.disabled = !getCurrentQuestionText();
}

function renderStudyAppLinkText() {
  return RENDER_STUDY_APP_URL
    ? `<a href="${RENDER_STUDY_APP_URL}">Render版で開く</a>`
    : 'Render版URL未確認（正しいWeb Service URLを確認してください）';
}

function renderStudyAppUrlText() {
  return RENDER_STUDY_APP_URL || 'Render版URL未確認（正しいWeb Service URLを確認してください）';
}

function updateHostingStatus() {
  if (!els.hostingStatus) return;
  if (IS_GITHUB_PAGES) {
    els.hostingStatus.innerHTML = `現在の配信元: GitHub Pages（サーバー保存不可） / ${renderStudyAppLinkText()}`;
    els.hostingStatus.className = 'hosting-status hosting-status-warning';
    return;
  }
  if (IS_RENDER) {
    els.hostingStatus.textContent = `現在の配信元: Render版（PC・iPhone共通保存対応） ${API_BASE}`;
    els.hostingStatus.className = 'hosting-status hosting-status-ok';
    return;
  }
  els.hostingStatus.textContent = `現在の配信元: ${API_BASE || 'ローカル/不明'}（/api/questions/upload がある環境のみ共通保存対応）`;
  els.hostingStatus.className = 'hosting-status';
}

function serverSaveUnavailableMessage() {
  if (IS_GITHUB_PAGES) {
    return `GitHub Pages版ではサーバー保存不可です。PC・iPhone共通保存は ${renderStudyAppUrlText()} を開いてください。`;
  }
  return '';
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

  return normalizeMatrixRows(rows);
}

function parseWorkbookRows(arrayBuffer) {
  if (!window.XLSX) {
    throw new Error('Excel読み込みライブラリの読み込みに失敗しました。ネットワーク接続またはCDN設定を確認してください。');
  }
  const workbook = window.XLSX.read(arrayBuffer, { type: 'array' });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) throw new Error('Excelファイルにシートがありません。');
  const matrix = window.XLSX.utils.sheet_to_json(workbook.Sheets[firstSheetName], { header: 1, defval: '', raw: false });
  return normalizeMatrixRows(matrix);
}

function shuffle(items) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function stripBom(value) {
  return String(value || '').replace(/^\uFEFF/, '');
}

function pickField(row, aliases) {
  for (const alias of aliases) {
    const value = row[alias];
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return String(value).trim();
    }
  }
  return '';
}

function normalizeQuestions(rows) {
  const modeConfig = MODES[state.mode];

  return rows.map((row, index) => {
    const normalizedRow = Object.fromEntries(
      Object.entries(row || {}).map(([key, value]) => [stripBom(key).trim(), String(value ?? '').trim()]),
    );
    const correct = pickField(normalizedRow, modeConfig.correctAliases);
    const choices = [
      correct,
      pickField(normalizedRow, COMMON_ALIASES.choice1),
      pickField(normalizedRow, COMMON_ALIASES.choice2),
      pickField(normalizedRow, COMMON_ALIASES.choice3),
    ];
    const uniqueChoices = [...new Set(choices.filter(Boolean))];

    return {
      id: pickField(normalizedRow, COMMON_ALIASES.id) || String(index + 1),
      level: pickField(normalizedRow, COMMON_ALIASES.level),
      question: pickField(normalizedRow, modeConfig.questionAliases),
      correct,
      choices: uniqueChoices,
      totalCorrect: pickField(normalizedRow, COMMON_ALIASES.totalCorrect) || '0',
      totalWrong: pickField(normalizedRow, COMMON_ALIASES.totalWrong) || '0',
      csvAccuracy: pickField(normalizedRow, COMMON_ALIASES.accuracy) || '0%',
      currentStreak: pickField(normalizedRow, COMMON_ALIASES.currentStreak) || '0',
      note: pickField(normalizedRow, COMMON_ALIASES.note),
    };
  }).filter((item) => item.question && item.correct && item.choices.length === 4);
}

function resetSessionStats() {
  state.index = 0;
  state.answered = 0;
  state.correct = 0;
  state.mistakes = [];
  state.reviewMode = false;
  state.selected = false;
  updateStats();
}

function setLoadingState(message) {
  cancelSpeech();
  state.questionPool = [];
  state.questions = [];
  resetSessionStats();
  els.questionText.textContent = message;
  els.choices.innerHTML = '';
  els.feedback.hidden = true;
  els.progressLabel.textContent = '0 / 0';
  els.nextButton.disabled = true;
  els.nextButton.textContent = '次の問題へ';
  els.startQuizButton.disabled = true;
  els.settingsStatus.textContent = '問題を読み込むと出題設定を利用できます。';
  updateSpeakButton();
}

function updateQuestionCountOptions(availableCount) {
  Array.from(els.questionCount.options).forEach((option) => {
    if (option.value === 'all') {
      option.disabled = false;
      return;
    }
    option.disabled = Number(option.value) > availableCount;
  });

  const selectedOption = els.questionCount.selectedOptions[0];
  if (!selectedOption || selectedOption.disabled) {
    els.questionCount.value = DEFAULT_QUESTION_COUNT;
    saveStoredString(QUESTION_COUNT_STORAGE_KEY, DEFAULT_QUESTION_COUNT);
  }
}

function getConfiguredQuestionCount() {
  if (els.questionCount.value === 'all') return state.questionPool.length;
  return Math.min(Number(els.questionCount.value), state.questionPool.length);
}

function cloneQuestionForSession(question) {
  return {
    ...question,
    choices: shuffle(question.choices),
  };
}

function beginConfiguredSession() {
  initializeSpeech();
  if (state.questionPool.length === 0) return;

  resetSessionStats();
  const random = els.randomOrder.checked;
  const requestedCount = getConfiguredQuestionCount();
  const orderedPool = random ? shuffle(state.questionPool) : [...state.questionPool];
  state.questions = orderedPool.slice(0, requestedCount).map(cloneQuestionForSession);

  const countLabel = els.questionCount.value === 'all' ? '全問' : `${requestedCount}問`;
  const orderLabel = random ? 'ランダム' : '元の順番';
  els.settingsStatus.textContent = `全${state.questionPool.length}問から、${orderLabel}で${countLabel}を出題します。`;
  showQuestion();
}

function showEmptyState() {
  cancelSpeech();
  state.questions = [];
  state.index = 0;
  els.progressLabel.textContent = '0 / 0';
  els.questionText.textContent = '出題できる問題がありません。';
  els.choices.innerHTML = '';
  els.feedback.textContent = '正解と3つの誤答選択肢がそろっている行だけを出題します。';
  els.feedback.className = 'feedback';
  els.feedback.hidden = false;
  els.nextButton.disabled = true;
  els.startQuizButton.disabled = true;
  els.settingsStatus.textContent = '出題可能な行がありません。';
  updateModeUi();
  updateSpeakButton();
}

function applyQuestions(rows, sourceLabel, options = {}) {
  state.questionPool = normalizeQuestions(rows);
  state.sourceLabel = sourceLabel;
  const skippedCount = Math.max(rows.length - state.questionPool.length, 0);
  const skippedMessage = skippedCount > 0 ? ` 選択肢などが不足している${skippedCount}行は出題しません。` : '';
  els.uploadStatus.textContent = options.message || `${sourceLabel} から ${state.questionPool.length}問を読み込みました。${skippedMessage}`;
  updateQuestionCountOptions(state.questionPool.length);

  if (state.questionPool.length === 0) {
    showEmptyState();
    return;
  }

  els.startQuizButton.disabled = false;
  beginConfiguredSession();
}


function rowsToCsv(rows) {
  const headers = STANDARD_COLUMNS;
  const escapeCell = (value) => {
    const text = String(value ?? '');
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return [headers, ...rows.map((row) => headers.map((header) => row[header] ?? ''))]
    .map((row) => row.map(escapeCell).join(','))
    .join('\n');
}

function sharedCacheKey(mode) {
  return `${SHARED_CACHE_PREFIX}${mode}`;
}

function cacheSharedQuestions(mode, payload) {
  try {
    localStorage.setItem(sharedCacheKey(mode), JSON.stringify(payload));
  } catch (error) {
    console.warn('Failed to cache shared questions:', error);
  }
}

async function fetchSharedQuestions(mode) {
  const response = await fetch(`${API_BASE}/api/questions/current?mode=${encodeURIComponent(mode)}`, { cache: 'no-store' });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  const payload = await response.json();
  if (!payload.ok || !Array.isArray(payload.rows)) throw new Error(payload.error || '共通問題データの形式が不正です。');
  cacheSharedQuestions(mode, payload);
  return payload;
}

async function loadStandardCsv(mode) {
  const response = await fetch(MODES[mode].file);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return parseCsv(await response.text());
}

async function loadMode(mode) {
  const loadToken = state.loadToken + 1;
  state.loadToken = loadToken;
  state.mode = mode;
  setLoadingState('問題を読み込み中...');
  updateModeUi();

  try {
    const shared = await fetchSharedQuestions(mode);
    if (loadToken !== state.loadToken || state.mode !== mode) return;
    applyQuestions(shared.rows, '共通問題データ', { message: `共通問題データから${shared.rows.length}問を読み込みました` });
  } catch (sharedError) {
    try {
      const rows = await loadStandardCsv(mode);
      if (loadToken !== state.loadToken || state.mode !== mode) return;
      applyQuestions(rows, '標準CSV', { message: `標準CSVから${rows.length}問を読み込みました` });
    } catch (standardError) {
      if (loadToken !== state.loadToken || state.mode !== mode) return;
      els.questionText.textContent = 'CSVの読み込みに失敗しました。GitHub PagesなどのWebサーバー上で開いてください。';
      els.feedback.textContent = `共通問題データ: ${sharedError.message} / 標準CSV: ${standardError.message}`;
      els.feedback.className = 'feedback wrong';
      els.feedback.hidden = false;
      els.uploadStatus.textContent = '標準CSVの読み込みに失敗しました。';
    }
  }
}

async function handleUpload(event) {
  const [file] = event.target.files;
  if (!file) return;
  const uploadMode = detectModeFromFilename(file.name || '', state.mode);
  state.loadToken += 1;
  setLoadingState('ファイルを読み込み中...');

  let parsedRows = null;

  try {
    const extension = file.name.split('.').pop().toLowerCase();
    const rows = extension === 'xlsx'
      ? parseWorkbookRows(await file.arrayBuffer())
      : parseCsv(decodeText(await file.arrayBuffer()));
    parsedRows = rows;

    const formData = new FormData();
    formData.append('mode', uploadMode);
    const normalizedCsv = rowsToCsv(rows);
    const normalizedFile = new File([normalizedCsv], file.name.replace(/\.xlsx?$/i, '.csv'), { type: 'text/csv' });
    formData.append('file', normalizedFile);
    const response = await fetch(`${API_BASE}/api/questions/upload`, { method: 'POST', body: formData });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.ok) throw new Error(result.error || `${response.status} ${response.statusText}`);

    cacheSharedQuestions(uploadMode, { ok: true, mode: uploadMode, rows, count: rows.length, updatedAt: result.updatedAt, filename: file.name });
    state.mode = uploadMode;
    updateModeUi();
    applyQuestions(rows, '共通問題データ', { message: '共通問題データを保存しました。PC・iPhone共通で利用できます' });
  } catch (error) {
    if (parsedRows) {
      state.mode = uploadMode;
      updateModeUi();
      applyQuestions(parsedRows, 'アップロードファイル', {
        message: `${serverSaveUnavailableMessage()}サーバー保存には失敗しましたが、一時確認用に${parsedRows.length}行を読み込みました。API: /api/questions/upload 理由: ${error.message}`,
      });
    } else {
      els.questionText.textContent = 'アップロードファイルの読み込みに失敗しました。';
      els.feedback.textContent = error.message;
      els.feedback.className = 'feedback wrong';
      els.feedback.hidden = false;
      els.uploadStatus.textContent = `${serverSaveUnavailableMessage()}アップロードに失敗しました。API: /api/questions/upload 理由: ${error.message}`;
    }
  } finally {
    event.target.value = '';
  }
}

function updateModeUi() {
  els.modeButtons.forEach((button) => button.classList.toggle('active', button.dataset.mode === state.mode));
  const hostingMessage = IS_GITHUB_PAGES ? `現在はGitHub Pages版です。サーバー保存不可のため、共通保存は ${renderStudyAppUrlText()} を使ってください。` : 'Render版では共通問題データを優先し、取得失敗時のみ標準CSVを読み込みます。';
  els.modeDescription.textContent = `${MODES[state.mode].description} ${hostingMessage}`;
  els.modeLabel.textContent = state.reviewMode ? `${MODES[state.mode].label}（復習）` : MODES[state.mode].label;
  getQuizCardElement()?.classList.toggle('mode-word', state.mode === 'word');
  getQuizCardElement()?.classList.toggle('mode-chunk', state.mode === 'chunk');
  getQuizCardElement()?.classList.toggle('mode-definition', state.mode === 'definition');
}

function updateStats() {
  els.correctCount.textContent = String(state.correct);
  els.answeredCount.textContent = String(state.answered);
  els.accuracyRate.textContent = state.answered === 0 ? '0%' : `${Math.round((state.correct / state.answered) * 100)}%`;
  els.reviewSummary.textContent = state.mistakes.length === 0 ? 'まだ間違えた問題はありません。' : `${state.mistakes.length}問を復習できます。`;
  els.reviewButton.disabled = state.mistakes.length === 0;
}

function showQuestion() {
  cancelSpeech();
  state.selected = false;
  els.feedback.hidden = true;
  els.nextButton.disabled = true;
  const current = state.questions[state.index];
  els.progressLabel.textContent = state.questions.length === 0 ? '0 / 0' : `${state.index + 1} / ${state.questions.length}`;

  if (!current) {
    showEmptyState();
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
    button.addEventListener('click', () => answer(choice));
    els.choices.appendChild(button);
  });
  els.nextButton.textContent = state.index === state.questions.length - 1 ? '結果を見る' : '次の問題へ';
  updateModeUi();
  updateSpeakButton();
  if (els.autoSpeak?.checked) {
    speakCurrentQuestion();
  }
}

function answer(choice) {
  if (state.selected) return;
  state.selected = true;
  const current = state.questions[state.index];
  const isCorrect = choice === current.correct;
  state.answered += 1;

  if (isCorrect) {
    playCorrectSound();
    state.correct += 1;
  } else {
    playWrongSound();
    if (!state.reviewMode) {
      state.mistakes.push(current);
    }
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

function finishSession() {
  cancelSpeech();
  const rate = state.answered === 0 ? 0 : Math.round((state.correct / state.answered) * 100);
  els.progressLabel.textContent = `${state.questions.length} / ${state.questions.length}`;
  els.questionText.textContent = state.reviewMode ? '復習が終わりました。' : '学習が終わりました。';
  els.choices.innerHTML = '';
  els.feedback.className = 'feedback';
  els.feedback.textContent = `${state.answered}問中${state.correct}問正解、正答率${rate}%です。`;
  els.feedback.hidden = false;
  els.nextButton.disabled = true;
  els.nextButton.textContent = '次の問題へ';
  updateModeUi();
  updateSpeakButton();
}

function nextQuestion() {
  if (state.questions.length === 0) return;
  if (state.index >= state.questions.length - 1) {
    finishSession();
    return;
  }
  state.index += 1;
  showQuestion();
}

function startReview() {
  if (state.mistakes.length === 0) return;
  state.questions = shuffle(state.mistakes).map(cloneQuestionForSession);
  state.mistakes = [];
  state.index = 0;
  state.reviewMode = true;
  state.selected = false;
  showQuestion();
  updateStats();
}

els.modeButtons.forEach((button) => button.addEventListener('click', () => loadMode(button.dataset.mode)));
els.nextButton.addEventListener('click', nextQuestion);
els.reviewButton.addEventListener('click', startReview);
els.fileInput.addEventListener('change', handleUpload);
els.startQuizButton.addEventListener('click', handleStartQuizClick);
els.speakQuestionButton.addEventListener('click', speakCurrentQuestion);

setupQuestionCountSetting();
setupSoundSetting();
setupVoiceSelect();
setupAudioUnlock();
updateHostingStatus();
loadMode(state.mode);
