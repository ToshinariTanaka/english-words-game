## 今回やったこと
- `study-app` の共通問題データ取得で、HTTPエラー時も先にJSONを読める場合は読み、409かつ `{ legacy: true }` を旧形式保存データとして判定できるようにしました。
- 旧形式保存データの場合は標準CSVへフォールバックしつつ、4シートExcelの再アップロードを促す警告文を `uploadStatus` に表示するようにしました。
- 409 `{ legacy: true }` のJSON読み取り・例外属性・標準CSVフォールバック分岐を固定するテストを追加しました。
- `docs/next_tasks.md` の第2段階残作業メモを整理し、第3段階の残作業だけが残る形にしました。
- READMEとプロジェクトステータスに、旧形式共通問題データ時のフォールバック挙動を追記しました。

## 変更ファイル
- `study-app/script.js`
- `tests_study_app_legacy_shared_questions.js`
- `package.json`
- `README.md`
- `docs/project_status.md`
- `docs/next_tasks.md`
- `docs/codex_report.md`

## テスト結果
- `node tests_study_app_legacy_shared_questions.js`: 成功
- `npm test`: 成功

## 注意点
- UI文言の変更は `uploadStatus` のテキスト更新です。ブラウザ実機でのスクリーンショット確認は行っていません。
- 今回はクライアント側の409 `{ legacy: true }` ハンドリング追加が主目的で、サーバーAPIの仕様変更は行っていません。

## 次にやるべきこと
- 第3段階として、`question_key` の形式チェック、重複チェック、D〜G列重複チェックを追加する。
- 専用エラーボックスと最大20件のエラー一覧表示を追加する。
- Render実環境で旧形式保存データがある状態を再現し、警告表示と標準CSVフォールバックをブラウザで確認する。

## チャッピーに相談すべき点
- 旧形式保存データを検出した後、警告表示だけでなく管理者向けの削除・再アップロード導線を追加するか。
- 第3段階の `question_key` 厳格化で、既存教材の空欄行をエラーにするか警告にするか。
