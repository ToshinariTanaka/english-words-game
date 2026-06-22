const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const source = fs.readFileSync('study-app/script.js', 'utf8');
const start = source.indexOf('const MODES =');
const end = source.indexOf('function setLoadingState');
const snippet = source.slice(start, end);

function createStorage(initial = {}) {
  const store = new Map(Object.entries(initial));
  return {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
    dump: () => Object.fromEntries(store.entries()),
  };
}

function makeEl() {
  return { hidden: true, textContent: '', innerHTML: '' };
}

function createSandbox(localStorage) {
  const elements = {
    studyCountsSummary: makeEl(),
    studyCountToday: makeEl(),
    studyCountMonth: makeEl(),
    studyCountYear: makeEl(),
    studyCountTotal: makeEl(),
  };
  const sandbox = {
    console,
    localStorage,
    window: { location: { origin: 'http://localhost', hostname: 'localhost' } },
    document: {
      querySelectorAll: () => [],
      getElementById: (id) => elements[id] || {},
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(`${snippet};
this.STUDY_COUNTS_STORAGE_KEY = STUDY_COUNTS_STORAGE_KEY;
this.STUDY_COUNT_MODES = STUDY_COUNT_MODES;
this.getLocalDateKey = getLocalDateKey;
this.readStudyCounts = readStudyCounts;
this.normalizeStudyCounts = normalizeStudyCounts;
this.incrementStudyCount = incrementStudyCount;
this.aggregateStudyCounts = aggregateStudyCounts;
this.renderStudyCountsSummary = renderStudyCountsSummary;`, sandbox);
  sandbox.elements = elements;
  return sandbox;
}

function assertModeCounts(actual, expected, message) {
  assert.strictEqual(JSON.stringify(actual.byMode), JSON.stringify({ word: 0, chunk: 0, phrase: 0, definition: 0, ...expected }), message);
  assert.strictEqual(actual.total, Object.values(expected).reduce((sum, value) => sum + value, 0), `${message}: 合計`);
}

for (const mode of ['word', 'chunk', 'phrase', 'definition']) {
  const storage = createStorage();
  const sandbox = createSandbox(storage);
  const today = new Date(2026, 5, 22, 12, 0, 0);
  const counts = sandbox.incrementStudyCount(today, mode);
  assert.strictEqual(counts.byMode[mode], 1, `${mode}モードだけが1増える`);
  sandbox.STUDY_COUNT_MODES.filter((other) => other !== mode).forEach((other) => {
    assert.strictEqual(counts.byMode[other], 0, `${mode}解答時に${other}は増えない`);
  });
  assert.strictEqual(counts.byDateMode['2026-06-22'][mode], 1, `${mode}の日別モード別が増える`);
}

let sandbox = createSandbox(createStorage());
const today = new Date(2026, 5, 22, 12, 0, 0);
sandbox.incrementStudyCount(today, 'word');
sandbox.incrementStudyCount(new Date(2026, 5, 1, 9, 0, 0), 'chunk');
sandbox.incrementStudyCount(new Date(2026, 0, 1, 9, 0, 0), 'phrase');
sandbox.incrementStudyCount(new Date(2025, 11, 31, 9, 0, 0), 'definition');
let summary = sandbox.aggregateStudyCounts(sandbox.readStudyCounts(), today);
assertModeCounts(summary.today, { word: 1 }, '今日は当日のモード別だけを集計する');
assertModeCounts(summary.month, { word: 1, chunk: 1 }, '今月はYYYY-MM一致分を集計する');
assertModeCounts(summary.year, { word: 1, chunk: 1, phrase: 1 }, '今年はYYYY一致分を集計する');
assertModeCounts(summary.total, { word: 1, chunk: 1, phrase: 1, definition: 1 }, '累計はbyModeを集計する');

const legacy = { version: 1, total: 1234, byDate: { '2026-06-22': 25 } };
sandbox = createSandbox(createStorage({ 'englishWordsGame.studyApp.studyCounts.v1': JSON.stringify(legacy) }));
const migrated = sandbox.readStudyCounts();
assert.strictEqual(migrated.version, 2, 'version 1は読み込み時にversion 2形式として扱う');
assert.strictEqual(migrated.total, 1234, 'version 1のtotalを保持する');
assert.strictEqual(migrated.byDate['2026-06-22'], 25, 'version 1のbyDateを保持する');
summary = sandbox.aggregateStudyCounts(migrated, today);
assert.strictEqual(summary.total.total, 1234, '累計合計は既存totalを尊重する');
assert.strictEqual(JSON.stringify(summary.total.byMode), JSON.stringify({ word: 0, chunk: 0, phrase: 0, definition: 0 }));
sandbox.incrementStudyCount(today, 'word');
const afterIncrement = sandbox.readStudyCounts();
assert.strictEqual(afterIncrement.total, 1235, 'version 1由来のtotalに新規回答分を加算する');
assert.strictEqual(afterIncrement.byDate['2026-06-22'], 26, 'version 1由来のbyDateに新規回答分を加算する');
assert.strictEqual(afterIncrement.byMode.word, 1, '新規回答分からモード別に記録する');

// answer() 側が state.selected で防ぐため、同じ問題で複数回押しても incrementStudyCount は1回だけ呼ばれる設計であることを静的に確認する。
assert.ok(source.includes('if (state.selected) return;\n  state.selected = true;'), '同じ問題の二重解答を防ぐ');
assert.strictEqual((source.match(/incrementStudyCount\(\);/g) || []).length, 1, '加算処理は解答確定箇所に1回だけある');

summary = sandbox.renderStudyCountsSummary(today);
assert.strictEqual(sandbox.elements.studyCountsSummary.hidden, false, '結果画面の勉強数欄が表示される');
for (const label of ['英単語', 'チャンク', '文節', '英文', '合計']) {
  assert.ok(sandbox.elements.studyCountToday.innerHTML.includes(label), `今日カードに${label}が表示される`);
  assert.ok(sandbox.elements.studyCountMonth.innerHTML.includes(label), `今月カードに${label}が表示される`);
  assert.ok(sandbox.elements.studyCountYear.innerHTML.includes(label), `今年カードに${label}が表示される`);
  assert.ok(sandbox.elements.studyCountTotal.innerHTML.includes(label), `累計カードに${label}が表示される`);
}

const html = fs.readFileSync('study-app/index.html', 'utf8');
assert.ok(html.includes('今日の勉強数'));
assert.ok(html.includes('今月の勉強数'));
assert.ok(html.includes('今年の勉強数'));
assert.ok(html.includes('累計の勉強数'));

console.log('tests_study_app_study_counts: OK');
