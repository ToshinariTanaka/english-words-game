const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const source = fs.readFileSync('study-app/script.js', 'utf8');
const helperStart = source.indexOf('function sharedCacheKey');
const helperEnd = source.indexOf('async function loadStandardCsv');
assert.notStrictEqual(helperStart, -1, 'shared question helpers should exist');
assert.notStrictEqual(helperEnd, -1, 'loadStandardCsv should exist after shared question helpers');
const snippet = source.slice(helperStart, helperEnd);

let jsonRead = false;
const cache = new Map();
const sandbox = {
  console,
  API_BASE: '',
  SHARED_CACHE_PREFIX: 'englishWordsGame.sharedQuestions.',
  localStorage: {
    setItem: (key, value) => cache.set(key, value),
  },
  fetch: async () => ({
    ok: false,
    status: 409,
    statusText: 'Conflict',
    json: async () => {
      jsonRead = true;
      return { ok: false, legacy: true, error: '旧形式の保存データです。' };
    },
  }),
};

vm.createContext(sandbox);
vm.runInContext(`${snippet}; this.fetchSharedQuestions = fetchSharedQuestions; this.LEGACY_SHARED_QUESTIONS_WARNING = LEGACY_SHARED_QUESTIONS_WARNING;`, sandbox);

(async () => {
  await assert.rejects(
    () => sandbox.fetchSharedQuestions('word'),
    (error) => {
      assert.strictEqual(error.status, 409);
      assert.strictEqual(error.legacy, true);
      assert.deepStrictEqual(error.payload, { ok: false, legacy: true, error: '旧形式の保存データです。' });
      return true;
    },
  );
  assert.strictEqual(jsonRead, true, '409 response JSON should be read before throwing');
  assert.strictEqual(cache.size, 0, 'legacy error payload should not be cached');
  assert.ok(sandbox.LEGACY_SHARED_QUESTIONS_WARNING.includes('保存済みの共通問題データは旧形式のため使用できません。'));
  assert.ok(sandbox.LEGACY_SHARED_QUESTIONS_WARNING.includes('新形式の3シートExcelをアップロードしてください。'));
  assert.ok(sandbox.LEGACY_SHARED_QUESTIONS_WARNING.includes('現在は標準サンプルデータを表示しています。'));
  assert.ok(source.includes('sharedError.legacy'), 'loadMode should branch on legacy shared-data errors');
  assert.ok(source.includes("applyQuestions(rows, '標準CSV', { message: fallbackMessage })"), 'legacy errors should still fall back to standard CSV');
  console.log('tests_study_app_legacy_shared_questions: OK');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
