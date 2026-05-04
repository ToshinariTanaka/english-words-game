const INITIAL_HP = 100;

const screens = {
  home: document.getElementById("home-screen"),
  battle: document.getElementById("battle-screen"),
  result: document.getElementById("result-screen"),
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
  speakBtn: document.getElementById("speak-btn"),
  choices: document.getElementById("choices"),
  resultMessage: document.getElementById("result-message"),
  answerMessage: document.getElementById("answer-message"),
  nextBtn: document.getElementById("next-btn"),
  finalScore: document.getElementById("final-score"),
  retryBtn: document.getElementById("retry-btn"),
};

let words = [];
let current = null;
let hp = INITIAL_HP;
let gold = 0;
let kills = 0;

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

function nextQuestion() {
  current = words[Math.floor(Math.random() * words.length)];
  el.encounter.textContent = `${current.word} が現れた！`;
  el.targetWord.textContent = current.word;
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
  if (choice.isCorrect) {
    gold += current.level;
    kills += 1;
    el.resultMessage.textContent = `${current.word} を倒した！ +${current.level} gold`;
    el.answerMessage.textContent = "";
  } else {
    hp -= current.level;
    el.resultMessage.textContent = `${current.word} の攻撃！ -${current.level} HP`;
    el.answerMessage.textContent = `正解: ${current.meaning}`;
  }

  updateStatus();

  if (hp <= 0) {
    el.finalScore.textContent = `討伐数: ${kills} / 獲得Gold: ${gold}`;
    showScreen("gameover");
    return;
  }

  showScreen("result");
}

function startGame() {
  hp = INITIAL_HP;
  gold = 0;
  kills = 0;
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

el.speakBtn.addEventListener("click", () => {
  if (!current) return;
  const utterance = new SpeechSynthesisUtterance(current.word);
  utterance.lang = "en-US";
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
});
