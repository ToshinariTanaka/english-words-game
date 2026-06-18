const fs = require('fs');
const vm = require('vm');
const assert = require('assert');


{
  const html = fs.readFileSync('study-app/index.html', 'utf8');
  const firstQuestionCountOption = html.match(/<select id="questionCount">\s*<option value="([^"]+)">([^<]+)<\/option>/);
  assert.ok(firstQuestionCountOption, 'questionCount select should have options');
  assert.strictEqual(firstQuestionCountOption[1], '10');
  assert.strictEqual(firstQuestionCountOption[2], '10問');

  const source = fs.readFileSync('study-app/script.js', 'utf8');
  assert.ok(source.includes("const DEFAULT_QUESTION_COUNT = '10';"));
  assert.ok(source.includes("backToSettingsButton: document.getElementById('backToSettingsButton')"));
  assert.ok(source.includes("target.scrollIntoView({ behavior: 'smooth', block: 'start' });"));
  assert.ok(source.includes('showBackToSettingsButton();'));
  assert.ok(html.includes('id="backToSettingsButton"'));
  assert.ok(html.includes('問題設定へ戻る'));
  assert.ok(html.includes('hidden>問題設定へ戻る</button>'));

  const css = fs.readFileSync('study-app/style.css', 'utf8');
  assert.ok(css.includes('.quiz-card.mode-word #questionText,'));
  assert.ok(css.includes('.quiz-card.mode-chunk #questionText'));
  assert.ok(css.includes('font-size: clamp(1.8rem, 7.2vw, 2.64rem);'));
  assert.ok(css.includes('.back-to-settings-button'));
  assert.ok(css.includes('min-height: 52px;'));
}

{
  const source = fs.readFileSync('study-app/script.js', 'utf8');
  const start = source.indexOf('function shuffle');
  const end = source.indexOf('function showEmptyState');
  const snippet = source.slice(start, end);
  const sandbox = {
    state: {
      questionPool: Array.from({ length: 400 }, (_, index) => ({ id: index + 1, choices: ['A', 'B', 'C', 'D'] })),
      questions: [],
    },
    els: {
      questionCount: { value: '10' },
      randomOrder: { checked: false },
      settingsStatus: { textContent: '' },
    },
    initializeSpeech() {},
    resetSessionStats() {},
    showQuestion() {},
    updateStats() {},
  };
  vm.createContext(sandbox);
  vm.runInContext(`${snippet}; beginConfiguredSession();`, sandbox);
  assert.strictEqual(sandbox.state.questions.length, 10);
  assert.strictEqual(sandbox.state.questions[0].id, 1);
  assert.strictEqual(sandbox.els.settingsStatus.textContent, '全400問から、元の順番で10問を出題します。');

  sandbox.els.questionCount.value = '20';
  sandbox.els.randomOrder.checked = true;
  vm.runInContext('beginConfiguredSession();', sandbox);
  assert.strictEqual(sandbox.state.questions.length, 20);
  assert.strictEqual(sandbox.els.settingsStatus.textContent, '全400問から、ランダムで20問を出題します。');
}

{
  const source = fs.readFileSync('script.js', 'utf8');
  const start = source.indexOf('function getSelectedQuestionCount');
  const end = source.indexOf('function chooseRandomItem(');
  const snippet = source.slice(start, end);
  const sandbox = {
    Math,
    el: { questionCount: { value: '10' }, randomOrderToggle: { checked: false } },
    words: [],
    currentQuestionMode: 'meaning',
    QUESTION_MODES: { meaning: { promptKey: 'word', answerKey: 'meaning' } },
  };
  vm.createContext(sandbox);
  vm.runInContext(snippet, sandbox);
  const playableWords = Array.from({ length: 400 }, (_, index) => ({ word: `word${index + 1}`, meaning: `meaning${index + 1}` }));
  sandbox.playableWords = playableWords;
  vm.runInContext('this.deck = buildQuestionDeck(playableWords, getSelectedQuestionCount(playableWords), isRandomOrderEnabled());', sandbox);
  assert.strictEqual(sandbox.deck.length, 10);
  assert.strictEqual(sandbox.deck[0].word, 'word1');

  sandbox.el.questionCount.value = 'all';
  vm.runInContext('this.allDeck = buildQuestionDeck(playableWords, getSelectedQuestionCount(playableWords), false);', sandbox);
  assert.strictEqual(sandbox.allDeck.length, 400);
}

console.log('tests_question_count: OK');
