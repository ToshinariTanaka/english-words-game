## 今回やったこと
- study-appの正式アップロード導線を `.xlsx` の4シートExcel専用に変更しました。
- 新API `POST /api/questions/upload-workbook` を追加し、4モードを `schema_version: 2` の共通問題データとして一括保存するようにしました。
- 旧API `POST /api/questions/upload` は使用不可（410）に変更しました。
- `GET /api/questions/current` / `status` を4モード・旧形式無効化に対応しました。
- 第2段階用のサーバー/APIテストとstudy-app導線テストを追加・更新しました。

## 変更ファイル
- `server.js`: workbook一括アップロード、schema_version: 2保存、旧形式無効化、旧アップロードAPI停止。
- `study-app/index.html`: アップロードUIを4シートExcel専用表記・`.xlsx` acceptに変更。
- `study-app/script.js`: 正式4シート完全一致チェック、完成行抽出、新API送信、旧形式警告フォールバック対応。
- `tests_server_workbook_api.js`: 新APIと保存形式のサーバー側テストを追加。
- `tests_study_app_workbook_modes.js`: study-app側アップロード導線テストを第2段階仕様へ更新。
- `package.json`: `npm test` に新テストを追加。
- `README.md`, `docs/project_status.md`, `docs/architecture.md`, `docs/next_tasks.md`: 第2段階仕様に更新。

## テスト結果
- `npm test`: PASS。既存テストと新規 `tests_server_workbook_api.js` を含めて成功しました。
- UIスクリーンショット: ローカルにブラウザ実行環境（chromium/google-chrome）が見つからず未取得です。HTML上の文言・accept属性はテストで確認しました。

## 注意点
- 第2段階のため、`question_key` 形式・重複、level厳格チェック、選択肢正規化、詳細エラー一覧、専用エラーボックスは未実装です。
- サーバーは旧 `schema_version: 2` なしの保存データを読み込まず、study-appは標準CSVへフォールバックします。
- `POST /api/study-app/upload` は互換用に残していますが、study-app正式導線からは使いません。

## 次にやるべきこと
- 第3段階で詳細バリデーション、行番号付きエラー、専用エラーボックスを追加する。
- 本番Render環境でPersistent Disk上の旧 `current-questions.json` が旧形式の場合、新形式Excelを再アップロードする。
- ブラウザ環境でstudy-app画面の手動確認とスクリーンショット取得を行う。

## チャッピーに相談すべき点
- 第3段階のエラー表示文言と最大20件表示の具体フォーマット。
- `question_key` 接頭辞（word=w/chunk=c/phrase=p/definition=s）の厳格ルール確定。
