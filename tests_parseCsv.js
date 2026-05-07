const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const source = fs.readFileSync('script.js', 'utf8');
const start = source.indexOf('function normalizeHeader');
const end = source.indexOf('function shuffle(arr)');
const snippet = source.slice(start, end);
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(`${snippet}; this.parseCsv = parseCsv;`, sandbox);
const { parseCsv } = sandbox;

function checkCommon(row) {
  assert.ok(row.word);
  assert.ok(row.meaning);
  assert.ok(Number.isFinite(row.gold));
  assert.ok(['A1','A2','B1','B2','C1','C2'].includes(row.level));
  assert.strictEqual(row.chunk, row.chunks[0].text);
  assert.ok(Array.isArray(row.chunks));
  assert.ok(row.chunks.every(c => 'text' in c && 'meaning' in c));
  assert.ok(row.definition);
  assert.ok(row.definition_meaning);
}

const newCsv = `word,meaning,gold,level,chunk1,chunk1_meaning,chunk2,chunk2_meaning,chunk3,chunk3_meaning,definition,definition_meaning,status,note,checked_at\nbook,本,8,B2,read a book,本を読む,open a book,本を開く,,,a set of pages with writing,文字が書かれたページの束,OK,,2026-01-01`;
const oldCsv = `word,meaning,level,chunk,chunk_meaning,definition,definition_meaning,status,note,checked_at\nrun,走る,B1,run fast,速く走る,move quickly on foot,足で速く動く,OK,,2026-01-01`;
const jpCsv = `英単語,和訳,level,chunk,chunk_meaning,chunk,chunk_meaning,chunk,chunk_meaning,,level,definition,definition_meaning\nmake,作る,4,make a cake,ケーキを作る,make lunch,昼食を作る,make plans,計画を立てる,,A2,create something,何かを作り出す`;

[newCsv, oldCsv, jpCsv].forEach((csv) => {
  const rows = parseCsv(csv);
  assert.strictEqual(rows.length, 1);
  checkCommon(rows[0]);
});

console.log('tests_parseCsv: OK');
