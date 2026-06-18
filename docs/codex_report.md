## 今回やったこと
- study-app のExcelアップロードで、ファイル名ではなく現在選択中モードとシート名の対応を使って読み込むよう修正しました。
- 複数シートExcelで現在モードに対応するシートがない場合、先頭シートを勝手に読み込まず、対応シート名を案内するエラーを出すようにしました。
- 英単語・チャンク・英文和訳の対応シート名を追加し、見つかったシートはモード別 rows として保持・保存するようにしました。
- 複数シートExcelのモード混在防止を確認するテストを更新しました。
- README、architecture、project_status、next_tasks に今回のExcelシート選択仕様を反映しました。

## 変更ファイル
- `study-app/script.js`: シート名エイリアス、現在モード優先のExcel解析、複数シート時のフォールバック禁止、モード別保存処理を修正。
- `tests_study_app_workbook_modes.js`: 対応シート名、ファイル名判定廃止、複数シート時の先頭シートフォールバック禁止、モード別保存を検証。
- `README.md`: study-app のExcelブックアップロード仕様を現在モード・シート名ベースへ更新。
- `docs/architecture.md`: Excelブック読み込み設計を現在モード・シート名ベースへ更新。
- `docs/project_status.md`: 2026-06-18時点の修正状況を追記。
- `docs/next_tasks.md`: 実教材Excelでのブラウザ確認タスクを追記。
- `docs/codex_report.md`: 今回の作業内容へ更新。

## テスト結果
- `node --check study-app/script.js`: PASS。study-app の JavaScript 構文チェックに成功しました。
- `node tests_study_app_workbook_modes.js`: PASS。複数シートExcelのモード別シート選択に関する静的検証に成功しました。
- `npm test`: PASS。既存テストと更新テストがすべて成功しました。npm から `Unknown env config "http-proxy"` の警告は出ましたが、テスト自体は成功しています。

## 注意点
- 実教材Excelファイルはこの環境にないため、実ブラウザでのアップロード確認は未実施です。
- UIのレイアウト変更はなく、エラーメッセージと読み込みロジックの変更のみです。スクリーンショットは取得していません。
- 単一シートExcelは従来互換のため、現在選択中モード用の単一アップロードとして扱います。

## 次にやるべきこと
- Render版 `/study-app/` で実教材Excelをアップロードし、英単語・チャンク・英文和訳それぞれで別モードの C列 `question` が混入しないことを確認してください。
- PCでアップロード後、iPhoneで `/api/questions/current?mode=word|chunk|definition` 相当のデータがモード別に取得されることを確認してください。

## チャッピーに相談すべき点
- 対応シート名が一部だけ存在する複数シートExcelを、存在モードだけ保存する現行仕様で問題ないか相談してください。
- 単一シートExcelでもシート名が別モード名の場合にエラー化するか、従来互換を優先して現在モードとして扱うか相談してください。
