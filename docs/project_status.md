# Project Status

- バージョン: v0.10.2
- 直近対応: `study-app/` の3モードCSVを `level` 付き新形式へ移行し、CSV/Excelアップロード読み込みを追加
- 既存機能影響: なし（ルートの `index.html` / `style.css` / `script.js` は変更せず、既存RPG本体を維持）
- 新規アプリ概要: 英単語 / チャンク / 英英辞典の3モードで標準CSVまたは手元の `.csv` / `.xlsx` を読み込み、`level` 表示、`correct` + `choice1`〜`choice3` をシャッフルした4択、正誤表示、次問、正答数・出題数・正答率、誤答復習を提供
- 次の重点: row_numberをキーにしたlocalStorage学習履歴保存、実機ブラウザでのアップロードUI確認、GitHub Pages上でのSheetJS CDN読み込み確認
