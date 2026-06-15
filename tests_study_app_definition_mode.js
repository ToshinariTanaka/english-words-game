const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const source = fs.readFileSync('study-app/script.js', 'utf8');
const start = source.indexOf('const MODES =');
const end = source.indexOf('function resetSessionStats');
const snippet = source.slice(start, end);
const sandbox = { document: { querySelectorAll: () => [], getElementById: () => ({}) }, indexedDB: {} };
vm.createContext(sandbox);
vm.runInContext(`${snippet}; state.mode = 'definition'; this.MODES = MODES; this.COMMON_ALIASES = COMMON_ALIASES; this.parseCsv = parseCsv; this.normalizeQuestions = normalizeQuestions;`, sandbox);

assert.strictEqual(sandbox.MODES.definition.label, '英文和訳モード');
assert.strictEqual(sandbox.MODES.definition.description, '英文を読んで、正しい日本語訳を選びます。');

const rows = sandbox.parseCsv('row_number,level,question,correct,choice1,choice2,choice3\n1,A1,I like apples.,私はりんごが好きです。,私はりんごを売ります。,彼はりんごが好きです。,私はみかんが好きです。');
const [question] = sandbox.normalizeQuestions(rows);
assert.strictEqual(question.question, 'I like apples.');
assert.strictEqual(question.correct, '私はりんごが好きです。');
assert.deepStrictEqual(Array.from(question.choices).sort(), ['私はりんごが好きです。', '私はりんごを売ります。', '彼はりんごが好きです。', '私はみかんが好きです。'].sort());

const aliasRows = [{ 英文: 'She opened the window.', 日本語訳: '彼女は窓を開けました。', choice1: '彼女はドアを閉めました。', choice2: '彼は窓を開けました。', choice3: '彼女は窓を掃除しました。' }];
const [aliasQuestion] = sandbox.normalizeQuestions(aliasRows);
assert.strictEqual(aliasQuestion.question, 'She opened the window.');
assert.strictEqual(aliasQuestion.correct, '彼女は窓を開けました。');

console.log('tests_study_app_definition_mode: OK');
