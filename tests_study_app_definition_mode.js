const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const source = fs.readFileSync('study-app/script.js', 'utf8');
const start = source.indexOf('const MODES =');
const end = source.indexOf('function setLoadingState');
const snippet = source.slice(start, end);
const sandbox = { document: { querySelectorAll: () => [], getElementById: () => ({}) } };
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


const bomCsvWithDuplicateExtraHeaders = '\uFEFFA row_number,B level,C question,D correct,E choice1,F choice2,G choice3,H total_correct,I total_wrong,J accuracy,K current_streak,L note,A row_number,note\n' +
  '10,B1,"Hello, world",こんにちは世界,誤答1,誤答2,誤答3,,,,,最初のnote,999,後ろのnote';
const [standardRow] = sandbox.parseCsv(bomCsvWithDuplicateExtraHeaders);
assert.deepStrictEqual(Object.keys(standardRow), ['row_number', 'level', 'question', 'correct', 'choice1', 'choice2', 'choice3', 'total_correct', 'total_wrong', 'accuracy', 'current_streak', 'note']);
assert.strictEqual(standardRow.row_number, '10');
assert.strictEqual(standardRow.question, 'Hello, world');
assert.strictEqual(standardRow.note, '最初のnote');

const incompleteRows = sandbox.parseCsv('A row_number,B level,C question,D correct,E choice1,F choice2,G choice3,H total_correct,I total_wrong,J accuracy,K current_streak,L note\n1,A1,Q,C,NG1,NG2,NG3,,,,,\n2,A1,Q2,C2,NG1,,,,,,,');
const playableRows = sandbox.normalizeQuestions(incompleteRows);
assert.strictEqual(playableRows.length, 1);
assert.strictEqual(playableRows[0].question, 'Q');

console.log('tests_study_app_definition_mode: OK');
