## 今回やったこと
- study-appを4モード（英単語 / チャンク / 文節和訳 / 英文和訳）に変更し、内部mode `phrase` を追加しました。
- 正式シート名 `★英単語` / `★チャンク` / `★文節和訳` / `★英文和訳` を履歴キーに使う基礎対応を入れました。
- A〜M列形式に合わせて `question_key` をCSV/Excel読み込み・正規化・学習履歴キーへ反映しました。
- localStorage `englishGameLearningStats` を `schema_version: 2` + `items` 形式へ変更し、旧形式は起動時相当の読み込み時に削除するようにしました。
- 標準CSVを4ファイル構成にし、`phrase_mode.csv` を追加しました。
- 4モードの表示サイズ方針に合わせて、文節和訳・英文和訳の問題文/選択肢サイズを調整しました。
- 第1段階用のテストを追加・更新しました。

## 変更ファイル
- study-app/script.js
- study-app/index.html
- study-app/style.css
- study-app/data/word_mode.csv
- study-app/data/chunk_mode.csv
- study-app/data/phrase_mode.csv
- study-app/data/definition_mode.csv
- tests_study_app_phase1_modes.js
- tests_study_app_definition_mode.js
- tests_study_app_workbook_modes.js
- tests_study_app_learning_stats.js
- package.json
- README.md
- docs/architecture.md
- docs/project_status.md
- docs/next_tasks.md
- docs/codex_report.md

## テスト結果
- `npm test`: 成功

## 注意点
- 第1段階のため、CSV単体アップロード廃止、`.xlsx` のみ許可、4シート必須チェック、シート名完全一致チェック、一括アップロードAPI新設、既存API無効化、Render保存データのschema変更、question_key厳格検証/重複検証、専用エラーボックスは未実装です。
- `question_key` が空の既存データは互換性のため問題文フォールバックで履歴キーを作ります。正式教材ではM列 `question_key` を入れる前提です。
- UI変更はコード・CSSで反映しましたが、この環境ではブラウザ実機スクリーンショットは取得していません。

## 次にやるべきこと
- 第2段階で `.xlsx` 一括アップロードAPI `POST /api/questions/upload-workbook` を新設し、既存 `POST /api/questions/upload` の扱い変更を進める。
- 第2段階で4シート必須・正式シート名完全一致・Render保存データの `schema_version: 2` 対応範囲を決める。
- 第3段階で `question_key` 形式チェック、重複チェック、D〜G列重複チェック、最大20件の専用エラー表示を追加する。
- 実ブラウザで4モード切替、読み上げ、復習、レベル範囲、アップロード互換を確認する。

## チャッピーに相談すべき点
- `question_key` 空欄行を第2段階で許容し続けるか、第3段階までに警告扱いへ移行するか。
- 旧シート名互換をいつ完全に外すか。
- localStorage旧履歴を削除する仕様について、利用者向け告知文をUIに出す必要があるか。
