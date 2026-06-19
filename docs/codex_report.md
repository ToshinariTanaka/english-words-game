## 今回やったこと
- `server.js` の共通問題データ保存形式を `schema_version: 2` の4モード一括保存形式へ更新しました。
- `GET /api/questions/current?mode=...` は `schema_version: 2` がない保存データを旧形式として扱い、409 `{ ok:false, legacy:true }` を返すようにしました。
- `GET /api/questions/status` は4モード全体の件数、`schema_version`、保存日時、ファイル名を返すようにしました。
- 旧 `POST /api/questions/upload` / `/api/study-app/upload` は使用不可にし、新API `/api/questions/upload-workbook` への案内エラーを返すようにしました。
- study-appの正式アップロードを、完全一致シート名 `★英単語` / `★チャンク` / `★文節和訳` / `★英文和訳` を持つ `.xlsx` 4シートExcelのみにしました。
- 単一CSV/単一シートExcelは一時確認用として画面読み込みのみ行い、共通保存しないようにしました。
- 実サーバーを起動してWorkbook APIを検証する `tests_server_workbook_api.js` を追加しました。

## 変更ファイル
- `server.js`
- `study-app/script.js`
- `tests_server_workbook_api.js`
- `tests_study_app_workbook_modes.js`
- `package.json`
- `README.md`
- `docs/architecture.md`
- `docs/project_status.md`
- `docs/codex_report.md`

## テスト結果
- `npm test`: 成功
- `git diff --check`: 成功

## 注意点
- サーバー側の `.xlsx` 読み込みは、既存環境にある `python3` と `openpyxl` を使って行います。Render環境でも `openpyxl` が利用できるかはデプロイ時に確認が必要です。
- 旧API `/api/questions/upload` は410を返すため、RPG本体など旧APIを呼ぶ画面は新API対応までサーバー共通保存できません。
- UIの大きな見た目変更はありません。スクリーンショット確認は行っていません。

## 次にやるべきこと
- Render本番環境で `python3` / `openpyxl` が利用できることを確認する。
- RPG本体のアップロード導線を第2段階仕様に合わせて見直す。
- 第3段階として `question_key` の形式・重複チェック、選択肢重複チェックを追加する。

## チャッピーに相談すべき点
- Render環境に `openpyxl` を明示的に入れるため、依存関係ファイルを追加するか。
- 旧APIを使うRPG本体の保存導線を無効化するか、新Workbook APIへ移行するか。
