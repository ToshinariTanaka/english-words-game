const INITIAL_HP = 100;
const HOSPITAL_GOLD_PENALTY = 200;
const AUTO_NEXT_MIN_MS = 100;
const AUTO_NEXT_MAX_MS = 3000;
const REVIEW_START_DELAY_MS = 3000;
const GAME_VERSION = "v0.9.7";
const DEFAULT_WORDS_PATH = "./data/default-words.csv";
const UPLOADED_WORDS_STORAGE_KEY = "englishWordsGameUploadedWordsCsv";
const GOLD_STORAGE_KEY = "englishWordsGameGold";
const QUESTION_MODES = {
  meaning: {
    label: "日本語訳モード",
    promptKey: "word",
    answerKey: "meaning",
    goldMultiplier: 1,
  },
  definition: {
    label: "英英辞典モード",
    promptKey: "word",
    answerKey: "definition",
    goldMultiplier: 2,
    minRequiredMessage: "英英辞典モードでは4語以上の definition が必要です。",
  },
  chunk: {
    label: "チャンクモード",
    promptKey: "chunk",
    answerKey: "chunk_meaning",
    goldMultiplier: 1.5,
    minRequiredMessage: "チャンクモードでは4件以上の chunk と chunk_meaning が必要です。",
  },
};

const WORDBOOK_CATEGORIES = {
  standard: "重要英単語",
  schoolTest: "定期試験対策",
  eiken: "英検対策",
  sample: "サンプル",
  user: "ユーザー単語帳",
};

const BUILTIN_WORDBOOKS = {
  important100: {
    label: "英単語100語",
    category: "standard",
    path: "data/english_words_game_100.csv",
  },
  important5000: {
    label: "重要英単語5000",
    category: "standard",
    path: "data/important_5000_master.csv",
  },
  important12000: {
    label: "重要英単語12000",
    category: "standard",
    disabled: true,
  },
  kai1: {
    label: "開隆堂 中1",
    category: "schoolTest",
    disabled: true,
  },
  kai2: {
    label: "開隆堂 中2",
    category: "schoolTest",
    disabled: true,
  },
  kai3: {
    label: "開隆堂 中3",
    category: "schoolTest",
    disabled: true,
  },
  eiken3: {
    label: "英検3級",
    category: "eiken",
    disabled: true,
  },
  eikenPre2: {
    label: "英検準2級",
    category: "eiken",
    disabled: true,
  },
  eiken2: {
    label: "英検2級",
    category: "eiken",
    disabled: true,
  },
  sample10: {
    label: "サンプル10語",
    category: "sample",
    csv: `word,meaning,level,definition\ndog,犬,1,a common animal that people often keep as a pet\ncat,猫,1,a small animal with soft fur that people often keep as a pet\nrecommend,勧める・推薦する,12,to tell someone that something is good or useful\npurchase,購入する,12,to buy something\nwrite,書く,5,to make words or letters on paper or a screen\nsummarize,要約する,20,to explain the main points in a short way\nconservation,保護・保存,80,the protection of nature, resources, or old things\nconsumption,消費,75,the act of using goods, energy, or resources\ncivilization,文明,85,a society with developed culture, government, and technology\nconversation,会話,70,a talk between two or more people`,
  },
};

const screens = {
  home: document.getElementById("home-screen"),
  battle: document.getElementById("battle-screen"),
  result: document.getElementById("result-screen"),
  gameclear: document.getElementById("gameclear-screen"),
  gameover: document.getElementById("gameover-screen"),
};

