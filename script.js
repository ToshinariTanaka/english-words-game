const INITIAL_HP = 100;
const HOSPITAL_GOLD_PENALTY = 200;
const GAME_VERSION = "v0.8.0";
const GOLD_STORAGE_KEY = "englishWordsGameGold";

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
    csv: `word,meaning,level\ndog,犬,1\ncat,猫,1\nrecommend,勧める・推薦する,12\npurchase,購入する,12\nwrite,書く,5\nsummarize,要約する,20\nconservation,保護・保存,80\nconsumption,消費,75\ncivilization,文明,85\nconversation,会話,70`,
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
  loadWordbookBtn: document.getElementById("load-wordbook-btn"),
  wordbookCategory: document.getElementById("wordbook-category"),
  wordbookSelect: document.getElementById("wordbook-select"),
  startBtn: document.getElementById("start-btn"),
  questionCount: document.getElementById("question-count"),
  homeMessage: document.getElementById("home-message"),
  versionLabel: document.getElementById("version-label"),
  hp: document.getElementById("hp"),
  gold: document.getElementById("gold"),
  kills: document.getElementById("kills"),
  encounter: document.getElementById("encounter"),
  targetWord: document.getElementById("target-word"),
  choices: document.getElementById("choices"),
  resultMessage: document.getElementById("result-message"),
  answerMessage: document.getElementById("answer-message"),
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
let audioContext = null;

function showScreen(name) {
  Object.values(screens).forEach((screen) => screen.classList.remove("active"));
  screens[name].classList.add("active");
}

function loadStoredGold() {
  const stored = Number(localStorage.getItem(GOLD_STORAGE_KEY));
  return Number.isFinite(stored) && stored >= 0 ? stored : 0;
}

function saveGold() {
  localStorage.setItem(GOLD_STORAGE_KEY, String(gold));
}

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const [, ...rows] = lines;

  return rows
    .map((line) => line.split(",").map((v) => v.trim()))
    .map(([word, meaning, level]) => ({ word, meaning, level: Number(level) }))
    .filter((r) => r.word && r.meaning && Number.isFinite(r.level));
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

function addUniqueMeanings(picks, items, limit) {
  for (const item of items) {
    if (picks.length >= limit) break;
    if (item.meaning && !picks.includes(item.meaning)) picks.push(item.meaning);
  }
}

