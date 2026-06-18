const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

class SelectMock {
  constructor(value = '10') {
    this._value = value;
    this.options = ['10', '20', '30', '40', '50', '70', '100', '150', 'all'].map((optionValue) => ({ value: optionValue, disabled: false }));
  }
  get value() { return this._value; }
  set value(nextValue) { this._value = String(nextValue); }
  get selectedOptions() {
    const option = this.options.find((item) => item.value === this._value);
    return option ? [option] : [];
  }
}

const source = fs.readFileSync('study-app/script.js', 'utf8');
const start = source.indexOf('function shuffle');
const end = source.indexOf('function showEmptyState');
const snippet = source.slice(start, end);
const prefix = `
const LEVEL_ORDER = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const DEFAULT_LEVEL_START = 'A1';
const DEFAULT_LEVEL_END = 'C2';
const DEFAULT_QUESTION_COUNT = '10';
const QUESTION_COUNT_STORAGE_KEY = 'englishWordsGame.studyApp.questionCount';
`;

function createSandbox(questionPool, levelStart = 'A1', levelEnd = 'C2') {
  return {
    Math,
    state: { questionPool, questions: [] },
    els: {
      questionCount: new SelectMock('10'),
      levelStart: { value: levelStart, addEventListener() {} },
      levelEnd: { value: levelEnd, addEventListener() {} },
      randomOrder: { checked: false },
      settingsStatus: { textContent: '' },
      startQuizButton: { disabled: false },
    },
    initializeSpeech() {},
    resetSessionStats() {},
    showQuestion() {},
    updateStats() {},
    hideBackToSettingsButton() {},
    saveStoredString() {},
    loadStoredString(_key, fallback) { return fallback; },
  };
}

function runSandbox(sandbox, code) {
  vm.createContext(sandbox);
  vm.runInContext(`${prefix}${snippet};${code}`, sandbox);
  return sandbox;
}

function makeQuestion(id, level) {
  return { id, level, choices: ['A', 'B', 'C', 'D'] };
}

{
  const sandbox = runSandbox(createSandbox([makeQuestion(1, ''), makeQuestion(2, 'A1')]), 'this.filtered = getFilteredQuestionPool();');
  assert.deepStrictEqual(sandbox.filtered.map((question) => question.id), [2], 'blank level should be excluded');
}

{
  const sandbox = runSandbox(createSandbox([makeQuestion(1, 'D1'), makeQuestion(2, 'C2')]), 'this.filtered = getFilteredQuestionPool();');
  assert.deepStrictEqual(sandbox.filtered.map((question) => question.id), [2], 'out-of-range level should be excluded');
}

{
  const questions = [makeQuestion(1, 'A1'), makeQuestion(2, ''), makeQuestion(3, 'D1'), makeQuestion(4, 'C2')];
  const sandbox = runSandbox(createSandbox(questions, 'A1', 'C2'), 'this.filtered = getFilteredQuestionPool();');
  assert.deepStrictEqual(sandbox.filtered.map((question) => question.id), [1, 4], 'full range should still exclude unknown levels');
}

{
  const questions = Array.from({ length: 8 }, (_, index) => makeQuestion(index + 1, 'A1'));
  const sandbox = runSandbox(createSandbox(questions, 'A1', 'A1'), 'refreshQuestionCountOptionsForLevelRange();');
  for (const option of sandbox.els.questionCount.options) {
    if (option.value === 'all') assert.strictEqual(option.disabled, false, 'all should remain selectable');
    else assert.strictEqual(option.disabled, Number(option.value) >= 10, `${option.value} should be disabled when only 8 questions are available`);
  }
}

{
  const questions = [
    ...Array.from({ length: 12 }, (_, index) => makeQuestion(index + 1, 'A1')),
    ...Array.from({ length: 13 }, (_, index) => makeQuestion(index + 13, 'B2')),
  ];
  const sandbox = runSandbox(createSandbox(questions, 'A1', 'C2'), `
    refreshQuestionCountOptionsForLevelRange();
    this.initial20Disabled = els.questionCount.options.find((option) => option.value === '20').disabled;
    els.levelEnd.value = 'A1';
    refreshQuestionCountOptionsForLevelRange();
    this.after20Disabled = els.questionCount.options.find((option) => option.value === '20').disabled;
  `);
  assert.strictEqual(sandbox.initial20Disabled, false, '20 should be enabled for 25 full-range questions');
  assert.strictEqual(sandbox.after20Disabled, true, '20 should be disabled after narrowing to 12 questions');
}

{
  const sandbox = runSandbox(createSandbox([makeQuestion(1, 'B1')], 'A1', 'A1'), 'refreshQuestionCountOptionsForLevelRange();');
  assert.strictEqual(sandbox.els.startQuizButton.disabled, true, 'start button should be disabled when filtered count is zero');
  assert.strictEqual(sandbox.els.settingsStatus.textContent, '選択したレベル範囲に出題できる問題がありません。');
}

console.log('tests_study_app_level_range: OK');