const el = {
  csvFile: document.getElementById("csv-file"),
  dataSourceStatus: document.getElementById("data-source-status"),
  resetUploadedDataBtn: document.getElementById("reset-uploaded-data-btn"),
  loadWordbookBtn: document.getElementById("load-wordbook-btn"),
  wordbookCategory: document.getElementById("wordbook-category"),
  wordbookSelect: document.getElementById("wordbook-select"),
  startBtn: document.getElementById("start-btn"),
  questionCount: document.getElementById("question-count"),
  questionMode: document.getElementById("question-mode"),
  homeMessage: document.getElementById("home-message"),
  versionLabel: document.getElementById("version-label"),
  hp: document.getElementById("hp"),
  gold: document.getElementById("gold"),
  kills: document.getElementById("kills"),
  encounter: document.getElementById("encounter"),
  targetWord: document.getElementById("target-word"),
  hintBtn: document.getElementById("hint-btn"),
  hintMessage: document.getElementById("hint-message"),
  choices: document.getElementById("choices"),
  resultMessage: document.getElementById("result-message"),
  answerMessage: document.getElementById("answer-message"),
  feedbackOverlay: document.getElementById("feedback-overlay"),
  feedbackCard: document.getElementById("feedback-card"),
  feedbackIcon: document.getElementById("feedback-icon"),
  feedbackTitle: document.getElementById("feedback-title"),
  feedbackSubText: document.getElementById("feedback-subtext"),
  feedbackGold: document.getElementById("feedback-gold"),
  feedbackAnswer: document.getElementById("feedback-answer"),
  nextBtn: document.getElementById("next-btn"),
  clearMessage: document.getElementById("clear-message"),
  clearScore: document.getElementById("clear-score"),
  clearRetryBtn: document.getElementById("clear-retry-btn"),
  finalScore: document.getElementById("final-score"),
  retryBtn: document.getElementById("retry-btn"),
};

let words = [];
let current = null;
let hp = INITIAL_HP;
let gold = loadStoredGold();
let kills = 0;
let answeredCount = 0;
let targetQuestionCount = 0;
let previousWord = null;
let gameDeck = [];
let reviewDeck = [];
let wrongWordMap = new Map();
let isReviewMode = false;
let currentQuestionMode = "meaning";
let normalAnsweredCount = 0;
let normalCorrectCount = 0;
let normalWrongCount = 0;
let reviewAnsweredCount = 0;
let reviewCorrectCount = 0;
let reviewWrongCount = 0;
let autoNextTimer = null;
let audioContext = null;
let currentHintUsed = false;

function showScreen(name) {
  Object.values(screens).forEach((screen) => screen.classList.remove("active"));
  screens[name].classList.add("active");
}

function clearAutoNextTimer() {
  if (autoNextTimer) {
    clearTimeout(autoNextTimer);
    autoNextTimer = null;
  }
}

function getAutoNextDelay() {
  const span = AUTO_NEXT_MAX_MS - AUTO_NEXT_MIN_MS;
  return AUTO_NEXT_MIN_MS + Math.floor(Math.random() * (span + 1));
}

function scheduleAutoNext(callback = nextQuestion, delay = getAutoNextDelay()) {
  clearAutoNextTimer();
  autoNextTimer = setTimeout(() => {
    autoNextTimer = null;
    callback();
  }, delay);
}

function loadStoredGold() {
  const stored = Number(localStorage.getItem(GOLD_STORAGE_KEY));
  return Number.isFinite(stored) && stored >= 0 ? stored : 0;
}

function saveGold() {
  localStorage.setItem(GOLD_STORAGE_KEY, String(gold));
}

