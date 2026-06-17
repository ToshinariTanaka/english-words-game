# Architecture Notes

## 既存RPG本体

- `script.js`: ゲームロジック本体（出題、判定、Gold計算、復習モード、自動遷移）。
- `index.html`: 画面構成（home/battle/result/gameclear/gameover）。
- `style.css`: 共通UI + `feedbackOverlay`演出。

既存RPG本体はゲームロジックを維持しつつ、音声・効果音など学習体験に関わる小規模設定を追加する方針です。

### RPG本体の音声・効果音

- `script.js` はWeb Speech APIで英単語の読み上げを行う。英語系音声候補は `speechSynthesis.getVoices()` から `en-*` の `voice.lang` を持つ音声だけを抽出する。
- 音声候補が複数あり「音声ランダム」がONの場合は毎回ランダムに選ぶ。OFFの場合は取得できた英語音声の先頭を優先音声として固定する。
- iPhone/Safariなど初回に音声候補が空になる環境向けに `speechSynthesis.onvoiceschanged` で再取得する。候補がない場合は `utterance.lang = "en-US"` のみ指定してブラウザ標準に任せる。
- 正解/不正解の効果音はWeb Audio APIのoscillatorで生成し、それぞれ複数の周波数パターンからランダムに選ぶ。外部音声ファイルは使わない。
- 音声ランダム設定と効果音ON/OFFは `localStorage` に保存する。


## 新規: study-app

- `study-app/index.html`: ゲーム要素を含まない英語学習アプリの画面。モード選択、成績、4択、復習導線を持つ。
- `study-app/script.js`: 標準CSV読み込み、アップロードCSV/Excel読み込み、簡易CSVパース、SheetJS連携、モード切り替え、正誤判定、正答数/出題数/正答率、誤答復習を担当。
- `study-app/style.css`: スマホ優先のカード型UI。HP/Gold/敵/バトル演出などのゲーム表現は含めない。
- `study-app/script.js` の音声選択はWeb Speech APIの `speechSynthesis.getVoices()` を使い、「自動選択」「ランダム」「各音声」を `VOICE_STORAGE_KEY` で保存・復元する。`random` 選択時は `en-*` の英語系音声を優先候補にし、候補がなければ全音声、0件なら `utterance.voice` 未指定でブラウザに任せる。
- `speechSynthesis.onvoiceschanged` は維持し、Safariなどで音声一覧が遅延取得されても保存済みの `random` や固定音声の復元機会を残す。固定音声が取得済み一覧に存在しない場合は自動選択へフォールバックする。
- `study-app/data/word_mode.csv`: 英単語モード用CSV。
- `study-app/data/chunk_mode.csv`: チャンクモード用CSV。
- `study-app/data/definition_mode.csv`: 英文和訳モード用CSV。内部IDとファイル名は互換性維持のため `definition` のまま。

### study-app のCSV形式

最小構成では3モードとも次の列を使います。

```csv
row_number,level,question,correct,choice1,choice2,choice3,total_correct,total_wrong,accuracy,current_streak,note
```

- `level`: 問題カードに表示する難易度・教材レベルです。
- `question`: 英単語モードでは英単語、チャンクモードでは英語チャンク、英文和訳モードでは英文を入れます。
- `correct`: 正解を入れます。英文和訳モードでは英文全体の正しい日本語訳を入れます。
- `choice1`〜`choice3`: 不正解選択肢を入れます。英文和訳モードでは日本語の誤訳選択肢を入れます。
- アプリ側で `correct` + `choice1`〜`choice3` をシャッフルし、4択として表示します。
- `total_correct` / `total_wrong` / `accuracy` / `current_streak` はCSVから読み込み、初期版では問題ごとのCSV成績として表示のみ行います。
- `row_number` は問題IDとして扱います。学習履歴を将来保存する場合も、共通問題データ本体とは分離して設計します。
- 教材CSV/Excelは、元ヘッダーが `A row_number,B level,C question,...,L note` 形式でも、保存時は上記の標準ヘッダーへ正規化します。
- 読み込み時は最初の12列（A〜L）だけを標準列として位置ベースで読み、M列以降は無視します。後方に重複ヘッダーがあってもA〜L列を上書きしません。
- 出題対象は `question` / `correct` / `choice1`〜`choice3` がそろった行だけです。不足行はエラーにせずスキップします。

今後、モードごとに列を拡張する場合も、既存RPG本体や既存CSV管理ツールとは別管理にします。

## admin/wordbook-batch

- `admin/wordbook-batch/index.html`: 管理者・教材作成者向けCSVバッチ編集画面。用途選択はプロンプト生成文だけに反映し、列構造や貼り戻し仕様は変更しない。
- `admin/wordbook-batch/script.js`: CSVパース、50行/範囲抽出、チャッピー用プロンプト生成、貼り戻し、チェック、CSV書き出しを担当。用途別文言は `PURPOSE_GUIDANCE` に集約。

## tools/fill_excel_choices.py

