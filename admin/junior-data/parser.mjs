// Pure Excel-to-published-question converter; used by both the admin UI and tests.
export const MODES = {
  word: { sheet: '★英単語', prefix: 'w' },
  chunk: { sheet: '★チャンク', prefix: 'c' },
  phrase: { sheet: '★文節和訳', prefix: 'p' },
  definition: { sheet: '★英文和訳', prefix: 's' },
};
export const FIELDS = [
  'row_number', 'level', 'question', 'correct', 'choice1', 'choice2', 'choice3',
  'total_correct', 'total_wrong', 'accuracy', 'current_streak', 'note', 'question_key',
];
const LEVELS = new Set(['A1', 'A2', 'B1', 'B2', 'C1', 'C2']);

const cleanString = (value) => String(value ?? '').trim();
const normalizeHeader = (value) => cleanString(value).replace(/^[A-Z]\s+/i, '').toLowerCase();
const chosenFlag = (value) => ['1', 'true', 'yes', 'y', '○', '〇', '対象'].includes(cleanString(value).toLowerCase());

export function convertSheet(rows, mode, filter) {
  const spec = MODES[mode];
  if (!spec || !Array.isArray(rows) || rows.length < 2) {
    throw new Error((spec?.sheet || mode) + ': 表形式の問題データが見つかりません。');
  }
  const headers = rows[0].map(normalizeHeader);
  for (const idx of [0, 1, 2, 3, 4, 5, 6, 12]) {
    if (headers[idx] !== FIELDS[idx]) {
      throw new Error(spec.sheet + ': ' + String.fromCharCode(65 + idx) + '列の見出しを確認してください。' +
        '（期待値: ' + FIELDS[idx] + '）');
    }
  }
  // N column is reserved for a manual inclusion flag on the word sheet.
  const flagIndex = headers.indexOf('target1800');
  if (filter === 'target1800' && mode === 'word' && flagIndex !== 13) {
    throw new Error('★英単語シートのN1に target1800 と入力し、対象語のN列に1を設定してください。');
  }

  const output = [];
  const seen = new Set();
  let omitted = 0;
  for (let index = 1; index < rows.length; index += 1) {
    const raw = rows[index] || [];
    if (raw.slice(0, 13).every((v) => cleanString(v) === '')) continue;
    const row = Object.fromEntries(FIELDS.map((column, i) => [column, cleanString(raw[i])]));
    row.level = row.level.toUpperCase();

    const include = filter === 'all'
      || (filter === 'target1800' && mode === 'word' && chosenFlag(raw[13]))
      || ((filter === 'a1a2' || filter === 'target1800') && (mode !== 'word' || filter === 'a1a2') && ['A1', 'A2'].includes(row.level));
    if (!include) { omitted++; continue; }

    const line = index + 1;
    if (!LEVELS.has(row.level)) throw new Error(spec.sheet + ' ' + line + '行：CEFRレベルが不正です。');
    if (!new RegExp('^' + spec.prefix + '\\d{6}$').test(row.question_key)
        || seen.has(row.question_key)) {
      throw new Error(spec.sheet + ' ' + line + '行：問題IDが不正または重複しています。');
    }
    seen.add(row.question_key);
    const answers = ['correct','choice1','choice2','choice3']
      .map((col) => row[col].normalize('NFKC').toLowerCase());
    if (!row.question || answers.some((x) => !x) || new Set(answers).size !== 4) {
      throw new Error(spec.sheet + ' ' + line + '行：問題文か選択肢に空欄・重複があります。');
    }
    for (const [field, value] of Object.entries(row)) {
      if (value.length > (field === 'note' ? 2500 : 1200)) {
        throw new Error(spec.sheet + ' ' + line + '行：' + field + 'が長すぎます。');
      }
    }
    output.push(row);
  }
  if (!output.length) throw new Error(spec.sheet + '：出題対象が0問です。絞り込み条件を確認してください。');
  return { rows: output, omitted };
}

export function prepareWorkbook(workbook, filter, toMatrix) {
  if (!workbook || !Array.isArray(workbook.SheetNames) || !['all', 'a1a2', 'target1800'].includes(filter)) {
    throw new Error('Excelまたは絞り込み条件が不正です。');
  }
  const modes = {};
  const counts = {};
  const omitted = {};
  for (const [mode, spec] of Object.entries(MODES)) {
    const sheet = workbook.Sheets[spec.sheet];
    if (!sheet) throw new Error(spec.sheet + ' シートがありません。');
    const matrix = toMatrix(sheet);
    const result = convertSheet(matrix, mode, filter);
    modes[mode] = result.rows;
    counts[mode] = result.rows.length;
    omitted[mode] = result.omitted;
  }
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (total > 24000) throw new Error('公開する問題は最大24000問までです。');
  return { modes, counts, total, omitted };
}