function normalizeHeader(value) {
  return String(value || "")
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

function parseCsvRows(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  const source = String(text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    const next = source[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        cell += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(cell.trim());
      cell = "";
      continue;
    }

    if (char === "\n" && !inQuotes) {
      row.push(cell.trim());
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  row.push(cell.trim());
  if (row.some((value) => value !== "")) rows.push(row);

  return rows;
}

const LEVEL_TO_GOLD = { A1: 1, A2: 2, B1: 4, B2: 8, C1: 16, C2: 32 };

function normalizeLevel(value) {
  const key = String(value || "").trim().toUpperCase();
  return LEVEL_TO_GOLD[key] ? key : "A1";
}

function safeGold(value, level) {
  const n = Number(value);
  if (Number.isFinite(n) && n > 0) return n;
  return LEVEL_TO_GOLD[normalizeLevel(level)] || 1;
}

function getBaseGold(word) {
  return safeGold(word?.gold, word?.level);
}

function parseCsv(text) {
  const rows = parseCsvRows(text);
  if (rows.length < 2) return [];

  const [rawHeaders, ...dataRows] = rows;
  const headers = rawHeaders.map(normalizeHeader);
  const has = (name) => headers.includes(normalizeHeader(name));

  const format = has("word") && has("gold") && has("chunk1")
    ? "new"
    : has("word") && has("chunk")
      ? "old"
      : has("英単語") && has("和訳")
        ? "ja_special"
        : "old";

  const toWord = (values) => {
    let word = ""; let meaning = ""; let goldRaw = ""; let levelRaw = "";
    let chunk1 = ""; let chunk1Meaning = ""; let chunk2 = ""; let chunk2Meaning = ""; let chunk3 = ""; let chunk3Meaning = "";
    let definition = ""; let definitionMeaning = ""; let status = ""; let note = ""; let checkedAt = "";

    const get = (i) => (values[i] || "").trim();

    if (format === "new") {
      const idx = Object.fromEntries(headers.map((h, i) => [h, i]));
      word = get(idx.word); meaning = get(idx.meaning); goldRaw = get(idx.gold); levelRaw = get(idx.level);
      chunk1 = get(idx.chunk1); chunk1Meaning = get(idx.chunk1_meaning); chunk2 = get(idx.chunk2); chunk2Meaning = get(idx.chunk2_meaning);
      chunk3 = get(idx.chunk3); chunk3Meaning = get(idx.chunk3_meaning);
      definition = get(idx.definition); definitionMeaning = get(idx.definition_meaning);
      status = get(idx.status); note = get(idx.note); checkedAt = get(idx.checked_at);
    } else if (format === "old") {
      const idx = Object.fromEntries(headers.map((h, i) => [h, i]));
      word = get(idx.word ?? 0); meaning = get(idx.meaning ?? 1); levelRaw = get(idx.level ?? 2);
      chunk1 = get(idx.chunk); chunk1Meaning = get(idx.chunk_meaning);
      definition = get(idx.definition); definitionMeaning = get(idx.definition_meaning);
      status = get(idx.status); note = get(idx.note); checkedAt = get(idx.checked_at);
    } else {
      word = get(0); meaning = get(1); goldRaw = get(2);
      chunk1 = get(3); chunk1Meaning = get(4); chunk2 = get(5); chunk2Meaning = get(6); chunk3 = get(7); chunk3Meaning = get(8);
      levelRaw = get(10); definition = get(11); definitionMeaning = get(12);
    }

    const level = normalizeLevel(levelRaw);
    const gold = safeGold(goldRaw, level);
    const chunks = [
      { text: chunk1, meaning: chunk1Meaning },
      { text: chunk2, meaning: chunk2Meaning },
      { text: chunk3, meaning: chunk3Meaning },
    ].filter((c) => c.text);

    return {
      word, meaning, gold, level,
      chunk: chunk1,
      chunk_meaning: chunk1Meaning,
      chunks,
      definition,
      definition_meaning: definitionMeaning,
      definitionMeaning,
      status,
      note,
      checkedAt,
    };
  };

  return dataRows.map(toWord).filter((item) => item.word && item.word !== "#VALUE!");
}

function shuffle(arr) {
  const copied = [...arr];
  for (let i = copied.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copied[i], copied[j]] = [copied[j], copied[i]];
  }
  return copied;
}

function chooseRandomItems(pool, count) {
  return shuffle(pool).slice(0, count);
}

function getModeConfig() {
  return QUESTION_MODES[currentQuestionMode] || QUESTION_MODES.meaning;
}

function getPromptValue(item) {
  return (item?.[getModeConfig().promptKey] || "").trim();
}

function getAnswerValue(item) {
  return (item?.[getModeConfig().answerKey] || "").trim();
}

function getPlayableWords(mode = currentQuestionMode) {
  const config = QUESTION_MODES[mode] || QUESTION_MODES.meaning;
  return words.filter((item) => (item?.[config.promptKey] || "").trim() && (item?.[config.answerKey] || "").trim());
}

function getEarnedGold(word) {
  const baseGold = getBaseGold(word);
  let earnedGold = baseGold;
  if (currentQuestionMode === "definition") earnedGold = baseGold * 2;
  else if (currentQuestionMode === "chunk") earnedGold = Math.floor(baseGold * 1.5);
  if (currentQuestionMode === "definition" && currentHintUsed) earnedGold = Math.floor(earnedGold / 2);
  return Math.floor(earnedGold);
}

function shouldShowHintButton() {
  return currentQuestionMode === "definition";
}

function resetHintState() {
  currentHintUsed = false;
  if (el.hintMessage) el.hintMessage.textContent = "";
  if (!el.hintBtn) return;
  const visible = shouldShowHintButton();
  el.hintBtn.hidden = !visible;
  el.hintBtn.disabled = !visible;
}

function useHint() {
  if (!current || !shouldShowHintButton() || !el.hintBtn || !el.hintMessage) return;
  currentHintUsed = true;
  el.hintMessage.textContent = `ヒント：${current.meaning || "（日本語訳なし）"}`;
  el.hintBtn.disabled = true;
}

function addUniqueAnswers(picks, items, limit) {
  for (const item of items) {
    if (picks.length >= limit) break;
    const answer = getAnswerValue(item);
    if (answer && !picks.includes(answer)) picks.push(answer);
  }
}

function generateChoices(target) {
  const targetAnswer = getAnswerValue(target);
  const basePool = words.filter((w) => {
    const answer = getAnswerValue(w);
    return w.word !== target.word && answer && answer !== targetAnswer;
  });

  const uniqueMap = new Map();
  for (const item of basePool) {
    const answer = getAnswerValue(item);
    if (!uniqueMap.has(answer)) uniqueMap.set(answer, item);
  }
  const uniquePool = [...uniqueMap.values()];

  const nearPool = uniquePool.filter(
    (item) => Math.abs(getBaseGold(item) - getBaseGold(target)) <= 2
  );
  const mediumPool = uniquePool.filter(
    (item) => Math.abs(getBaseGold(item) - getBaseGold(target)) > 2 && Math.abs(getBaseGold(item) - getBaseGold(target)) <= 8
  );
  const farPool = uniquePool.filter(
    (item) => Math.abs(getBaseGold(item) - getBaseGold(target)) > 8
  );

  const picks = [];
  addUniqueAnswers(picks, chooseRandomItems(nearPool, 3), 3);
  addUniqueAnswers(picks, chooseRandomItems(mediumPool, 3), 3);
  addUniqueAnswers(picks, chooseRandomItems(farPool, 3), 3);
  addUniqueAnswers(picks, chooseRandomItems(uniquePool, uniquePool.length), 3);

  return shuffle([targetAnswer, ...picks]).map((answer) => ({
    answer,
    isCorrect: answer === targetAnswer,
  }));
}

function updateStatus() {
  el.hp.textContent = hp;
  el.gold.textContent = gold;
  el.kills.textContent = kills;
}

function updateVersionLabel() {
  if (el.versionLabel) el.versionLabel.textContent = GAME_VERSION;
}

function setDataSourceStatus(message) {
  if (el.dataSourceStatus) el.dataSourceStatus.textContent = message;
}

function saveUploadedWordsCsv(csvText) {
  localStorage.setItem(UPLOADED_WORDS_STORAGE_KEY, csvText);
}

function loadStoredUploadedWordsCsv() {
  return localStorage.getItem(UPLOADED_WORDS_STORAGE_KEY) || "";
}

function clearStoredUploadedWordsCsv() {
  localStorage.removeItem(UPLOADED_WORDS_STORAGE_KEY);
}

function getSelectedQuestionCount() {
  const playableWords = getPlayableWords();
  if (!el.questionCount || el.questionCount.value === "all") return playableWords.length;
  const selected = Number(el.questionCount.value);
  if (!Number.isFinite(selected) || selected <= 0) return playableWords.length;
  return Math.min(selected, playableWords.length);
}

function getSelectedQuestionMode() {
  const selected = el.questionMode?.value || "meaning";
  return QUESTION_MODES[selected] ? selected : "meaning";
}

function getAudioContext() {
  if (!window.AudioContext && !window.webkitAudioContext) return null;
  if (!audioContext) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    audioContext = new AudioContextClass();
  }
  return audioContext;
}

function playTone(frequency, startTime, duration, type = "sine", volume = 0.24) {
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

function playCorrectSound() {
  const ctx = getAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  playTone(523.25, now, 0.18, "sine", 0.28);
  playTone(659.25, now + 0.08, 0.2, "triangle", 0.24);
  playTone(783.99, now + 0.16, 0.24, "sine", 0.28);
  playTone(1046.5, now + 0.28, 0.35, "triangle", 0.18);
}

function playWrongSound() {
  const ctx = getAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  playTone(220, now, 0.15, "sawtooth", 0.18);
  playTone(146.83, now + 0.12, 0.2, "sawtooth", 0.18);
}

function speakWord(word) {
  if (!word || !("speechSynthesis" in window)) return;
  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(word);
    utterance.lang = "en-US";
    utterance.rate = 0.85;
    window.speechSynthesis.speak(utterance);
  } catch (error) {
    console.warn("Speech synthesis failed:", error);
  }
}

function chooseNextWord() {
  const deck = isReviewMode ? reviewDeck : gameDeck;
  if (!deck || deck.length === 0) return null;
  const selected = deck.shift();
  if (!selected) return null;
  previousWord = selected.word;
  return selected;
}

function showRoundSummary() {
  const modeLabel = getModeConfig().label;
  showScreen("gameclear");
  el.clearMessage.textContent = wrongWordMap.size > 0
    ? `1周目が終わりました。${modeLabel}で間違えた問題を復習します。`
    : `今回の英単語モンスターをすべて討伐しました！（${modeLabel}）`;
  el.clearScore.textContent =
    `モード: ${modeLabel}\n` +
    `1周目: ${normalCorrectCount}問正解 / ${normalAnsweredCount}問中 / 誤答 ${normalWrongCount}問\n` +
    `現在Gold: ${gold} / 残りHP: ${hp}`;

  if (wrongWordMap.size > 0) {
    reviewDeck = shuffle([...wrongWordMap.values()]);
    scheduleAutoNext(startReviewMode, REVIEW_START_DELAY_MS);
  }
}

function startReviewMode() {
  isReviewMode = true;
  current = null;
  nextQuestion();
}

function showFinalClear() {
  const modeLabel = getModeConfig().label;
  showScreen("gameclear");
  const reviewText = normalWrongCount > 0
    ? `復習: ${reviewCorrectCount}問正解 / ${reviewAnsweredCount}回解答 / 復習中の誤答 ${reviewWrongCount}回\n`
    : "復習: 誤答なし\n";
  el.clearMessage.textContent = "ゲームクリア！間違えた問題もすべて正解しました。";
  el.clearScore.textContent =
    `モード: ${modeLabel}\n` +
    `1周目: ${normalCorrectCount}問正解 / ${normalAnsweredCount}問中 / 誤答 ${normalWrongCount}問\n` +
    reviewText +
    `現在Gold: ${gold} / 残りHP: ${hp}`;
}

function sendToHospital() {
  clearAutoNextTimer();
  const goldBeforePenalty = gold;
  gold = Math.max(0, gold - HOSPITAL_GOLD_PENALTY);
  saveGold();
  updateStatus();
  el.finalScore.textContent =
    `HPが0になったため病院送りです。\n` +
    `治療費として ${HOSPITAL_GOLD_PENALTY} gold を失いました。\n` +
    `Gold: ${goldBeforePenalty} → ${gold}\n` +
    `討伐数: ${kills} / 解答数: ${answeredCount}`;
  showScreen("gameover");
}

function nextQuestion() {
  clearAutoNextTimer();

  if (isReviewMode) {
    if (reviewDeck.length === 0) {
      showFinalClear();
      return;
    }
  } else if (normalAnsweredCount >= targetQuestionCount || gameDeck.length === 0) {
    showRoundSummary();
    return;
  }

  current = chooseNextWord();
  if (!current) {
    if (isReviewMode) showFinalClear();
    else showRoundSummary();
    return;
  }

  const reviewPrefix = isReviewMode ? "復習: " : "";
  resetHintState();
  const currentPrompt = getPromptValue(current);
  el.encounter.textContent = `${reviewPrefix}${currentPrompt} が現れた！（${getModeConfig().label}）`;
  el.targetWord.textContent = currentPrompt;
  if (getModeConfig().promptKey === "word") speakWord(currentPrompt);
  el.choices.innerHTML = "";
  const choices = generateChoices(current);
  choices.forEach((choice, idx) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "choice-btn";
    btn.textContent = `${idx + 1}. ${choice.answer}`;
    btn.addEventListener("click", () => judgeAnswer(choice));
    el.choices.appendChild(btn);
  });
  showScreen("battle");
}