function generateChoices(target) {
  const basePool = words.filter(
    (w) => w.word !== target.word && w.meaning && w.meaning !== target.meaning
  );

  const uniqueMap = new Map();
  for (const item of basePool) {
    if (!uniqueMap.has(item.meaning)) uniqueMap.set(item.meaning, item);
  }
  const uniquePool = [...uniqueMap.values()];

  const nearPool = uniquePool.filter(
    (item) => Math.abs(item.level - target.level) <= 10
  );
  const mediumPool = uniquePool.filter(
    (item) => Math.abs(item.level - target.level) > 10 && Math.abs(item.level - target.level) <= 30
  );
  const farPool = uniquePool.filter(
    (item) => Math.abs(item.level - target.level) > 30
  );

  const picks = [];
  addUniqueMeanings(picks, chooseRandomItems(nearPool, 3), 3);
  addUniqueMeanings(picks, chooseRandomItems(mediumPool, 3), 3);
  addUniqueMeanings(picks, chooseRandomItems(farPool, 3), 3);
  addUniqueMeanings(picks, chooseRandomItems(uniquePool, uniquePool.length), 3);

  return shuffle([target.meaning, ...picks]).map((meaning) => ({
    meaning,
    isCorrect: meaning === target.meaning,
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

function getSelectedQuestionCount() {
  if (!el.questionCount || el.questionCount.value === "all") return words.length;
  const selected = Number(el.questionCount.value);
  if (!Number.isFinite(selected) || selected <= 0) return words.length;
  return Math.min(selected, words.length);
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
  if (!words || words.length === 0) return null;
  if (gameDeck.length === 0) return null;
  const selected = gameDeck.shift();
  if (!selected) return null;
  previousWord = selected.word;
  return selected;
}

function showGameClear() {
  el.clearMessage.textContent = "今回の英単語モンスターをすべて討伐しました！";
  el.clearScore.textContent = `討伐数: ${kills} / 出題数: ${answeredCount} / 現在Gold: ${gold} / 残りHP: ${hp}`;
  showScreen("gameclear");
}

function sendToHospital() {
  const goldBeforePenalty = gold;
  gold = Math.max(0, gold - HOSPITAL_GOLD_PENALTY);
  saveGold();
  updateStatus();
  el.finalScore.textContent =
    `HPが0になったため病院送りです。\n` +
    `治療費として ${HOSPITAL_GOLD_PENALTY} gold を失いました。\n` +
    `Gold: ${goldBeforePenalty} → ${gold}\n` +
    `討伐数: ${kills} / 出題数: ${answeredCount}`;
  showScreen("gameover");
}

function nextQuestion() {
  if (answeredCount >= targetQuestionCount || gameDeck.length === 0) {
    showGameClear();
    return;
  }
  current = chooseNextWord();
  if (!current) {
    el.homeMessage.textContent = "単語データが読み込まれていません。";
    showScreen("home");
    return;
  }
  el.encounter.textContent = `${current.word} が現れた！`;
  el.targetWord.textContent = current.word;
  speakWord(current.word);
  el.choices.innerHTML = "";
  const choices = generateChoices(current);
  choices.forEach((choice, idx) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "choice-btn";
    btn.textContent = `${idx + 1}. ${choice.meaning}`;
    btn.addEventListener("click", () => judgeAnswer(choice));
    el.choices.appendChild(btn);
  });
  showScreen("battle");
}

function judgeAnswer(choice) {
  answeredCount += 1;
  if (choice.isCorrect) {
    playCorrectSound();
    gold += current.level;
    saveGold();
    kills += 1;
    el.resultMessage.textContent = `${current.word} を倒した！ +${current.level} gold`;
    el.answerMessage.textContent = "";
  } else {
    playWrongSound();
    hp = Math.max(0, hp - current.level);
    el.resultMessage.textContent = `${current.word} の攻撃！ -${current.level} HP`;
    el.answerMessage.textContent = `正解: ${current.meaning}`;
  }
  updateStatus();
  if (hp <= 0) {
    sendToHospital();
    return;
  }
  if (answeredCount >= targetQuestionCount) {
    showGameClear();
    return;
  }
  showScreen("result");
}

function startGame() {
  hp = INITIAL_HP;
  kills = 0;
  answeredCount = 0;
  previousWord = null;
  targetQuestionCount = getSelectedQuestionCount();
  gameDeck = shuffle(words).slice(0, targetQuestionCount);
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

function loadWordsFromCsv(csvText) {
  const parsed = parseCsv(csvText);
  if (parsed.length < 4) {
    el.homeMessage.textContent = "4語以上の有効なデータが必要です。";
    el.startBtn.disabled = true;
    return;
  }
  words = parsed;
  gameDeck = [];
  previousWord = null;
  answeredCount = 0;
  targetQuestionCount = 0;
  el.homeMessage.textContent = `${words.length}語を読み込みました。現在Gold: ${gold}`;
  el.startBtn.disabled = false;
}

el.csvFile.addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  const text = await file.text();
  loadWordsFromCsv(text);
});

el.wordbookCategory.addEventListener("change", (event) => {
  el.homeMessage.textContent = "";
  populateWordbookSelect(event.target.value);
});

el.loadWordbookBtn.addEventListener("click", loadBuiltinWordBook);
el.startBtn.addEventListener("click", startGame);
el.nextBtn.addEventListener("click", nextQuestion);
el.retryBtn.addEventListener("click", () => showScreen("home"));
el.clearRetryBtn.addEventListener("click", () => showScreen("home"));

populateCategorySelect();
el.wordbookCategory.value = "standard";
populateWordbookSelect("standard");
updateVersionLabel();
updateStatus();
