const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const source = fs.readFileSync('study-app/script.js', 'utf8');
const html = fs.readFileSync('study-app/index.html', 'utf8');
const start = source.indexOf('const MODES =');
const end = source.indexOf('async function fetchSharedQuestions');
const snippet = source.slice(start, end);

const sandbox = {
  console,
  localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  window: { location: { origin: 'http://localhost', hostname: 'localhost' }, confirm: () => true },
  document: { querySelectorAll: () => [], getElementById: () => ({ options: [], addEventListener: () => {} }) },
};
vm.createContext(sandbox);
vm.runInContext(`${snippet};
this.MODES = MODES;
this.parseCsv = parseCsv;
this.normalizeQuestionsForMode = normalizeQuestionsForMode;
this.normalizeApiMode = normalizeApiMode;
this.isSharedPayloadForMode = isSharedPayloadForMode;
this.getNoDataMessage = getNoDataMessage;
`, sandbox);

assert.ok(html.includes('data-mode="chunk"'), 'index.html must include chunk mode button');
assert.ok(html.includes('data-mode="phrase"'), 'index.html must include phrase mode button');
assert.deepStrictEqual(Object.keys(sandbox.MODES), ['word', 'chunk', 'phrase', 'definition']);
assert.strictEqual(sandbox.MODES.chunk.historySheetName, '★チャンク');
assert.strictEqual(sandbox.MODES.phrase.historySheetName, '★文節和訳');
assert.strictEqual(sandbox.normalizeApiMode('phrase'), 'phrase');
assert.strictEqual(sandbox.isSharedPayloadForMode({ ok: true, mode: 'definition', rows: [] }, 'phrase'), false);
assert.strictEqual(sandbox.getNoDataMessage('phrase'), '文節和訳データがありません');

const chunkRows = sandbox.parseCsv(fs.readFileSync('study-app/data/chunk_mode.csv', 'utf8'));
const phraseRows = sandbox.parseCsv(fs.readFileSync('study-app/data/phrase_mode.csv', 'utf8'));
assert.strictEqual(sandbox.normalizeQuestionsForMode(chunkRows, 'chunk')[0].questionKey, 'c000001');
assert.strictEqual(sandbox.normalizeQuestionsForMode(phraseRows, 'phrase')[0].questionKey, 'p000001');
console.log('tests_study_app_hotfix_modes: OK');
