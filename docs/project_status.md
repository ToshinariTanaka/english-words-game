# Project Status

- 2026-06-16: Render本番運用向けにNodeサーバーを追加し、共通問題データAPIを実装。
- 2026-06-16: RPG本体もRender APIの `GET /api/questions/current` を起動時に優先し、成功時は共通問題データ、失敗時のみ `data/default-words.csv` へフォールバックする構成へ変更。
- 2026-06-16: RPG本体と `study-app/` のどちらからアップロードしても `POST /api/questions/upload` で同じPersistent Disk上の共通問題データを更新する方針へ統一。
- 2026-06-16: `/`、`/study-app/`、`/admin/wordbook-batch/` のディレクトリURLはRenderサーバーが各 `index.html` に自動解決する。
- 2026-06-16: study-appとRenderアップロードAPIで、教材CSV/ExcelのA〜L列のみを標準列として読み、M列以降と重複ヘッダーを無視する正規化に対応。
- CSV/Excelアップロード後の問題データは、ブラウザlocalStorageではなくRender Persistent Disk想定の `/var/data/english_words_game/current-questions.json` に保存する。
- `study-app` は起動時・モード切替時に `/api/questions/current?mode=...` を優先し、取得失敗時のみ標準CSVへフォールバックする。
- GitHub Pagesでは端末間共有保存不可。PC・iPhone間で同じ問題データを読む確認はRender版URLで行う。

- 2026-06-16: UpTra/RPG本体から開く学習アプリ導線をRender版 `https://english-words-game.onrender.com/study-app/` に統一し、GitHub Pages版では「サーバー保存不可」とRender版への誘導を表示する。