function judgeAnswer(choice) {
  answeredCount += 1;

  if (isReviewMode) reviewAnsweredCount += 1;
  else normalAnsweredCount += 1;

  if (choice.isCorrect) {
    playCorrectSound();
    const earnedGold = getEarnedGold(current);
    gold += earnedGold;
    saveGold();
    kills += 1;
    if (isReviewMode) {
      reviewCorrectCount += 1;
      wrongWordMap.delete(current.word);
      el.resultMessage.textContent = currentHintUsed
        ? `復習成功！ ${getPromptValue(current)} を倒した！ ヒント使用のため +${earnedGold} gold`
        : `復習成功！ ${getPromptValue(current)} を倒した！ +${earnedGold} gold`;
    } else {
      normalCorrectCount += 1;
      el.resultMessage.textContent = currentHintUsed
        ? `${getPromptValue(current)} を倒した！ ヒント使用のため +${earnedGold} gold`
        : `${getPromptValue(current)} を倒した！ +${earnedGold} gold`;
    }
    el.answerMessage.textContent = "";
    updateFeedbackOverlay({
      isCorrect: true,
      title: "✅ 正解！",
      subText: isReviewMode ? "復習バトル勝利！" : "モンスター討伐成功！",
      goldText: `+${earnedGold} Gold`,
      answerText: "",
    });
  } else {
    playWrongSound();
    const damage = getBaseGold(current);
    hp = Math.max(0, hp - damage);
    if (isReviewMode) {
      reviewWrongCount += 1;
      reviewDeck.push(current);
      el.resultMessage.textContent = `復習: ${current.word} の攻撃！ -${damage} HP`;
    } else {
      normalWrongCount += 1;
      wrongWordMap.set(current.word, current);
      el.resultMessage.textContent = `${current.word} の攻撃！ -${damage} HP`;
    }
    el.answerMessage.textContent = `正解: ${getAnswerValue(current)}`;
    updateFeedbackOverlay({
      isCorrect: false,
      title: "❌ 不正解！",
      subText: `しまった！ ライフ -${damage}`,
      goldText: "",
      answerText: `正解：${getAnswerValue(current)}`,
    });
  }

  updateStatus();

  if (hp <= 0) {
    sendToHospital();
    return;
  }

  showScreen("result");
  scheduleAutoNext();
}

