## 今回やったこと
- PR #79で消えていた「チャンク」ボタンを復旧し、学習モードを `word` / `chunk` / `phrase` / `definition` の4つに戻しました。
- `chunk` は `★チャンク` / `chunk_mode.csv`、`phrase` は `★文節和訳` / `phrase_mode.csv`、`definition` は `★英文和訳` / `definition_mode.csv` として明確に分離しました。
- `/api/questions/current?mode=phrase` が `chunk` に正規化される処理を削除し、サーバー側でも4モードを個別保存・個別返却するよう修正しました。
- 「文節和訳」などの別名を `chunk` 側に含めないようにし、曖昧な「和訳」だけでシート判定しない構成へ戻しました。
- 文節和訳データが空の場合は「文節和訳データがありません」と表示し、英文和訳へフォールバックしないことをテストで固定しました。
- UI変更として、学習モードボタンは「英単語」「チャンク」「文節和訳」「英文和訳」の4つに戻しています（スクリーンショット取得はこのCLI環境では未実施）。

## 変更ファイル
- `study-app/index.html`: 学習モードボタンを4ボタン構成に復旧。
- `study-app/script.js`: `MODES`、公式シート、キー接頭辞、API mode正規化、空データ表示、モードUIクラスを4モード仕様へ修正。
- `server.js`: 保存対象・取得対象・正式アップロード検証を4モード仕様へ修正し、`phrase` を `chunk` に寄せないように変更。
- `tests_study_app_hotfix_modes.js`: hotfix対象の4モード分離・phrase非フォールバックを検証するテストを追加。
- `tests_study_app_phase1_modes.js`, `tests_server_workbook_api.js`, `tests_study_app_workbook_modes.js`, `tests_study_app_legacy_shared_questions.js`, `tests_study_app_learning_stats.js`, `package.json`: 4モード仕様に合わせて既存テストとテスト実行順を更新。
- `README.md`, `docs/project_status.md`: 4モード仕様への復旧を反映。

## テスト結果
- `npm test` を実行し、全テストが成功しました。

## 注意点
- Render本番はPR #78へRollback済みとのことなので、このhotfixをmainへマージ後にRenderへ再デプロイし、`/study-app/` で4ボタン表示と各modeのデータ分離を実ブラウザで確認してください。
- このCLI環境ではブラウザスクリーンショットを取得していません。UI差分は `study-app/index.html` とテストで確認しています。

## 次にやるべきこと
- Renderへデプロイ後、`/api/questions/current?mode=chunk` / `phrase` / `definition` がそれぞれ別データを返すことを本番データで確認する。
- `/study-app/` で4モードを順に切り替え、問題が混ざらないことを目視確認する。

## チャッピーに相談すべき点
- 既存教材Excelに `★文節和訳` シートが必ず含まれる運用で問題ないか、また旧3シート教材の移行手順を用意するか相談してください。
