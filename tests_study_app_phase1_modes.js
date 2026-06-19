const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const source = fs.readFileSync('study-app/script.js', 'utf8');
const html = fs.readFileSync('study-app/index.html', 'utf8');
const start = source.indexOf('const MODES =');
const end = source.indexOf('function setLoadingState');
const snippet = source.slice(start, end);

const store = new Map();
const localStorage = {
  getItem: (key) => (store.has(key) ? store.get(key) : null),
  setItem: (key, value) => store.set(key, String(value)),
  removeItem: (key) => store.delete(key),
};
const sandbox = {
  console,
  localStorage,
  window: { location: { origin: 'http://localhost', hostname: 'localhost' }, confirm: () => true },
  document: { querySelectorAll: () => [], getElementById: () => ({}) },
};
vm.createContext(sandbox);
vm.runInContext(`${snippet};
this.MODES = MODES;
this.parseCsv = parseCsv;
this.normalizeQuestionsForMode = normalizeQuestionsForMode;
this.getLearningHistoryKey = getLearningHistoryKey;
this.updateLearningStat = updateLearningStat;
this.readLearningStats = readLearningStats;
this.LEARNING_STATS_STORAGE_KEY = LEARNING_STATS_STORAGE_KEY;
`, sandbox);

assert.deepStrictEqual(Object.keys(sandbox.MODES), ['word', 'chunk', 'phrase', 'definition']);
assert.ok(sandbox.MODES.phrase, 'phrase mode should exist');

const modeButtonOrder = [...html.matchAll(/data-mode="([^"]+)"/g)].map((match) => match[1]);
assert.deepStrictEqual(modeButtonOrder, ['word', 'chunk', 'phrase', 'definition']);

const phraseCsv = fs.readFileSync('study-app/data/phrase_mode.csv', 'utf8');
const phraseRows = sandbox.parseCsv(phraseCsv);
const [phraseQuestion] = sandbox.normalizeQuestionsForMode(phraseRows, 'phrase');
assert.strictEqual(phraseQuestion.questionKey, 'p000001');
assert.strictEqual(phraseQuestion.question, 'after school');
assert.strictEqual(sandbox.getLearningHistoryKey(phraseQuestion, 'phrase'), '文節和訳::★文節和訳::p000001');

const wordA = sandbox.normalizeQuestionsForMode([{ row_number: '1', level: 'A1', question: 'before', correct: '前に', choice1: '後に', choice2: '中に', choice3: '上に', question_key: 'w000010' }], 'word')[0];
const wordB = sandbox.normalizeQuestionsForMode([{ row_number: '999', level: 'A1', question: 'changed question', correct: '前に', choice1: '後に', choice2: '中に', choice3: '上に', question_key: 'w000010' }], 'word')[0];
assert.strictEqual(sandbox.getLearningHistoryKey(wordA, 'word'), '英単語::★英単語::w000010');
assert.strictEqual(sandbox.getLearningHistoryKey(wordA, 'word'), sandbox.getLearningHistoryKey(wordB, 'word'));

sandbox.updateLearningStat(wordA, true, 'word');
const saved = JSON.parse(localStorage.getItem(sandbox.LEARNING_STATS_STORAGE_KEY));
assert.strictEqual(saved.schema_version, 2);
assert.ok(saved.items['英単語::★英単語::w000010']);
assert.strictEqual(saved.items['英単語::★英単語::w000010'].question_key, 'w000010');

localStorage.setItem(sandbox.LEARNING_STATS_STORAGE_KEY, JSON.stringify({ 'old-key': { total_correct: 1 } }));
const afterLegacy = sandbox.readLearningStats();
assert.deepStrictEqual(JSON.parse(JSON.stringify(afterLegacy)), { schema_version: 2, items: {} });
assert.strictEqual(localStorage.getItem(sandbox.LEARNING_STATS_STORAGE_KEY), null);

console.log('tests_study_app_phase1_modes: OK');