function updateFeedbackOverlay({ isCorrect, title, subText, goldText, answerText }) {
  if (!el.feedbackOverlay) return;
  el.feedbackOverlay.classList.remove("correct", "incorrect", "feedbackPop", "feedbackShake");
  void el.feedbackOverlay.offsetWidth;
  el.feedbackOverlay.classList.add(isCorrect ? "correct" : "incorrect");
  el.feedbackOverlay.classList.add(isCorrect ? "feedbackPop" : "feedbackShake");
  el.feedbackIcon.textContent = isCorrect ? "✅" : "❌";
  el.feedbackTitle.textContent = title;
  el.feedbackSubText.textContent = subText || "";
  el.feedbackGold.textContent = goldText || "";
  el.feedbackAnswer.textContent = answerText || "";
}

function startGame() {
  clearAutoNextTimer();
  currentQuestionMode = getSelectedQuestionMode();
  const playableWords = getPlayableWords(currentQuestionMode);
  if (playableWords.length < 4) {
    el.homeMessage.textContent = getModeConfig().minRequiredMessage || "このモードでは4語以上の有効なデータが必要です。";
    el.startBtn.disabled = true;
    return;
  }

  hp = INITIAL_HP;
  kills = 0;
  answeredCount = 0;
  normalAnsweredCount = 0;
  normalCorrectCount = 0;
  normalWrongCount = 0;
  reviewAnsweredCount = 0;
  reviewCorrectCount = 0;
  reviewWrongCount = 0;
  wrongWordMap = new Map();
  reviewDeck = [];
  isReviewMode = false;
  previousWord = null;
  resetHintState();
  targetQuestionCount = getSelectedQuestionCount();
  gameDeck = shuffle(playableWords).slice(0, targetQuestionCount);
  updateStatus();
  nextQuestion();
}

