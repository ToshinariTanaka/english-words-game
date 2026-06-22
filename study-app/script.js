const MODES = {
  word: {
    label: '英単語モード',
    historyModeName: '英単語',
    historySheetName: '★英単語',
    file: './data/word_mode.csv',
    description: '英単語を見て、日本語の意味を選びます。',
    questionAliases: ['C question', 'question', 'word', '英単語', '単語', '問題'],
    correctAliases: ['D correct', 'correct', 'meaning', '和訳', '意味', '正解'],
  },
  chunk: {
    label: 'チャンクモード',
    historyModeName: 'チャンク',
    historySheetName: '★チャンク',
    file: './data/chunk_mode.csv',
    description: '英文中の短いチャンクを見て、正しい部分訳を選びます。',
    questionAliases: ['C question', 'question', 'chunk', 'チャンク', '問題'],
    correctAliases: ['D correct', 'correct', 'chunk_meaning', 'チャンク和訳', '意味', '正解'],
  },
  phrase: {
    label: '文節和訳モード',
    historyModeName: '文節和訳',
    historySheetName: '★文節和訳',
    file: './data/phrase_mode.csv',
    description: '文節単位の英文を見て、正しい日本語訳を選びます。',
    questionAliases: ['C question', 'question', 'phrase', '文節', '文節和訳', '問題'],
    correctAliases: ['D correct', 'correct', 'phrase_meaning', '文節和訳', '文節訳', '意味', '正解'],
  },
  definition: {
    label: '英文和訳モード',
    historyModeName: '英文和訳',
    historySheetName: '★英文和訳',
    file: './data/definition_mode.csv',
    description: '英文を読んで、正しい日本語訳を選びます。',
    questionAliases: ['C question', 'question', '英文', '英語', '問題', 'sentence', 'english', 'definition', '英語定義', '定義'],
    correctAliases: ['D correct', 'correct', '和訳', '日本語訳', '意味', '正解', 'translation', 'japanese', 'definition_meaning'],
  },
};

const RENDER_API_BASE_URL = 'https://english-words-game-1ph3.onrender.com';
const RENDER_STUDY_APP_URL = `${RENDER_API_BASE_URL}/study-app/`;
const HOSTNAME = typeof window !== 'undefined' ? window.location.hostname : '';
const IS_GITHUB_PAGES = HOSTNAME.endsWith('github.io');
const IS_RENDER = HOSTNAME.endsWith('onrender.com') || HOSTNAME === 'localhost' || HOSTNAME === '127.0.0.1';
const API_BASE = IS_GITHUB_PAGES ? RENDER_API_BASE_URL : (typeof window !== 'undefined' ? window.location.origin : '');
const SHARED_CACHE_PREFIX = 'englishWordsGame.sharedQuestions.';
const SOUND_ENABLED_STORAGE_KEY = 'englishWordsGame.soundEnabled';
const QUESTION_COUNT_STORAGE_KEY = 'englishWordsGame.studyApp.questionCount';
const LEVEL_RANGE_START_STORAGE_KEY = 'englishWordsGame.studyApp.levelRangeStart';
const LEVEL_RANGE_END_STORAGE_KEY = 'englishWordsGame.studyApp.levelRangeEnd';
const VOICE_STORAGE_KEY = 'englishWordsGame.studyApp.voiceURI';
const AUTO_SPEAK_STORAGE_KEY = 'englishWordsGame.studyApp.autoSpeak';
const LEARNING_STATS_STORAGE_KEY = 'englishGameLearningStats';
const STUDY_COUNTS_STORAGE_KEY = 'englishWordsGame.studyApp.studyCounts.v1';
const DEFAULT_QUESTION_COUNT = '10';
const LEVEL_ORDER = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const DEFAULT_LEVEL_START = 'A1';
const DEFAULT_LEVEL_END = 'C2';
const ALLOWED_STUDY_VOICES = [
  { name: 'Junior', lang: 'en-US' },
  { name: 'Kathy', lang: 'en-US' },
  { name: 'Ralph', lang: 'en-US' },
  { name: 'Samantha', lang: 'en-US' },
  { name: 'Daniel', lang: 'en-GB' },
  { name: 'Karen', lang: 'en-AU' },
  { name: 'Moria', lang: 'en-IE' },
  { name: 'Rishi', lang: 'en-IN' },
  { name: 'Tessa', lang: 'en-ZA' },
  { name: 'Fred', lang: 'en-US' },
];
const SPECIAL_VOICE_KEYWORDS = [
  'song',
  'sing',
  'singing',
  'singer',
  'music',
  'musical',
  'good news',
  'bubbles',
  'whisper',
  'novelty',
  'effect',
  'character',
  '歌',
  '歌声',
  '歌唱',
  'うた',
  'ミュージック',
];



const WORKBOOK_SHEET_ALIASES = {
  word: ['★英単語', '英単語', '英単語テスト', 'word', 'word_mode', 'vocabulary', '単語', '★英単語テスト_001_生成'],
  chunk: ['★チャンク', 'チャンク', 'chunk', 'chunk_mode', '★チャンク_001_生成'],
  phrase: ['★文節和訳', '文節和訳', '文節', '部分訳', 'phrase', 'phrase_mode', '★文節和訳_001_生成'],
  definition: ['★英文和訳', '英文和訳', '英文', 'sentence', 'translation', 'definition', 'definition_mode', '★英文和訳_001_生成'],
};
const OFFICIAL_WORKBOOK_SHEETS = { word: '★英単語', chunk: '★チャンク', phrase: '★文節和訳', definition: '★英文和訳' };
const MODE_KEY_PREFIXES = { word: 'w', chunk: 'c', phrase: 'p', definition: 's' };
const ALLOWED_OFFICIAL_LEVELS = new Set(['A1', 'A2', 'B1', 'B2', 'C1', 'C2']);
const MAX_SHOWN_UPLOAD_ERRORS = 20;

