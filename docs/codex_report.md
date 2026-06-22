## 今回やったこと
- study-app の勉強数カウンターを、今日・今月・今年・累計それぞれで英単語 / チャンク / 文節 / 英文 / 合計を表示するUIへ変更しました。
- 保存キー `englishWordsGame.studyApp.studyCounts.v1` は維持したまま、保存形式を version 2 として `byMode` / `byDateMode` を追加しました。
- version 1 の `total` / `byDate` を読み込んでも消さず、累計合計では既存 `total` を尊重する互換処理を追加しました。
- 1問解答時に現在の `state.mode` だけを1加算し、同じ問題の二重加算を防ぐ既存ガードが効くことをテストで確認しました。
- README / docs/project_status.md を更新しました。

## 変更ファイル
- `study-app/script.js`
- `study-app/index.html`
- `study-app/style.css`
- `tests_study_app_study_counts.js`
- `README.md`
- `docs/project_status.md`
- `docs/codex_report.md`

## テスト結果
- `npm test` を実行し、全テストが成功しました。
- 実行時に npm の `Unknown env config "http-proxy"` 警告が表示されましたが、テスト自体は成功しています。

## 注意点
- 既存 version 1 データの過去分にはモード別内訳がないため、仕様どおり過去分を各モードへ分配していません。
- そのため、移行直後の今日・今月・今年のモード別表示は、新しく解答した分から反映されます。累計合計だけは既存 `total` を尊重します。
- UI変更はコード・テストで確認しましたが、このコンテナにはブラウザ/スクリーンショット取得ツールがなく、スクリーンショット撮影は未実施です。

## 次にやるべきこと
- 実機ブラウザで、複数モードをまたいで回答したときの表示バランスを確認するとより安心です。

## チャッピーに相談すべき点
- version 1 由来の過去合計を、将来的に「内訳不明」行としてUIに出すべきかどうか。