function populateCategorySelect() {
  if (!el.wordbookCategory) return;
  el.wordbookCategory.innerHTML = "";
  Object.entries(WORDBOOK_CATEGORIES).forEach(([value, label]) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    el.wordbookCategory.appendChild(option);
  });
}

function populateWordbookSelect(category) {
  if (!el.wordbookSelect) return;
  el.wordbookSelect.innerHTML = "";

  if (category === "user") {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "保存済み単語帳はまだありません。";
    option.disabled = true;
    option.selected = true;
    el.wordbookSelect.appendChild(option);
    el.homeMessage.textContent = "保存済み単語帳はまだありません。";
    el.loadWordbookBtn.disabled = true;
    return;
  }

  const entries = Object.entries(BUILTIN_WORDBOOKS).filter(
    ([, wordbook]) => wordbook.category === category
  );

  if (entries.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "このカテゴリの単語帳はまだありません。";
    option.disabled = true;
    option.selected = true;
    el.wordbookSelect.appendChild(option);
    el.loadWordbookBtn.disabled = true;
    return;
  }

  entries.forEach(([key, wordbook]) => {
    const option = document.createElement("option");
    option.value = key;
    option.textContent = wordbook.disabled ? `${wordbook.label}（準備中）` : wordbook.label;
    el.wordbookSelect.appendChild(option);
  });
  el.loadWordbookBtn.disabled = false;
}