const FIXED_HISTORY_SHEET_NAMES = Object.fromEntries(
  Object.entries(MODES).map(([mode, config]) => [mode, config.historySheetName]),
);

const STANDARD_COLUMNS = [
  'row_number', 'level', 'question', 'correct', 'choice1', 'choice2', 'choice3',
  'total_correct', 'total_wrong', 'accuracy', 'current_streak', 'note', 'question_key',
];

function normalizeStandardRow(row) {
  const cells = Array.isArray(row) ? row : STANDARD_COLUMNS.map((column) => row?.[column] ?? '');
  return Object.fromEntries(STANDARD_COLUMNS.map((column, index) => [column, stripBom(cells[index] ?? '').trim()]));
}

function normalizeMatrixRows(matrix) {
  if (!matrix.length) return [];
  return matrix.slice(1).map(normalizeStandardRow);
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
  questionKey: ['M question_key', 'question_key', 'questionKey', '問題キー'],
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
  localModeRows: {},
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
  levelStart: document.getElementById('levelStart'),
  levelEnd: document.getElementById('levelEnd'),
  randomOrder: document.getElementById('randomOrder'),
  startQuizButton: document.getElementById('startQuizButton'),
  settingsStatus: document.getElementById('settingsStatus'),
  hostingStatus: document.getElementById('hostingStatus'),
  autoSpeak: document.getElementById('autoSpeak'),
  soundEffects: document.getElementById('soundEffects'),
  speakQuestionButton: document.getElementById('speakQuestionButton'),
  voiceSelect: document.getElementById('voiceSelect'),
  voiceStatus: document.getElementById('voiceStatus'),
  voiceCandidateCount: document.getElementById('voiceCandidateCount'),
  backToSettingsButton: document.getElementById('backToSettingsButton'),
  weakChecked: document.getElementById('weakChecked'),
  clearLearningStatsButton: document.getElementById('clearLearningStatsButton'),
  studyCountsSummary: document.getElementById('studyCountsSummary'),
  studyCountToday: document.getElementById('studyCountToday'),
  studyCountMonth: document.getElementById('studyCountMonth'),
  studyCountYear: document.getElementById('studyCountYear'),
  studyCountTotal: document.getElementById('studyCountTotal'),
};

let audioContext = null;
let soundEnabled = loadStoredBoolean(SOUND_ENABLED_STORAGE_KEY, true);
let autoSpeakEnabled = loadStoredBoolean(AUTO_SPEAK_STORAGE_KEY, true);
let lastRandomVoiceURI = '';
let currentQuestionAudio = null;
let questionPlaybackToken = 0;

function getLocalDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function createEmptyStudyCounts() {
  return { version: 1, total: 0, byDate: {} };
}

function normalizeStudyCounts(value) {
  const counts = createEmptyStudyCounts();
  if (!value || typeof value !== 'object') return counts;
  counts.total = Math.max(0, Number(value.total || 0));
  if (value.byDate && typeof value.byDate === 'object') {
    Object.entries(value.byDate).forEach(([dateKey, count]) => {
      if (/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
        counts.byDate[dateKey] = Math.max(0, Number(count || 0));
      }
    });
  }
  return counts;
}

function readStudyCounts() {
  try {
    if (typeof localStorage === 'undefined') return createEmptyStudyCounts();
    const raw = localStorage.getItem(STUDY_COUNTS_STORAGE_KEY);
    if (!raw) return createEmptyStudyCounts();
    return normalizeStudyCounts(JSON.parse(raw));
  } catch (error) {
    console.warn('Failed to load study counts:', error);
    return createEmptyStudyCounts();
  }
}

function writeStudyCounts(counts) {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(STUDY_COUNTS_STORAGE_KEY, JSON.stringify(normalizeStudyCounts(counts)));
  } catch (error) {
    console.warn('Failed to save study counts:', error);
  }
}

function incrementStudyCount(date = new Date()) {
  const dateKey = getLocalDateKey(date);
  const counts = readStudyCounts();
  counts.version = 1;
  counts.total = Number(counts.total || 0) + 1;
  counts.byDate[dateKey] = Number(counts.byDate[dateKey] || 0) + 1;
  writeStudyCounts(counts);
  return counts;
}

function aggregateStudyCounts(counts = readStudyCounts(), date = new Date()) {
  const normalized = normalizeStudyCounts(counts);
  const todayKey = getLocalDateKey(date);
  const monthKey = todayKey.slice(0, 7);
  const yearKey = todayKey.slice(0, 4);
  return Object.entries(normalized.byDate).reduce((summary, [dateKey, count]) => {
    const numericCount = Number(count || 0);
    if (dateKey === todayKey) summary.today += numericCount;
    if (dateKey.slice(0, 7) === monthKey) summary.month += numericCount;
    if (dateKey.slice(0, 4) === yearKey) summary.year += numericCount;
    return summary;
  }, { today: 0, month: 0, year: 0, total: Number(normalized.total || 0) });
}

function renderStudyCountsSummary(date = new Date()) {
  if (!els.studyCountsSummary) return aggregateStudyCounts(readStudyCounts(), date);
  const summary = aggregateStudyCounts(readStudyCounts(), date);
  if (els.studyCountToday) els.studyCountToday.textContent = String(summary.today);
  if (els.studyCountMonth) els.studyCountMonth.textContent = String(summary.month);
  if (els.studyCountYear) els.studyCountYear.textContent = String(summary.year);
  if (els.studyCountTotal) els.studyCountTotal.textContent = String(summary.total);
  els.studyCountsSummary.hidden = false;
  return summary;
}

function hideStudyCountsSummary() {
  if (els.studyCountsSummary) els.studyCountsSummary.hidden = true;
}

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

function getVoiceSearchableText(voice) {
  return `${voice?.name || ''} ${voice?.lang || ''}`.toLowerCase();
}

