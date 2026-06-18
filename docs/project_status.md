# Project Status

- 2026-06-18: study-appのExcelアップロードを現在選択中モードのシート名優先に修正。複数シートExcelでは対応シートがない場合に先頭シートへフォールバックせず、モード別rowsとしてPersistent Diskへ個別保存する方針を固定。
- 2026-06-18: study-appで指定3シートを含むExcelブックをアップロードした場合、英単語・チャンク・英文和訳の3モードへ自動振り分けして読み込む処理を追加。

- 2026-06-16: Render本番運用向けにNodeサーバーを追加し、共通問題データAPIを実装。
- 2026-06-16: RPG本体もRender APIの `GET /api/questions/current` を起動時に優先し、成功時は共通問題データ、失敗時のみ `data/default-words.csv` へフォールバックする構成へ変更。
- 2026-06-16: RPG本体と `study-app/` のどちらからアップロードしても `POST /api/questions/upload` で同じPersistent Disk上の共通問題データを更新する方針へ統一。
- 2026-06-16: `/`、`/study-app/`、`/admin/wordbook-batch/` のディレクトリURLはRenderサーバーが各 `index.html` に自動解決する。
- 2026-06-16: study-appとRenderアップロードAPIで、教材CSV/ExcelのA〜L列のみを標準列として読み、M列以降と重複ヘッダーを無視する正規化に対応。
- CSV/Excelアップロード後の問題データは、ブラウザlocalStorageではなくRender Persistent Disk想定の `/var/data/english_words_game/current-questions.json` に保存する。
- `study-app` は起動時・モード切替時に `/api/questions/current?mode=...` を優先し、取得失敗時のみ標準CSVへフォールバックする。
- GitHub Pagesでは端末間共有保存不可。PC・iPhone間で同じ問題データを読む確認はRender版URLで行う。

- 2026-06-16: UpTra/RPG本体から開く学習アプリ導線をRender版 （未確認のため未設定。Render Dashboardで正しいWeb Service URLを確認後、`https://<service>.onrender.com/study-app/` を設定） に統一し、GitHub Pages版では「サーバー保存不可」とRender版への誘導を表示する。

- 2026-06-17: study-appにWeb Speech APIによるC列 question の英語読み上げを追加。自動読み上げは初期ONで、手動の「🔊 もう一度聞く」ボタンも利用可能。

- 2026-06-17: RPG本体に音声ランダム設定、現在の声表示、効果音ON/OFF、正解/不正解効果音の複数ランダムパターンを追加。

- 2026-06-17: RPG本体とstudy-appの効果音ON/OFF設定を `englishWordsGame.soundEnabled` に統一し、Web Audio APIによる正解上昇音・不正解下降音を追加。初回ユーザー操作後のAudioContext resumeにも対応。

- 2026-06-17: 出題数設定の反映を確認・補強。study-app は選択件数で `state.questions` を slice する仕様をテストで固定し、RPG本体はランダム出題ON/OFFと選択件数 slice、実出題数ベースの進捗表示に対応。

- 2026-06-17: study-appの出題数デフォルトを10問に固定し、保存済みの不正値や `all` は10問にフォールバックするよう変更。音声選択プルダウンを追加し、Web Speech APIの英語系音声優先表示・保存復元・`voiceschanged` 対応を実装。英単語/チャンクモードのみ主要文字を拡大。

- 2026-06-17: study-appの音声選択にランダムを追加。既存の音声保存キーで `random` を保存復元し、読み上げごとに英語系音声を優先してランダム選択、使用音声名を表示するよう変更。

## 2026-06-18 study-app 音声選択フィルタ
- Web Speech API の音声候補から、`song` / `sing` / `music` / `歌` / `歌声` / `歌唱` / `うた` / `ミュージック` などを含む歌声・歌唱系音声を除外するようにしました。
- 音声選択プルダウン、ランダム選択、保存済み固定音声、自動選択時の候補解決で同じフィルタ済み候補を使います。
- 保存済み固定音声が除外対象だった場合は自動選択に戻し、候補がすべて除外された場合は Web Speech API の既定自動音声に任せます。