async function loadBuiltinWordBook() {
  clearAutoNextTimer();
  const selectedKey = el.wordbookSelect?.value;
  const wordbook = BUILTIN_WORDBOOKS[selectedKey];
  if (!wordbook) {
    el.homeMessage.textContent = "単語帳を選択してください。";
    el.startBtn.disabled = true;
    return;
  }
  if (wordbook.disabled) {
    el.homeMessage.textContent = "この単語帳は現在準備中です。";
    el.startBtn.disabled = true;
    return;
  }
  if (wordbook.csv) {
    loadWordsFromCsv(wordbook.csv);
    return;
  }
  try {
    const response = await fetch(wordbook.path);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const csvText = await response.text();
    loadWordsFromCsv(csvText);
  } catch (error) {
    console.error("Failed to load built-in word book:", error);
    el.homeMessage.textContent = "内蔵単語帳の読み込みに失敗しました。";
    el.startBtn.disabled = true;
  }
}

function loadWordsFromCsv(csvText, messageBuilder) {
  clearAutoNextTimer();
  const parsed = parseCsv(csvText);
  if (parsed.length < 4) {
    el.homeMessage.textContent =
      "4語以上の有効なデータが必要です。対応列名: word/meaning/level/chunk/chunk_meaning/definition/definition_meaning。使わない列は無視します。";
    el.startBtn.disabled = true;
    return;
  }
  words = parsed;
  gameDeck = [];
  reviewDeck = [];
  wrongWordMap = new Map();
  isReviewMode = false;
  previousWord = null;
  answeredCount = 0;
  targetQuestionCount = 0;
  normalAnsweredCount = 0;
  normalCorrectCount = 0;
  normalWrongCount = 0;
  reviewAnsweredCount = 0;
  reviewCorrectCount = 0;
  reviewWrongCount = 0;
  resetHintState();
  const definitionCount = getPlayableWords("definition").length;
  const chunkCount = getPlayableWords("chunk").length;
  const definitionText = definitionCount >= 4
    ? ` / 英英辞典モード: ${definitionCount}語対応`
    : " / 英英辞典モード: definition列が4語未満";
  const chunkText = chunkCount >= 4
    ? ` / チャンクモード: ${chunkCount}件対応`
    : " / チャンクモード: chunk と chunk_meaning が4件未満";
  const defaultMessage = `${words.length}語を読み込みました。現在Gold: ${gold}${definitionText}${chunkText}`;
  el.homeMessage.textContent = typeof messageBuilder === "function"
    ? messageBuilder({ count: words.length, definitionText, chunkText, gold })
    : defaultMessage;
  el.startBtn.disabled = false;
}