function normalizeVoicePart(value) {
  return String(value || '').trim().toLowerCase();
}

function isAllowedStudyVoiceMatch(voice, allowedVoice) {
  return normalizeVoicePart(voice?.name) === normalizeVoicePart(allowedVoice?.name)
    && normalizeVoicePart(voice?.lang) === normalizeVoicePart(allowedVoice?.lang);
}

function isAllowedStudyVoice(voice) {
  return ALLOWED_STUDY_VOICES.some((allowedVoice) => isAllowedStudyVoiceMatch(voice, allowedVoice));
}

function isSpecialVoice(voice) {
  const searchableText = getVoiceSearchableText(voice);
  return SPECIAL_VOICE_KEYWORDS.some((keyword) => searchableText.includes(keyword.toLowerCase()));
}

function isSingingVoice(voice) {
  return isSpecialVoice(voice);
}

function filterNarrationVoices(voices) {
  return voices.filter((voice) => isAllowedStudyVoice(voice) && !isSpecialVoice(voice));
}

function getAllowedStudyVoices(voices) {
  const remainingVoices = [...voices];
  return ALLOWED_STUDY_VOICES.flatMap((allowedVoice) => {
    const matchedIndex = remainingVoices.findIndex((voice) => isAllowedStudyVoiceMatch(voice, allowedVoice));
    if (matchedIndex < 0) return [];
    const [matchedVoice] = remainingVoices.splice(matchedIndex, 1);
    return [matchedVoice];
  });
}

function getDisplayVoices(voices) {
  return getAllowedStudyVoices(voices);
}

function getRecommendedVoices(voices) {
  return filterNarrationVoices(getAllowedStudyVoices(voices));
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
  const allVoices = getAvailableVoices();
  const voices = getDisplayVoices(allVoices);
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
  if (els.voiceCandidateCount) {
    els.voiceCandidateCount.textContent = `音声候補：${voices.length}件`;
  }
  const storedVoiceObject = voices.find((voice) => getVoiceOptionValue(voice) === storedVoice) || null;
  const hasStoredVoice = storedVoice === 'random' || Boolean(storedVoiceObject);
  els.voiceSelect.value = hasStoredVoice ? storedVoice : '';
  if (storedVoice && !hasStoredVoice && allVoices.length > 0) saveStoredString(VOICE_STORAGE_KEY, '');
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
  return getDisplayVoices(getAvailableVoices()).find((voice) => getVoiceOptionValue(voice) === selectedValue) || null;
}

function getAvailableVoiceCandidates() {
  return getRecommendedVoices(getAvailableVoices());
}

function getAutoVoiceCandidate() {
  const candidates = getAvailableVoiceCandidates();
  return candidates.length > 0 ? candidates[0] : null;
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

function setupAutoSpeakSetting() {
  if (!els.autoSpeak) return;
  els.autoSpeak.checked = autoSpeakEnabled;
  setVoiceStatusMessage(autoSpeakEnabled ? '自動読上げON' : '自動読上げOFF');
  els.autoSpeak.addEventListener('change', (event) => {
    autoSpeakEnabled = event.target.checked;
    saveStoredBoolean(AUTO_SPEAK_STORAGE_KEY, autoSpeakEnabled);
    setVoiceStatusMessage(autoSpeakEnabled ? '自動読上げON' : '自動読上げOFF');
  });
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

function stopQuestionAudio() {
  if (!currentQuestionAudio) return;
  currentQuestionAudio.pause();
  currentQuestionAudio.removeAttribute('src');
  currentQuestionAudio.load();
  currentQuestionAudio = null;
}

function stopQuestionPlayback() {
  questionPlaybackToken += 1;
  stopQuestionAudio();
  const synthesis = getSpeechSynthesis();
  if (synthesis) synthesis.cancel();
}

function cancelSpeech() {
  stopQuestionPlayback();
}

function getCurrentQuestionAudioUrl() {
  const current = state.questions[state.index];
  const questionKey = current?.questionKey ? String(current.questionKey).trim() : '';
  if (!questionKey) return '';
  return `${API_BASE}/audio/${encodeURIComponent(questionKey)}.mp3`;
}

function speakCurrentQuestionWithWebSpeech(statusLabel = '現在の音声') {
  const synthesis = getSpeechSynthesis();
  const text = getCurrentQuestionText();
  if (!synthesis || !text || typeof SpeechSynthesisUtterance === 'undefined') {
    if (els.voiceStatus) els.voiceStatus.textContent = 'ブラウザ音声が利用できません';
    return;
  }

  synthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'en-US';
  const selectedVoiceValue = getSelectedVoiceValue();
  const isRandomVoice = selectedVoiceValue === 'random';
  const selectedVoice = isRandomVoice ? pickRandomVoice() : (getSelectedVoice() || getAutoVoiceCandidate());
  if (selectedVoice) {
    utterance.voice = selectedVoice;
    utterance.lang = selectedVoice.lang || utterance.lang;
  }
  updateVoiceStatus(selectedVoice, statusLabel || (isRandomVoice ? '今回の音声' : '現在の音声'));
  utterance.rate = 0.9;
  utterance.pitch = 1.0;

  synthesis.speak(utterance);
}

function setVoiceStatusMessage(message) {
  if (els.voiceStatus) els.voiceStatus.textContent = message;
}

function playAudioElement(src, statusPrefix = '') {
  return new Promise((resolve, reject) => {
    if (!src) {
      reject(new Error('MP3 URL is empty.'));
      return;
    }
    stopQuestionAudio();
    const synthesis = getSpeechSynthesis();
    if (synthesis) synthesis.cancel();
    setVoiceStatusMessage(`${statusPrefix}MP3を再生しています`);
    const audio = new Audio(src);
    currentQuestionAudio = audio;
    audio.preload = 'auto';
    audio.crossOrigin = 'anonymous';
    audio.addEventListener('ended', () => {
      if (currentQuestionAudio === audio) currentQuestionAudio = null;
    }, { once: true });
    let settled = false;
    const timeoutId = setTimeout(() => {
      if (settled) return;
      settled = true;
      if (currentQuestionAudio === audio) currentQuestionAudio = null;
      reject(new Error('MP3 playback timed out.'));
    }, 5000);
    audio.addEventListener('error', () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      if (currentQuestionAudio === audio) currentQuestionAudio = null;
      reject(new Error('MP3 failed to load.'));
    }, { once: true });
    audio.play().then(() => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      resolve();
    }).catch((error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      if (currentQuestionAudio === audio) currentQuestionAudio = null;
      reject(error);
    });
  });
}

