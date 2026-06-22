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

function createSandbox(localStorage) {
  const elements = {
    studyCountsSummary: { hidden: true },
    studyCountToday: { textContent: '' },
    studyCountMonth: { textContent: '' },
    studyCountYear: { textContent: '' },
    studyCountTotal: { textContent: '' },
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
this.getLocalDateKey = getLocalDateKey;
this.readStudyCounts = readStudyCounts;
this.incrementStudyCount = incrementStudyCount;
this.aggregateStudyCounts = aggregateStudyCounts;
this.renderStudyCountsSummary = renderStudyCountsSummary;
this.elements = ${JSON.stringify(Object.keys(elements))};`, sandbox);
  sandbox.elements = elements;
  return sandbox;
}

const storage = createStorage();
let sandbox = createSandbox(storage);
const today = new Date(2026, 5, 21, 12, 0, 0);

let counts = sandbox.incrementStudyCount(today);
let summary = sandbox.aggregateStudyCounts(counts, today);
assert.strictEqual(summary.today, 1, '1問解答すると今日が1増える');
assert.strictEqual(summary.month, 1, '1問解答すると今月が1増える');
assert.strictEqual(summary.year, 1, '1問解答すると今年が1増える');
assert.strictEqual(summary.total, 1, '1問解答すると累計が1増える');

// answer() 側が state.selected で防ぐため、同じ問題で複数回押しても incrementStudyCount は1回だけ呼ばれる設計であることを静的に確認する。
assert.ok(source.includes('if (state.selected) return;\n  state.selected = true;'), '同じ問題の二重解答を防ぐ');
assert.strictEqual((source.match(/incrementStudyCount\(\);/g) || []).length, 1, '加算処理は解答確定箇所に1回だけある');

const persisted = storage.dump();
sandbox = createSandbox(createStorage(persisted));
summary = sandbox.aggregateStudyCounts(sandbox.readStudyCounts(), today);
assert.strictEqual(summary.today, 1, 'localStorageの今日の値が再読み込み後も復元される');
assert.strictEqual(summary.month, 1, 'localStorageの今月の値が再読み込み後も復元される');
assert.strictEqual(summary.year, 1, 'localStorageの今年の値が再読み込み後も復元される');
assert.strictEqual(summary.total, 1, 'localStorageの累計値が再読み込み後も復元される');

sandbox.incrementStudyCount(new Date(2026, 5, 1, 9, 0, 0));
sandbox.incrementStudyCount(new Date(2026, 0, 1, 9, 0, 0));
sandbox.incrementStudyCount(new Date(2025, 11, 31, 9, 0, 0));
summary = sandbox.renderStudyCountsSummary(today);
assert.strictEqual(summary.today, 1);
assert.strictEqual(summary.month, 2);
assert.strictEqual(summary.year, 3);
assert.strictEqual(summary.total, 4);
assert.strictEqual(sandbox.elements.studyCountsSummary.hidden, false, '結果画面の勉強数欄が表示される');
assert.strictEqual(sandbox.elements.studyCountToday.textContent, '1');
assert.strictEqual(sandbox.elements.studyCountMonth.textContent, '2');
assert.strictEqual(sandbox.elements.studyCountYear.textContent, '3');
assert.strictEqual(sandbox.elements.studyCountTotal.textContent, '4');

const html = fs.readFileSync('study-app/index.html', 'utf8');
assert.ok(html.includes('今日の勉強数'));
assert.ok(html.includes('今月の勉強数'));
assert.ok(html.includes('今年の勉強数'));
assert.ok(html.includes('累計の勉強数'));

console.log('tests_study_app_study_counts: OK');
