# Project Status

- 2026-06-16: Render本番運用向けにNodeサーバーを追加し、共通問題データAPIを実装。
- CSV/Excelアップロード後の問題データは、ブラウザlocalStorageではなくRender Persistent Disk想定の `/var/data/english_words_game/current-questions.json` に保存する方針へ変更。
- `study-app` は起動時・モード切替時に `/api/questions/current?mode=...` を優先し、取得失敗時のみ標準CSVへフォールバックする。
- GitHub Pagesでは端末間共有保存不可。Render版URLではPC・iPhone・ログインIDに関係なく同じ問題データを参照する。
