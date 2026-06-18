## 今回やったこと
- 学習履歴localStorage保存のキーを「モード名::固定シート名::問題文」に統一しました。
- Excelシート名の別名を履歴キー用の固定シート名へ正規化しました。
- 正解/不正解の累計、直近10件、累計正解率、直近10回正解率、苦手チェック、履歴クリアをlocalStorageで扱う処理を追加しました。
- 学習履歴専用テストを追加し、npm testに組み込みました。
- README / docsのH〜L列に関する旧仕様説明を整理しました。

## 変更ファイル
- study-app/script.js
- study-app/index.html
- tests_study_app_learning_stats.js
- package.json
- README.md
- docs/architecture.md
- docs/next_tasks.md
- docs/codex_report.md

## テスト結果
- `node tests_study_app_learning_stats.js`: 成功
- `npm test`: 成功

## 注意点
- 学習履歴は端末ごとのlocalStorage保存であり、Render APIや共通問題データには同期しません。
- CSV/ExcelのH〜L列は互換性のため読み込み自体は維持しますが、学習履歴の初期値としては利用しません。
- UIの大きな見た目変更ではないためスクリーンショットは取得していません。

## 次にやるべきこと
- 苦手チェック済み問題だけを出題するフィルタが必要か検討する。
- localStorage履歴のエクスポート/インポート要否を検討する。

## チャッピーに相談すべき点
- 学習履歴を端末間同期する必要があるか。
- 苦手チェックと復習機能をどのように統合するか。
