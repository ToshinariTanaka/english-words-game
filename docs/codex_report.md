## 今回やったこと
- 第3段階PRの正式Workbook検証仕様を維持しつつ、study-app側のアップロード検証エラー表示が未定義関数で落ちないように専用表示関数を追加しました。
- `definition` モードの `question_key` 接頭辞は `s` のまま維持しました。
- サーバー側・study-app側で、B列 `level`、M列 `question_key`、D〜G列の正規化後重複、C〜G列が揃った出題対象行のみ保存/読込する検証を揃えました。
- HTML特殊文字を含む検証エラーは `textContent` とDOM生成で表示し、HTMLとして解釈されないようにしました。

## 変更ファイル
- `server.js`: 正式Workbook検証、出題対象行のみの保存、構造化エラーレスポンスを追加。
- `study-app/script.js`: 事前検証、専用エラーボックス、HTML安全表示を追加。
- `study-app/style.css`: 専用エラーボックスの最低限の表示スタイルを追加。
- `tests_server_workbook_api.js`: 第3段階仕様の維持確認と `definition` 接頭辞 `s` のテストを更新。
- `tests_study_app_upload_validation_errors.js`: 未定義関数で落ちないこととHTML特殊文字の安全表示テストを追加。
- `package.json`: 新規テストを `npm test` に追加。

## テスト結果
- `npm test`: 成功。
- `git diff --check`: 成功。

## 注意点
- UI変更は既存アップロード欄直下に検証エラーをDOM生成で追加する軽微な変更です。スクリーンショット取得が必要な見た目の大幅変更はありません。
- 旧 `/api/questions/upload` と `/api/study-app/upload` は引き続き410です。

## 次にやるべきこと
- 実際の公式Excelで、サーバー保存後の4モード件数と未完成行除外を手動確認してください。

## チャッピーに相談すべき点
- エラー表示件数の上限（現在20件）や文言を利用者向けにさらに調整するか確認してください。
