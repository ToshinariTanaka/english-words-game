const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const source = fs.readFileSync('admin/wordbook-batch/script.js', 'utf8');
const start = source.indexOf('const TOOL_VERSION');
const end = source.indexOf('function stripCodeBlock');
const snippet = source.slice(start, end);
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(`${snippet}; this.buildPrompt = buildPrompt;`, sandbox);
const { buildPrompt } = sandbox;

const sampleRows = [{
  row_number: 1,
  word: 'apple',
  meaning: 'りんご',
  gold: 1,
  level: '',
  chunk1: '',
  chunk1_meaning: '',
  chunk2: '',
  chunk2_meaning: '',
  chunk3: '',
  chunk3_meaning: '',
  definition: '',
  definition_meaning: '',
  status: '',
  note: ''
}];

const juniorPrompt = buildPrompt(sampleRows, 'junior');
assert.ok(juniorPrompt.includes('中1基本'));
assert.ok(juniorPrompt.includes('中2基本'));
assert.ok(juniorPrompt.includes('中3基本'));
assert.ok(juniorPrompt.includes('入試標準'));
assert.ok(juniorPrompt.includes('row_number,word,meaning,gold,level'));

const examPrompt = buildPrompt(sampleRows, 'exam');
assert.ok(examPrompt.includes('A1 / A2 / B1 / B2 / C1 / C2'));
assert.ok(examPrompt.includes('高校・大学受験英単語'));

const eikenPrompt = buildPrompt(sampleRows, 'eiken');
assert.ok(eikenPrompt.includes('A1 / A2 / B1 / B2 / C1 / C2'));
assert.ok(eikenPrompt.includes('英検'));

const customPrompt = buildPrompt(sampleRows, 'unknown');
assert.ok(customPrompt.includes('カスタム'));

console.log('tests_wordbookBatchPrompt: OK');
