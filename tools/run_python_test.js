'use strict';

const { spawnSync } = require('child_process');

const candidates = [];
if (process.env.PYTHON) candidates.push({ command: process.env.PYTHON, args: [] });
candidates.push(
  { command: 'python3', args: [] },
  { command: 'python', args: [] },
  { command: 'py', args: ['-3'] },
);

for (const candidate of candidates) {
  const result = spawnSync(candidate.command, [...candidate.args, 'tests_fill_excel_choices.py'], { stdio: 'inherit' });
  if (result.error?.code === 'ENOENT') continue;
  if (result.error) {
    console.error(`Pythonテストを開始できません: ${result.error.message}`);
    process.exit(1);
  }
  process.exit(result.status ?? 1);
}

console.error('Pythonが見つかりません。PYTHON環境変数にPython実行ファイルを指定してください。');
process.exit(1);