- `tools/fill_excel_choices.py`: ローカル実行用のExcel補完CLI。study-app列形式の `.xlsx` を読み込み、`choice1`〜`choice3` がすべて空欄の行を未補完行として抽出する。
- 50行単位でOpenAI Chat Completions APIへ `row_number,level,question,correct` のCSVを送り、AI出力を `row_number,choice1,choice2,choice3` のCSVに限定するプロンプトを使う。
- プロンプトでは `choice1`〜`choice3` を `correct` と同じ言語にすることを明記する。特に `question` が英単語で `correct` が日本語の場合は日本語4択問題として扱い、英単語・英語類義語・英語表現を選択肢に含めない。
- 選択肢品質ルールとして、`correct` の単なる類義語・派生語・`correct` を含む語・同一意味領域の近縁語連発を禁止し、誤答3個は意味領域を分散させ、混同しやすいが別概念の語を優先する。
- `row_number` をキーにExcelへ貼り戻し、`correct` と不正解選択肢の重複、選択肢同士の重複、空欄、日本語 `correct` に対する英語選択肢混入を検証する。検証NGの行だけを再試行対象にする。
- バッチ完了ごとに `output_completed.xlsx` へ保存し、例外発生時も処理済み部分を保存して停止する。再実行時は空欄のまま残った行から再開する。
- 既存RPG本体、study-app本体、ブラウザ管理ツールとは独立した補助ツールとして配置する。

### study-app の英文和訳モード

`study-app/script.js` のモードキー `definition` は既存URL/CSV名との互換性のため変更しません。ただし `study-app` では表示名を「英文和訳モード」とし、説明文は「英文を読んで、正しい日本語訳を選びます。」です。列判定は `question` / `英文` / `英語` / `問題` を英文として優先し、`correct` / `和訳` / `日本語訳` / `意味` / `正解` を日本語訳として優先します。RPG本体の `definition` モードは英英辞典モードのまま別仕様として維持します。


## 共通問題データの読み込み方針

Render版の `study-app/` は共通問題データAPIを正本として扱います。GitHub Pagesなどの静的ホスティングではサーバー保存不可のため、以下の標準CSVをフォールバックとして読み、画面でRender版へ誘導します。

1. 英単語モード: `study-app/data/word_mode.csv`
2. チャンクモード: `study-app/data/chunk_mode.csv`
3. 英文和訳モード: `study-app/data/definition_mode.csv`

起動時・モード切替時は常に標準CSVを `fetch` し、`IndexedDB` / `localStorage` に保存された過去のアップロードデータを標準CSVより優先しません。CSV/Excelアップロードは現在表示中モードの一時確認用で、ページ再読み込みやモード切替後は再び標準CSVへ戻ります。

ルートRPG本体は `data/default-words.csv` を標準問題として読み込みます。CSV/Excelアップロードは同様に一時確認用であり、アップロード本文を `localStorage` に保存して次回起動時に優先する仕様は廃止しています。なお、Goldなど問題データ本体ではないユーザー状態の保存は既存どおり別用途として扱います。

## Render共通問題データAPI

Render版は `server.js` が静的ファイルとAPIを同一オリジンで提供します。アップロードされたCSV/Excelはサーバー側で行データへ変換し、Persistent Disk想定の `/var/data/english_words_game/current-questions.json` に保存します。

- `GET /api/questions/current?mode=word|chunk|definition`: 保存済み行データを返す。未保存なら404。
- `POST /api/questions/upload`: `multipart/form-data` の `mode` と `file` を受け取り、CSV/Excelを変換して保存する。
- `POST /api/study-app/upload`: study-app向けの互換アップロードAPI。A〜L列だけを標準列として読み、`/var/data/study-app/{word_mode.csv,chunk_mode.csv,definition_mode.csv}` に標準CSVとしても保存する。
- `GET /api/questions/status?mode=word|chunk|definition`: 保存状態、問題数、最終更新日時を返す。

`study-app` は共通問題データAPIを正本として扱い、localStorageは取得済みデータの補助キャッシュに限定します。API取得失敗時のみ標準CSVを読み込みます。GitHub Pages版では `/api/questions/upload` が存在しないため、アップロード失敗時にサーバー保存不可とRender版URL （未確認のため未設定。Render Dashboardで正しいWeb Service URLを確認後、`https://<service>.onrender.com/study-app/` を設定） を表示します。

## Render統一後のURLとデータ正本

Render版では `server.js` が静的ファイルとAPIを同一オリジンで提供します。URLは以下のまま利用します。

- `/` → RPG本体（`/index.html`）
- `/study-app/` → 学習アプリ（`/study-app/index.html`）
- `/admin/wordbook-batch/` → 管理ツール（`/admin/wordbook-batch/index.html`）

ディレクトリURLでアクセスされた場合は、サーバー側で末尾の `index.html` を自動解決します。

共通問題データの正本はRender APIです。

- `GET /api/questions/current`: RPG本体が起動時に読む現在の共通問題データ。保存済みデータがなければ404。
- `GET /api/questions/current?mode=word|chunk|definition`: 学習アプリがモード別に読む共通問題データ。従来のRender API利用を維持。
- `POST /api/questions/upload`: RPG本体・学習アプリのどちらからアップロードしてもPersistent Disk上の同じJSONを更新する。
- `GET /api/questions/status`: 現在の共通問題データの保存状態を返す。`?mode=...` 指定も可能。

保存先JSONには、互換性維持のためモード別データ（`modes`）と、最後にアップロードされた現在データ（`current`）を保持します。RPG本体は `current` を優先し、未保存時は `modes.word` をフォールバックとして扱います。学習アプリは従来どおり `?mode=...` を使います。

RPG本体の起動順は以下です。

1. `GET /api/questions/current` を取得する。
2. 取得成功かつRPGで使える行が4問以上なら「共通問題データから○問を読み込みました」を表示する。
3. 取得失敗時のみ `data/default-words.csv` を読み込む。
4. 標準CSVも失敗した場合だけ内蔵サンプルを利用する。

RPG本体のアップロードは、CSV/ExcelをブラウザでCSV化して `POST /api/questions/upload` に送信します。保存成功後、同じ内容をRPG画面にも読み込みます。
