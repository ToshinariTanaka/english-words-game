const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const source = fs.readFileSync('study-app/script.js', 'utf8');
const start = source.indexOf('const MODES =');
const end = source.indexOf('function setLoadingState');
const snippet = source.slice(start, end);

const store = new Map();
const localStorage = {
  getItem: (key) => (store.has(key) ? store.get(key) : null),
  setItem: (key, value) => store.set(key, String(value)),
  removeItem: (key) => store.delete(key),
};
let confirmResult = true;
const sandbox = {
  console,
  localStorage,
  window: { location: { origin: 'http://localhost', hostname: 'localhost' }, confirm: () => confirmResult },
  document: { querySelectorAll: () => [], getElementById: () => ({}) },
};
vm.createContext(sandbox);
vm.runInContext(`${snippet};
this.parseCsv = parseCsv;
this.normalizeQuestionsForMode = normalizeQuestionsForMode;
this.getLearningHistoryKey = getLearningHistoryKey;
this.updateLearningStat = updateLearningStat;
this.getLearningStat = getLearningStat;
this.setWeakChecked = setWeakChecked;
this.clearLearningStatsWithConfirm = clearLearningStatsWithConfirm;
this.normalizeHistorySheetName = normalizeHistorySheetName;
this.LEARNING_STATS_STORAGE_KEY = LEARNING_STATS_STORAGE_KEY;
`, sandbox);

const excelRow = { row_number: '1', level: 'B2', question: 'reconnaissance', correct: '偵察', choice1: '交渉', choice2: '降伏', choice3: '撤退', total_correct: '99', total_wrong: '88', accuracy: '53%', current_streak: '7', question_key: 'w000001' };
const renderRow = { row_number: '500', level: 'B2', question: 'changed question', correct: '偵察', choice1: '交渉', choice2: '降伏', choice3: '撤退', question_key: 'w000001' };
const [excelQuestion] = sandbox.normalizeQuestionsForMode([excelRow], 'word');
const [renderQuestion] = sandbox.normalizeQuestionsForMode([renderRow], 'word');

assert.strictEqual(
  sandbox.getLearningHistoryKey(excelQuestion, 'word'),
  '英単語::★英単語::w000001',
);
assert.strictEqual(sandbox.getLearningHistoryKey(excelQuestion, 'word'), sandbox.getLearningHistoryKey(renderQuestion, 'word'));
assert.strictEqual(sandbox.getLearningHistoryKey({ ...excelQuestion, id: '999' }, 'word'), sandbox.getLearningHistoryKey(excelQuestion, 'word'));
assert.strictEqual(sandbox.normalizeHistorySheetName('英単語'), '★英単語');
assert.strictEqual(sandbox.normalizeHistorySheetName('word_mode'), '★英単語');
assert.strictEqual(sandbox.getLearningHistoryKey({ question: 'in response to this' }, 'chunk'), 'チャンク::★チャンク::in response to this');
assert.strictEqual(sandbox.getLearningHistoryKey({ question: 'Modern warfare is associated with military drones.' }, 'definition'), '英文和訳::★英文和訳::Modern warfare is associated with military drones.');

let stat = sandbox.updateLearningStat(excelQuestion, true, 'word');
assert.strictEqual(stat.total_correct, 1);
assert.strictEqual(stat.total_wrong, 0);
stat = sandbox.updateLearningStat(excelQuestion, false, 'word');
assert.strictEqual(stat.total_correct, 1);
assert.strictEqual(stat.total_wrong, 1);
assert.strictEqual(stat.accuracy, 50);

for (let i = 0; i < 12; i += 1) sandbox.updateLearningStat(excelQuestion, i % 2 === 0, 'word');
stat = sandbox.getLearningStat(excelQuestion, 'word');
assert.strictEqual(stat.recent_results.length, 10);
assert.strictEqual(stat.recent10_accuracy, 50);
assert.strictEqual(stat.total_correct, 7);
assert.strictEqual(stat.total_wrong, 7);
assert.strictEqual(stat.accuracy, 50);

stat = sandbox.setWeakChecked(excelQuestion, true, 'word');
assert.strictEqual(stat.weak_checked, true);
assert.strictEqual(sandbox.getLearningStat(excelQuestion, 'word').weak_checked, true);
stat = sandbox.setWeakChecked(excelQuestion, false, 'word');
assert.strictEqual(stat.weak_checked, false);

confirmResult = false;
assert.strictEqual(sandbox.clearLearningStatsWithConfirm(), false);
assert.notStrictEqual(localStorage.getItem(sandbox.LEARNING_STATS_STORAGE_KEY), null);
confirmResult = true;
assert.strictEqual(sandbox.clearLearningStatsWithConfirm(), true);
assert.strictEqual(localStorage.getItem(sandbox.LEARNING_STATS_STORAGE_KEY), null);

store.clear();
const [withLegacyCsvStats] = sandbox.normalizeQuestionsForMode([excelRow], 'word');
assert.strictEqual(withLegacyCsvStats.totalCorrect, '99');
assert.strictEqual(sandbox.getLearningStat(withLegacyCsvStats, 'word').total_correct, 0);
assert.strictEqual(localStorage.getItem(sandbox.LEARNING_STATS_STORAGE_KEY), null);

console.log('tests_study_app_learning_stats: OK');
