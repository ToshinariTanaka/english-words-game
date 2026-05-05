const INITIAL_HP = 100;

const screens = {
  home: document.getElementById("home-screen"),
  battle: document.getElementById("battle-screen"),
  result: document.getElementById("result-screen"),
  gameclear: document.getElementById("gameclear-screen"),
  gameover: document.getElementById("gameover-screen"),
};

const el = {
  csvFile: document.getElementById("csv-file"),
  useSampleBtn: document.getElementById("use-sample-btn"),
  startBtn: document.getElementById("start-btn"),
  homeMessage: document.getElementById("home-message"),
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
let gold = 0;
let kills = 0;
let answeredCount = 0;
let previousWord = null;
let gameDeck = [];
let audioContext = null;

const sampleCsv = `word,meaning,level\ndog,犬,1\ncat,猫,1\nrecommend,勧める・推薦する,12\npurchase,購入する,12\nwrite,書く,5\nsummarize,要約する,20\nconservation,保護・保存,80\nconsumption,消費,75\ncivilization,文明,85\nconversation,会話,70`;

function showScreen(name) {
  Object.values(screens).forEach((screen) => screen.classList.remove("active"));
  screens[name].classList.add("active");
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

function generateChoices(target) {
  const basePool = words.filter(
    (w) => w.word !== target.word && w.meaning && w.meaning !== target.meaning
  );

  const uniqueMap = new Map();
  for (const item of basePool) {
    if (!uniqueMap.has(item.meaning)) uniqueMap.set(item.meaning, item);
  }
  const uniquePool = [...uniqueMap.values()];

  const prioritized = uniquePool
    .map((item) => ({ ...item, diff: Math.abs(item.level - target.level) }))
    .sort((a, b) => a.diff - b.diff);

  const near = prioritized.filter((item) => item.diff <= 10);
  const picks = [];

  for (const item of near) {
    if (picks.length === 3) break;
    picks.push(item.meaning);
  }

  for (const item of prioritized) {
    if (picks.length === 3) break;
    if (!picks.includes(item.meaning)) picks.push(item.meaning);
  }

  if (picks.length < 3) {
    const fallbackMeanings = shuffle(
      words
        .map((w) => w.meaning)
        .filter((m) => m && m !== target.meaning && !picks.includes(m))
    );

    for (const meaning of fallbackMeanings) {
      if (picks.length === 3) break;
      picks.push(meaning);
    }
  }

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

function getAudioContext() {
  if (!window.AudioContext && !window.webkitAudioContext) return null;
  if (!audioContext) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    audioContext = new AudioContextClass();
  }
  return audioContext;
}

function playTone(frequency, startTime, duration, type = "sine", volume = 0.08) {
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
  playTone(523.25, now, 0.12, "sine", 0.08);
  playTone(659.25, now + 0.1, 0.12, "sine", 0.08);
  playTone(783.99, now + 0.2, 0.16, "sine", 0.08);
}

function playWrongSound() {
  const ctx = getAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  playTone(220, now, 0.15, "sawtooth", 0.06);
  playTone(146.83, now + 0.12, 0.2, "sawtooth", 0.06);
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

function refillDeck() {
  gameDeck = shuffle(words);

  if (
    previousWord &&
    gameDeck.length > 1 &&
    gameDeck[0].word === previousWord
  ) {
    const swapIndex = gameDeck.findIndex((w) => w.word !== previousWord);
    if (swapIndex > 0) {
      [gameDeck[0], gameDeck[swapIndex]] = [gameDeck[swapIndex], gameDeck[0]];
    }
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
  el.clearMessage.textContent = "すべての英単語モンスターを討伐しました！";
  el.clearScore.textContent = `討伐数: ${kills} / 出題数: ${answeredCount} / 獲得Gold: ${gold} / 残りHP: ${hp}`;
  showScreen("gameclear");
}

function nextQuestion() {
  if (answeredCount >= words.length || gameDeck.length === 0) {
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
    el.finalScore.textContent = `討伐数: ${kills} / 出題数: ${answeredCount} / 獲得Gold: ${gold}`;
    showScreen("gameover");
    return;
  }

  if (answeredCount >= words.length) {
    showGameClear();
    return;
  }

  showScreen("result");
}

function startGame() {
  hp = INITIAL_HP;
  gold = 0;
  kills = 0;
  answeredCount = 0;
  previousWord = null;
  gameDeck = shuffle(words);
  updateStatus();
  nextQuestion();
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
  el.homeMessage.textContent = `${words.length}語を読み込みました。`;
  el.startBtn.disabled = false;
}

el.csvFile.addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  const text = await file.text();
  loadWordsFromCsv(text);
});

el.useSampleBtn.addEventListener("click", () => loadWordsFromCsv(sampleCsv));
el.startBtn.addEventListener("click", startGame);
el.nextBtn.addEventListener("click", nextQuestion);
el.retryBtn.addEventListener("click", () => showScreen("home"));
el.clearRetryBtn.addEventListener("click", () => showScreen("home"));
