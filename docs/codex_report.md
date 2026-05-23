## 今回やったこと
- `admin/wordbook-batch` の「4. チャッピー出力貼り戻し」で、quoted CSV（カンマ・改行・エスケープ付き）を正しく扱うように修正。
- 貼り戻し処理のCSV解析を単純分割ではなく既存CSVパーサー経由に統一。
- コードフェンス（```csv / ```）除去後に、ヘッダー有無を判定して15列（`row_number`〜`note`）でマッピングする実装に変更。
- 列不足やrow_number不正時に「何行目で何が不足/不正か」を返すエラーメッセージを追加。
- 貼り戻し成功行は `status` を強制的に `completed` に設定するよう変更。
- 「次の未処理50行を抽出」は `status !== completed` の行を対象にする仕様へ変更。

## 変更ファイル
- `admin/wordbook-batch/script.js`
- `docs/codex_report.md`

## テスト結果
- `node --check admin/wordbook-batch/script.js` : PASS

## 注意点
- 今回はブラウザUIの手動操作（実CSVでの貼り戻し実演）まではこの環境で未実施。
- 貼り戻しは15列未満をエラーにするため、ChatGPT出力列が欠けると反映されない（意図通り）。

## 次にやるべきこと
- 実データで「quoted comma」「quoted newline」「コードフェンス付きCSV」「ヘッダーあり/なし」を網羅した手動検証を実施。
- 必要ならテスト用の最小CSV fixture と回帰テスト（Playwright等）を追加。

## チャッピーに相談すべき点
- `status` を常に `completed` 強制する運用が今後も妥当か（`要確認` 等のワークフローを残すか）。
- 貼り戻し時に「現在の50行外のrow_number」を無視ではなく警告一覧表示にするか。