async function speakCurrentQuestion(options = {}) {
  const text = getCurrentQuestionText();
  if (!text) return;
  const playbackToken = questionPlaybackToken + 1;
  questionPlaybackToken = playbackToken;
  const statusPrefix = options.statusPrefix || '';
  const audioUrl = getCurrentQuestionAudioUrl();
  const fallbackToWebSpeech = () => {
    if (playbackToken !== questionPlaybackToken) return;
    stopQuestionAudio();
    speakCurrentQuestionWithWebSpeech(`${statusPrefix}MP3が再生できないため、ブラウザ音声で読み上げます`);
  };

  if (!audioUrl) {
    fallbackToWebSpeech();
    return;
  }

  playAudioElement(audioUrl, statusPrefix).catch(() => {
    fallbackToWebSpeech();
  });
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
  els.hostingStatus.textContent = `現在の配信元: ${API_BASE || 'ローカル/不明'}（/api/questions/upload-workbook がある環境のみ共通保存対応）`;
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

function getWorkbookSummaryText(modeRows) {
  return `英単語 ${normalizeQuestionsForMode(modeRows.word || [], 'word').length}問、チャンク ${normalizeQuestionsForMode(modeRows.chunk || [], 'chunk').length}問、文節和訳 ${normalizeQuestionsForMode(modeRows.phrase || [], 'phrase').length}問、英文和訳 ${normalizeQuestionsForMode(modeRows.definition || [], 'definition').length}問`;
}

function isCompleteOfficialRow(row) {
  return ['question', 'correct', 'choice1', 'choice2', 'choice3'].every((column) => String(row?.[column] || '').trim() !== '');
}

function normalizeDuplicateValue(value) {
  return String(value || '').trim().normalize('NFKC').toLowerCase();
}

function getOrCreateUploadValidationBox() {
  let box = document.getElementById('uploadValidationErrors');
  if (box) return box;
  box = document.createElement('div');
  box.id = 'uploadValidationErrors';
  box.className = 'upload-validation-errors';
  box.hidden = true;
  els.uploadStatus?.insertAdjacentElement('afterend', box);
  return box;
}

function showUploadValidationErrors(payload) {
  const box = getOrCreateUploadValidationBox();
  if (!box) return;
  box.textContent = '';
  const title = document.createElement('strong');
  const errorCount = Number(payload?.errorCount || payload?.errors?.length || 0);
  title.textContent = `アップロード検証エラー: ${errorCount}件`;
  box.appendChild(title);
  const list = document.createElement('ul');
  for (const error of payload?.errors || []) {
    const item = document.createElement('li');
    item.textContent = String(error);
    list.appendChild(item);
  }
  box.appendChild(list);
  if (payload?.moreErrorCount > 0) {
    const more = document.createElement('p');
    more.textContent = `ほか ${payload.moreErrorCount} 件のエラーがあります。`;
    box.appendChild(more);
  }
  box.hidden = false;
}

function clearUploadValidationErrors() {
  const box = document.getElementById('uploadValidationErrors');
  if (box) {
    box.textContent = '';
    box.hidden = true;
  }
}

function validateOfficialWorkbookRows(modeRows) {
  const errors = [];
  const playableRows = {};
  for (const mode of Object.keys(OFFICIAL_WORKBOOK_SHEETS)) {
    const rows = modeRows[mode] || [];
    const sheetName = OFFICIAL_WORKBOOK_SHEETS[mode];
    const prefix = MODE_KEY_PREFIXES[mode];
    const keys = new Map();
    playableRows[mode] = [];
    rows.forEach((row, index) => {
      if (!isCompleteOfficialRow(row)) return;
      const excelRow = index + 2;
      const level = String(row.level || '').trim().toUpperCase();
      const key = String(row.question_key || '').trim();
      if (!ALLOWED_OFFICIAL_LEVELS.has(level)) errors.push(`${sheetName} ${excelRow}行目: B列 level は A1, A2, B1, B2, C1, C2 のいずれかにしてください。`);
      if (!key) errors.push(`${sheetName} ${excelRow}行目: M列 question_key が空です。`);
      else if (!new RegExp(`^${prefix}\\d{6}$`).test(key)) errors.push(`${sheetName} ${excelRow}行目: M列 question_key は ${prefix}000001 形式にしてください。`);
      if (key) {
        if (keys.has(key)) errors.push(`${sheetName} ${excelRow}行目: M列 question_key が同一シート内で重複しています（${keys.get(key)}行目と同じ ${key}）。`);
        else keys.set(key, excelRow);
      }
      const answerValues = ['correct', 'choice1', 'choice2', 'choice3'].map((column) => normalizeDuplicateValue(row[column]));
      if (new Set(answerValues).size !== answerValues.length) errors.push(`${sheetName} ${excelRow}行目: D〜G列に正規化後重複する選択肢があります。`);
      playableRows[mode].push({ ...row, level, question_key: key });
    });
    if (playableRows[mode].length === 0) errors.push(`${sheetName}: C〜G列がすべて入った出題対象行が0件です。`);
  }
  return { errors, playableRows, errorCount: errors.length, shownErrorCount: Math.min(errors.length, MAX_SHOWN_UPLOAD_ERRORS), moreErrorCount: Math.max(0, errors.length - MAX_SHOWN_UPLOAD_ERRORS) };
}

function normalizeSheetName(sheetName) {
  return String(sheetName || '').trim().toLowerCase();
}

function findWorkbookSheetNameForMode(workbook, mode, { officialOnly = false } = {}) {
  if (officialOnly) return workbook.SheetNames.find((sheetName) => sheetName === OFFICIAL_WORKBOOK_SHEETS[mode]);
  const aliases = WORKBOOK_SHEET_ALIASES[mode] || [];
  const normalizedAliases = aliases.map(normalizeSheetName);
  return workbook.SheetNames.find((sheetName) => normalizedAliases.includes(normalizeSheetName(sheetName)));
}

function normalizeHistorySheetName(modeOrSheetName) {
  const normalized = normalizeSheetName(modeOrSheetName);
  for (const [mode, aliases] of Object.entries(WORKBOOK_SHEET_ALIASES)) {
    if (mode === modeOrSheetName || aliases.map(normalizeSheetName).includes(normalized)) {
      return FIXED_HISTORY_SHEET_NAMES[mode];
    }
  }
  return FIXED_HISTORY_SHEET_NAMES[state.mode] || FIXED_HISTORY_SHEET_NAMES.word;
}

function getLearningHistoryKey(question, mode = state.mode) {
  const modeConfig = MODES[mode] || MODES.word;
  const questionKey = typeof question === 'string' ? question : question?.questionKey;
  const fallback = typeof question === 'string' ? question : question?.question;
  return `${modeConfig.historyModeName}::${normalizeHistorySheetName(mode)}::${String(questionKey || fallback || '').trim()}`;
}

function readLearningStats() {
  try {
    if (typeof localStorage === 'undefined') return { schema_version: 2, items: {} };
    const raw = localStorage.getItem(LEARNING_STATS_STORAGE_KEY);
    if (!raw) return { schema_version: 2, items: {} };
    const parsed = JSON.parse(raw) || {};
    if (parsed.schema_version !== 2 || !parsed.items || typeof parsed.items !== 'object') {
      localStorage.removeItem(LEARNING_STATS_STORAGE_KEY);
      return { schema_version: 2, items: {} };
    }
    return parsed;
  } catch (error) {
    console.warn('Failed to load learning stats:', error);
    try {
      if (typeof localStorage !== 'undefined') localStorage.removeItem(LEARNING_STATS_STORAGE_KEY);
    } catch (removeError) {
      console.warn('Failed to remove invalid learning stats:', removeError);
    }
    return { schema_version: 2, items: {} };
  }
}

function writeLearningStats(stats) {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(LEARNING_STATS_STORAGE_KEY, JSON.stringify(stats));
  } catch (error) {
    console.warn('Failed to save learning stats:', error);
  }
}

