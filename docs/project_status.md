# Project Status

- バージョン: v0.10.1
- 直近対応: `study-app/` の3モードCSVを新形式（問題ID・不正解3択・表示用学習成績付き）へ移行
- 既存機能影響: なし（ルートの `index.html` / `style.css` / `script.js` は変更せず、既存RPG本体を維持）
- 新規アプリ概要: 英単語 / チャンク / 英英辞典の3モードを別CSVから読み込み、`correct` + `choice1`〜`choice3` をシャッフルした4択・正誤表示・次問・正答数・出題数・正答率・誤答復習を提供
- 次の重点: row_numberをキーにしたlocalStorage学習履歴保存、実機ブラウザでの表示確認、GitHub Pages上でのパス確認