async function loadDefaultWords() {
  setDataSourceStatus("標準問題ファイルを読み込み中");
  try {
    const response = await fetch(DEFAULT_WORDS_PATH, { cache: "no-cache" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const csvText = await response.text();
    loadWordsFromCsv(csvText, ({ count, definitionText, chunkText }) => {
      const message = `標準問題ファイルを読み込みました：${count}問`;
      setDataSourceStatus(message);
      return `${message}。現在Gold: ${gold}${definitionText}${chunkText}`;
    });
  } catch (error) {
    console.error("Failed to load default words:", error);
    loadWordsFromCsv(BUILTIN_WORDBOOKS.sample10.csv, ({ count, definitionText, chunkText }) => {
      const message = "標準問題ファイルの読み込みに失敗したため、内蔵サンプルを使用中";
      setDataSourceStatus(`${message}：${count}問`);
      return `${message}：${count}問。現在Gold: ${gold}${definitionText}${chunkText}`;
    });
  }
}

async function loadInitialWords() {
  const storedCsv = loadStoredUploadedWordsCsv();
  if (storedCsv) {
    loadWordsFromCsv(storedCsv, ({ count, definitionText, chunkText }) => {
      const message = `アップロード済みデータを使用中：${count}問`;
      setDataSourceStatus(message);
      return `${message}。現在Gold: ${gold}${definitionText}${chunkText}`;
    });
    if (!el.startBtn.disabled) return;
    clearStoredUploadedWordsCsv();
  }
  await loadDefaultWords();
}

async function readUploadedFileAsCsv(file) {
  const fileName = file.name || "";
  const isExcel = /\.(xlsx|xls)$/i.test(fileName);
  if (!isExcel) return file.text();

  if (!window.XLSX) {
    throw new Error("Excelファイルの読み込みライブラリを取得できませんでした。CSVで再アップロードしてください。");
  }

  const buffer = await file.arrayBuffer();
  const workbook = window.XLSX.read(buffer, { type: "array" });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) throw new Error("Excelファイルにシートがありません。");
  return window.XLSX.utils.sheet_to_csv(workbook.Sheets[firstSheetName]);
}

el.csvFile.addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const text = await readUploadedFileAsCsv(file);
    loadWordsFromCsv(text, ({ count, definitionText, chunkText }) => {
      saveUploadedWordsCsv(text);
      const message = `アップロード済みデータを使用中：${count}問`;
      setDataSourceStatus(message);
      return `${message}。現在Gold: ${gold}${definitionText}${chunkText}`;
    });
  } catch (error) {
    console.error("Failed to read uploaded word file:", error);
    el.homeMessage.textContent = error.message || "アップロードファイルの読み込みに失敗しました。";
    setDataSourceStatus("アップロードファイルの読み込みに失敗しました");
  }
});

el.wordbookCategory.addEventListener("change", (event) => {
  clearAutoNextTimer();
  el.homeMessage.textContent = "";
  populateWordbookSelect(event.target.value);
});

el.resetUploadedDataBtn.addEventListener("click", async () => {
  clearAutoNextTimer();
  clearStoredUploadedWordsCsv();
  if (el.csvFile) el.csvFile.value = "";
  await loadDefaultWords();
});
el.loadWordbookBtn.addEventListener("click", loadBuiltinWordBook);
el.startBtn.addEventListener("click", startGame);
el.hintBtn.addEventListener("click", useHint);
el.nextBtn.addEventListener("click", () => {
  clearAutoNextTimer();
  nextQuestion();
});
el.retryBtn.addEventListener("click", () => {
  clearAutoNextTimer();
  resetHintState();
  showScreen("home");
});
el.clearRetryBtn.addEventListener("click", () => {
  clearAutoNextTimer();
  resetHintState();
  showScreen("home");
});

populateCategorySelect();
el.wordbookCategory.value = "standard";
populateWordbookSelect("standard");
resetHintState();
updateVersionLabel();
updateStatus();
loadInitialWords();