function calculateAccuracy(correct, wrong) {
  const total = Number(correct || 0) + Number(wrong || 0);
  return total === 0 ? 0 : Math.round((Number(correct || 0) / total) * 100);
}

function calculateRecent10Accuracy(recentResults) {
  const recent = (Array.isArray(recentResults) ? recentResults : []).slice(-10);
  if (recent.length === 0) return 0;
  return Math.round((recent.filter(Boolean).length / recent.length) * 100);
}

function getLearningStat(question, mode = state.mode) {
  const stats = readLearningStats();
  return stats.items[getLearningHistoryKey(question, mode)] || {
    total_correct: 0,
    total_wrong: 0,
    recent_results: [],
    accuracy: 0,
    recent10_accuracy: 0,
    weak_checked: false,
  };
}

function updateLearningStat(question, isCorrect, mode = state.mode) {
  const stats = readLearningStats();
  const key = getLearningHistoryKey(question, mode);
  const current = stats.items[key] || getLearningStat(question, mode);
  const recentResults = [...(Array.isArray(current.recent_results) ? current.recent_results : []), Boolean(isCorrect)].slice(-10);
  const next = {
    ...current,
    total_correct: Number(current.total_correct || 0) + (isCorrect ? 1 : 0),
    total_wrong: Number(current.total_wrong || 0) + (isCorrect ? 0 : 1),
    recent_results: recentResults,
    weak_checked: Boolean(current.weak_checked),
  };
  next.accuracy = calculateAccuracy(next.total_correct, next.total_wrong);
  next.recent10_accuracy = calculateRecent10Accuracy(next.recent_results);
  next.question = typeof question === 'string' ? question : (question?.question || current.question || '');
  next.question_key = typeof question === 'string' ? question : (question?.questionKey || current.question_key || '');
  stats.items[key] = next;
  writeLearningStats(stats);
  return next;
}

function setWeakChecked(question, checked, mode = state.mode) {
  const stats = readLearningStats();
  const key = getLearningHistoryKey(question, mode);
  const current = stats.items[key] || getLearningStat(question, mode);
  stats.items[key] = {
    ...current,
    question: typeof question === 'string' ? question : (question?.question || current.question || ''),
    question_key: typeof question === 'string' ? question : (question?.questionKey || current.question_key || ''),
    weak_checked: Boolean(checked),
  };
  writeLearningStats(stats);
  return stats.items[key];
}

function clearLearningStatsWithConfirm() {
  if (typeof window !== 'undefined' && !window.confirm('学習履歴をすべて削除します。よろしいですか？')) return false;
  try {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(LEARNING_STATS_STORAGE_KEY);
    return true;
  } catch (error) {
    console.warn('Failed to clear learning stats:', error);
    return false;
  }
}

function parseSheetRows(workbook, sheetName) {
  const matrix = window.XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: '', raw: false });
  return normalizeMatrixRows(matrix);
}

function parseWorkbookModeRows(arrayBuffer, selectedMode = state.mode, { officialOnly = false } = {}) {
  if (!window.XLSX) {
    throw new Error('Excel読み込みライブラリの読み込みに失敗しました。ネットワーク接続またはCDN設定を確認してください。');
  }
  const workbook = window.XLSX.read(arrayBuffer, { type: 'array' });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) throw new Error('Excelファイルにシートがありません。');

  const modeRows = {};
  for (const mode of Object.keys(WORKBOOK_SHEET_ALIASES)) {
    const actualSheetName = findWorkbookSheetNameForMode(workbook, mode, { officialOnly });
    if (actualSheetName) modeRows[mode] = parseSheetRows(workbook, actualSheetName);
  }

  if (officialOnly) {
    const requiredSheetNames = Object.values(OFFICIAL_WORKBOOK_SHEETS);
    const missing = requiredSheetNames.filter((sheetName) => !workbook.SheetNames.includes(sheetName));
    const extra = workbook.SheetNames.filter((sheetName) => !requiredSheetNames.includes(sheetName));
    if (missing.length || extra.length) throw new Error(`正式アップロードは .xlsx の4シートExcelのみ対応です。必要シート: ${requiredSheetNames.join(' / ')}。不足: ${missing.join(' / ') || 'なし'}。許可外: ${extra.join(' / ') || 'なし'}。`);
    return { type: 'multiMode', modeRows, activeMode: selectedMode };
  }

  if (workbook.SheetNames.length > 1) {
    if (!modeRows[selectedMode]) {
      throw new Error(`${MODES[selectedMode].label}に対応するシートが見つかりません。シート名を「${WORKBOOK_SHEET_ALIASES[selectedMode].join('」「')}」のいずれかにしてください。`);
    }
    return { type: 'multiMode', modeRows, activeMode: selectedMode };
  }

  if (modeRows[selectedMode]) {
    return { type: 'multiMode', modeRows, activeMode: selectedMode };
  }

  return { type: 'single', rows: parseSheetRows(workbook, firstSheetName), activeMode: selectedMode };
}

function parseWorkbookRows(arrayBuffer) {
  const parsed = parseWorkbookModeRows(arrayBuffer, state.mode);
  return parsed.type === 'multiMode' ? parsed.modeRows[state.mode] : parsed.rows;
}

function shuffle(items) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}


function normalizeLevelRangeValue(value, fallback) {
  const normalized = String(value || '').trim().toUpperCase();
  return LEVEL_ORDER.includes(normalized) ? normalized : fallback;
}

function getSelectedLevelRange() {
  const start = normalizeLevelRangeValue(els.levelStart?.value, DEFAULT_LEVEL_START);
  const end = normalizeLevelRangeValue(els.levelEnd?.value, DEFAULT_LEVEL_END);
  const startIndex = LEVEL_ORDER.indexOf(start);
  const endIndex = LEVEL_ORDER.indexOf(end);

  if (startIndex <= endIndex) return { start, end, startIndex, endIndex };
  return { start: DEFAULT_LEVEL_START, end: DEFAULT_LEVEL_END, startIndex: 0, endIndex: LEVEL_ORDER.length - 1 };
}

function isQuestionInSelectedLevelRange(question) {
  const level = String(question?.level || '').trim().toUpperCase();
  const levelIndex = LEVEL_ORDER.indexOf(level);
  if (levelIndex < 0) return false;

  const { startIndex, endIndex } = getSelectedLevelRange();
  return levelIndex >= startIndex && levelIndex <= endIndex;
}

function getFilteredQuestionPool() {
  return state.questionPool.filter(isQuestionInSelectedLevelRange);
}

function syncLevelRangeUiWithState() {
  if (!els.levelStart || !els.levelEnd) return;
  const range = getSelectedLevelRange();
  els.levelStart.value = range.start;
  els.levelEnd.value = range.end;
}

function updateStartButtonForFilteredCount(filteredCount) {
  els.startQuizButton.disabled = filteredCount === 0;
  if (filteredCount === 0) {
    els.settingsStatus.textContent = '選択したレベル範囲に出題できる問題がありません。';
  }
}

function refreshQuestionCountOptionsForLevelRange() {
  syncLevelRangeUiWithState();
  const filteredCount = getFilteredQuestionPool().length;
  updateQuestionCountOptions(filteredCount);
  updateStartButtonForFilteredCount(filteredCount);
  return filteredCount;
}

function setupLevelRangeSetting() {
  if (!els.levelStart || !els.levelEnd) return;
  els.levelStart.value = normalizeLevelRangeValue(loadStoredString(LEVEL_RANGE_START_STORAGE_KEY, DEFAULT_LEVEL_START), DEFAULT_LEVEL_START);
  els.levelEnd.value = normalizeLevelRangeValue(loadStoredString(LEVEL_RANGE_END_STORAGE_KEY, DEFAULT_LEVEL_END), DEFAULT_LEVEL_END);
  syncLevelRangeUiWithState();

  const handleLevelRangeChange = () => {
    syncLevelRangeUiWithState();
    saveStoredString(LEVEL_RANGE_START_STORAGE_KEY, els.levelStart.value);
    saveStoredString(LEVEL_RANGE_END_STORAGE_KEY, els.levelEnd.value);
    const filteredCount = refreshQuestionCountOptionsForLevelRange();
    if (filteredCount > 0) beginConfiguredSession();
  };

  els.levelStart.addEventListener('change', handleLevelRangeChange);
  els.levelEnd.addEventListener('change', handleLevelRangeChange);
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

function normalizeQuestionsForMode(rows, mode) {
  const modeConfig = MODES[mode];

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
      questionKey: pickField(normalizedRow, COMMON_ALIASES.questionKey),
    };
  }).filter((item) => item.question && item.correct && item.choices.length === 4);
}

function normalizeQuestions(rows) {
  return normalizeQuestionsForMode(rows, state.mode);
}

function resetSessionStats() {
  state.index = 0;
  state.answered = 0;
  state.correct = 0;
  state.mistakes = [];
  state.reviewMode = false;
  state.selected = false;
  updateStats();
  if (typeof hideStudyCountsSummary === 'function') hideStudyCountsSummary();
}

function hideBackToSettingsButton() {
  if (els.backToSettingsButton) {
    els.backToSettingsButton.hidden = true;
  }
}

function showBackToSettingsButton() {
  if (els.backToSettingsButton) {
    els.backToSettingsButton.hidden = false;
  }
}

function scrollToQuizSettings() {
  const target = document.getElementById('settingsTitle') || document.querySelector('.quiz-settings');
  if (!target) return;
  target.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
  hideBackToSettingsButton();
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
    const fallback = availableCount >= Number(DEFAULT_QUESTION_COUNT) ? DEFAULT_QUESTION_COUNT : 'all';
    els.questionCount.value = fallback;
    saveStoredString(QUESTION_COUNT_STORAGE_KEY, fallback);
  }
}

function getConfiguredQuestionCount() {
  const filteredCount = getFilteredQuestionPool().length;
  if (els.questionCount.value === 'all') return filteredCount;
  return Math.min(Number(els.questionCount.value), filteredCount);
}

function cloneQuestionForSession(question) {
  return {
    ...question,
    choices: shuffle(question.choices),
  };
}

function beginConfiguredSession() {
  initializeSpeech();
  hideBackToSettingsButton();
  if (getFilteredQuestionPool().length === 0) {
    updateStartButtonForFilteredCount(0);
    return;
  }

  resetSessionStats();
  const random = els.randomOrder.checked;
  const requestedCount = getConfiguredQuestionCount();
  const filteredPool = getFilteredQuestionPool();
  const orderedPool = random ? shuffle(filteredPool) : [...filteredPool];
  state.questions = orderedPool.slice(0, requestedCount).map(cloneQuestionForSession);

  const countLabel = els.questionCount.value === 'all' ? '全問' : `${requestedCount}問`;
  const orderLabel = random ? 'ランダム' : '元の順番';
  els.settingsStatus.textContent = `選択範囲の全${filteredPool.length}問から、${orderLabel}で${countLabel}を出題します。`;
  showQuestion();
}

function getNoDataMessage(mode = state.mode) {
  if (mode === 'phrase') return '文節和訳データがありません';
  if (mode === 'chunk') return 'チャンクデータがありません';
  if (mode === 'definition') return '英文和訳データがありません';
  if (mode === 'word') return '英単語データがありません';
  return '出題できる問題がありません。';
}

function showEmptyState() {
  cancelSpeech();
  state.questions = [];
  state.index = 0;
  els.progressLabel.textContent = '0 / 0';
  els.questionText.textContent = getNoDataMessage();
  els.choices.innerHTML = '';
  els.feedback.textContent = '正解と3つの誤答選択肢がそろっている行だけを出題します。';
  els.feedback.className = 'feedback';
  els.feedback.hidden = false;
  els.nextButton.disabled = true;
  hideBackToSettingsButton();
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
  const filteredCount = refreshQuestionCountOptionsForLevelRange();

  if (state.questionPool.length === 0) {
    showEmptyState();
    return;
  }

  if (filteredCount === 0) {
    state.questions = [];
    els.progressLabel.textContent = '0 / 0';
    els.questionText.textContent = '選択したレベル範囲に出題できる問題がありません。';
    els.choices.innerHTML = '';
    els.feedback.hidden = true;
    els.nextButton.disabled = true;
    hideBackToSettingsButton();
    updateStartButtonForFilteredCount(0);
    updateModeUi();
    updateSpeakButton();
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

const LEGACY_SHARED_QUESTIONS_WARNING = '保存済みの共通問題データは旧形式のため使用できません。\n新形式の4シートExcelをアップロードしてください。\n現在は標準サンプルデータを表示しています。';

function normalizeApiMode(value) {
  const raw = String(value || '').trim();
  if (raw === 'vocabulary') return 'word';
  if (raw === 'sentence' || raw === 'translation') return 'definition';
  return raw;
}

function isSharedPayloadForMode(payload, requestedMode) {
  const payloadMode = normalizeApiMode(payload?.mode || payload?.type || requestedMode);
  return payloadMode === requestedMode;
}

async function fetchSharedQuestions(mode) {
  const response = await fetch(`${API_BASE}/api/questions/current?mode=${encodeURIComponent(mode)}`, { cache: 'no-store' });
  let payload = null;
  try {
    payload = await response.json();
  } catch (error) {
    if (response.ok) throw error;
  }
  if (!response.ok) {
    const error = new Error(payload?.error || `${response.status} ${response.statusText}`);
    error.status = response.status;
    error.payload = payload;
    error.legacy = payload?.legacy === true;
    throw error;
  }
  if (!payload?.ok || !Array.isArray(payload.rows)) throw new Error(payload?.error || '共通問題データの形式が不正です。');
  if (!isSharedPayloadForMode(payload, mode)) throw new Error(`共通問題データのモードが不一致です（要求: ${mode} / 応答: ${payload.mode || payload.type || '未設定'}）。`);
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

  const localRows = state.localModeRows[mode];
  if (localRows) {
    applyQuestions(localRows, 'アップロードExcelブック', { message: `Excelブックから読み込みました：${getWorkbookSummaryText(state.localModeRows)}` });
    return;
  }

  try {
    const shared = await fetchSharedQuestions(mode);
    if (loadToken !== state.loadToken || state.mode !== mode) return;
    applyQuestions(shared.rows, '共通問題データ', { message: `共通問題データから${shared.rows.length}問を読み込みました` });
  } catch (sharedError) {
    try {
      const rows = await loadStandardCsv(mode);
      if (loadToken !== state.loadToken || state.mode !== mode) return;
      const fallbackMessage = sharedError.legacy
        ? LEGACY_SHARED_QUESTIONS_WARNING
        : `標準CSVから${rows.length}問を読み込みました`;
      applyQuestions(rows, '標準CSV', { message: fallbackMessage });
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

async function uploadOfficialWorkbook(file) {
  const formData = new FormData();
  formData.append('file', file, file.name || 'study-app-workbook.xlsx');
  const response = await fetch(`${API_BASE}/api/questions/upload-workbook`, { method: 'POST', body: formData });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.ok) {
    if (Array.isArray(result.errors)) showUploadValidationErrors(result);
    throw new Error(result.error || `${response.status} ${response.statusText}`);
  }
  return result;
}

async function handleMultiModeWorkbookUpload(file, parsed) {
  const validation = validateOfficialWorkbookRows(parsed.modeRows);
  if (validation.errors.length) {
    showUploadValidationErrors({ errors: validation.errors.slice(0, MAX_SHOWN_UPLOAD_ERRORS), errorCount: validation.errorCount, shownErrorCount: validation.shownErrorCount, moreErrorCount: validation.moreErrorCount });
    throw new Error(`アップロード検証エラーが${validation.errorCount}件あります。`);
  }
  const modeRows = validation.playableRows;
  clearUploadValidationErrors();
  state.localModeRows = modeRows;
  let saveMessage = '共通問題データを4モード一括保存しました。PC・iPhone共通で利用できます';
  try {
    await uploadOfficialWorkbook(file);
    for (const mode of Object.keys(modeRows)) {
      cacheSharedQuestions(mode, { ok: true, mode, rows: modeRows[mode] || [], count: (modeRows[mode] || []).length, filename: file.name || 'study-app-workbook.xlsx' });
    }
  } catch (error) {
    saveMessage = `${serverSaveUnavailableMessage()}サーバー保存には失敗しましたが、一時確認用に読み込みました。API: /api/questions/upload-workbook 理由: ${error.message}`;
  }

  state.mode = parsed.activeMode || state.mode;
  updateModeUi();
  const summary = getWorkbookSummaryText(modeRows);
  applyQuestions(modeRows[state.mode] || [], 'アップロードExcelブック', { message: `Excelブックから読み込みました：${summary}。${saveMessage}` });
}

async function handleUpload(event) {
  const [file] = event.target.files;
  if (!file) return;
  const uploadMode = state.mode;
  state.loadToken += 1;
  clearUploadValidationErrors();
  setLoadingState('ファイルを読み込み中...');

  let parsedRows = null;

  try {
    const extension = file.name.split('.').pop().toLowerCase();
    const parsed = /^(xlsx|xls)$/i.test(extension)
      ? parseWorkbookModeRows(await file.arrayBuffer(), uploadMode, { officialOnly: true })
      : { type: 'single', rows: parseCsv(decodeText(await file.arrayBuffer())) };

    if (parsed.type === 'multiMode') {
      await handleMultiModeWorkbookUpload(file, parsed);
      return;
    }

    const rows = parsed.rows;
    parsedRows = rows;
    state.localModeRows = {};

    state.mode = uploadMode;
    updateModeUi();
    applyQuestions(rows, 'アップロードファイル', { message: '単一CSV/単一シートExcelは一時確認用として読み込みました。共通保存は行いません。正式保存は4シート.xlsxを使用してください。' });
  } catch (error) {
    if (parsedRows) {
      state.localModeRows = {};
      state.mode = uploadMode;
      updateModeUi();
      applyQuestions(parsedRows, 'アップロードファイル', {
        message: `${serverSaveUnavailableMessage()}サーバー保存には失敗しましたが、一時確認用に${parsedRows.length}行を読み込みました。API: /api/questions/upload-workbook 理由: ${error.message}`,
      });
    } else {
      els.questionText.textContent = 'アップロードファイルの読み込みに失敗しました。';
      els.feedback.textContent = error.message;
      els.feedback.className = 'feedback wrong';
      els.feedback.hidden = false;
      els.uploadStatus.textContent = `${serverSaveUnavailableMessage()}アップロードに失敗しました。API: /api/questions/upload-workbook 理由: ${error.message}`;
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
  getQuizCardElement()?.classList.toggle('mode-phrase', state.mode === 'phrase');
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
  hideBackToSettingsButton();
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
  const learningStat = getLearningStat(current);
  if (els.weakChecked) {
    els.weakChecked.checked = Boolean(learningStat.weak_checked);
    els.weakChecked.disabled = false;
  }
  els.feedback.className = 'feedback';
  els.feedback.textContent = `問題ID: ${current.questionKey || current.id} / レベル: ${current.level || '未設定'} / 学習履歴: 正解 ${learningStat.total_correct}・不正解 ${learningStat.total_wrong}・累計正解率 ${learningStat.accuracy}%・直近10回 ${learningStat.recent10_accuracy}%`;
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
  if (autoSpeakEnabled) {
    speakCurrentQuestion({ statusPrefix: '自動読上げ：' }).catch((error) => {
      console.warn('Auto speak failed:', error);
    });
  } else {
    setVoiceStatusMessage('自動読上げOFF');
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
  updateLearningStat(current, isCorrect);
  incrementStudyCount();

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
  renderStudyCountsSummary();
  els.feedback.hidden = false;
  els.nextButton.disabled = true;
  els.nextButton.textContent = '次の問題へ';
  showBackToSettingsButton();
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
els.backToSettingsButton?.addEventListener('click', scrollToQuizSettings);
els.weakChecked?.addEventListener('change', () => {
  const current = state.questions[state.index];
  if (current) setWeakChecked(current, els.weakChecked.checked);
});
els.clearLearningStatsButton?.addEventListener('click', () => {
  if (clearLearningStatsWithConfirm()) showQuestion();
});

setupQuestionCountSetting();
setupLevelRangeSetting();
setupAutoSpeakSetting();
setupSoundSetting();
setupVoiceSelect();
setupAudioUnlock();
updateHostingStatus();
readLearningStats();
loadMode(state.mode);
