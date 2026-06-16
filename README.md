# english-words-game

英単語を倒してgoldを稼ぐ英語学習RPGです。既存のRPG本体は `index.html` / `style.css` / `script.js` で維持しています。

## 新規: 英語学習アプリ（最小構成）

ゲーム要素を削除した英語学習アプリを `study-app/` に追加しました。PC・iPhone共通保存を使う本番導線はRender版 `https://english-words-game.onrender.com/study-app/` に統一します。GitHub Pages版は標準CSVの閲覧・一時確認のみで、サーバー保存はできません。

- 起動ファイル: `study-app/index.html`
- ロジック: `study-app/script.js`
- スタイル: `study-app/style.css`
- データ:
  - `study-app/data/word_mode.csv`（英単語モード）
  - `study-app/data/chunk_mode.csv`（チャンクモード）
  - `study-app/data/definition_mode.csv`（英文和訳モード。内部IDは互換性維持のため `definition`）

### 学習アプリで残した機能

- 4択問題
- 正解・不正解表示
- 次の問題へ進む
- 正答数 / 出題数 / 正答率
- 間違えた問題の復習

### 学習アプリから削除したゲーム要素

- HP
- Gold
- 敵キャラ
- バトル演出
- レベルアップ
- 報酬倍率

### CSV形式

モードごとに別CSVを読み込みます。最小構成では3モード共通で以下の列を使います。

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
- `A row_number`〜`L note` 形式の教材CSV/Excelも受け入れます。読み込み時は最初の12列（A〜L）だけを標準列として扱い、M列以降の余分な列や後方の重複ヘッダーは無視します。
- `question` / `correct` / `choice1`〜`choice3` がそろった行だけを出題し、選択肢不足行はエラーにせずスキップします。
- Render版では各モードの起動時・モード切替時に `GET /api/questions/current?mode=...` を優先し、未保存・取得失敗時のみ標準の `study-app/data/*.csv` を読み込みます。画面から手元の `.csv` / `.xlsx` をアップロードすると `POST /api/questions/upload` でサーバー保存します。GitHub Pages版では `/api/questions/upload` が存在しないため、画面上に「サーバー保存不可」とRender版への誘導を表示します。


## 標準問題ファイルの自動読み込み（2026-06-16）

Render版の `study-app/` は、全端末・全ブラウザ・全ログイン状態で同じ問題を使うため、Render API上の共通問題データを正本として扱います。未保存時の初期データとして、以下の標準CSVへフォールバックします。

- 英単語モード: `study-app/data/word_mode.csv`
- チャンクモード: `study-app/data/chunk_mode.csv`
- 英文和訳モード: `study-app/data/definition_mode.csv`

Render版では起動時・モード切替時に共通問題データAPIを優先し、取得できない場合のみ上記CSVを読み込みます。過去にアップロードしたCSV/Excelを `localStorage` / `IndexedDB` から復元して標準CSVより優先することはありません。GitHub Pages版でのアップロードはサーバー保存不可のため一時確認用です。全端末で共通利用したい問題はRender版URLからアップロードしてください。

ルートのRPG本体も、起動時は `./data/default-words.csv` を標準問題として読み込みます。ルート画面のCSV/Excelアップロードも一時確認用で、端末内保存したアップロードデータを次回起動時に優先する仕様は廃止しました。

## UI更新（2026-05-13）
- 解答後の結果画面に強調オーバーレイを追加（正解/不正解を瞬時に判別可能）。
- 正解: ✅ / 緑グロー / ポップ演出 / `+○ Gold`強調 / キラキラ演出。
- 不正解: ❌ / 赤グロー / 横揺れ / 正解表示 / `ライフ -○`強調。
- 既存のGold倍率・ヒント減額・誤答復習・自動遷移ロジックは維持。

## 管理ツール更新（2026-06-03）
- `admin/wordbook-batch` を「英単語CSV 50行バッチ編集ツール」として汎用化。
- 中学英単語・高校/大学受験・英検・TOEIC・教科書/定期テスト・カスタムの用途選択を追加。
- 既存のCSV列仕様、50行抽出、指定範囲抽出、貼り戻し、CSV出力の基本機能は維持。

## ローカルPythonツール: study-app用Excelの選択肢自動補完

`tools/fill_excel_choices.py` は、study-app用の `.xlsx` を読み込み、`choice1`〜`choice3` がすべて空欄の行だけをOpenAI APIで50行ずつ補完するローカル実行用ツールです。既存の英単語RPG本体や `study-app/` の画面は変更しません。

### セットアップ

```bash
python3 -m pip install -r tools/requirements.txt
export OPENAI_API_KEY="sk-..."
```

### 実行例

```bash
python3 tools/fill_excel_choices.py input.xlsx
```

- 入力列は `row_number,level,question,correct,choice1,choice2,choice3,total_correct,total_wrong,accuracy,current_streak,note` を想定します。
- `choice1`〜`choice3` がすべて空欄の行を未補完行として扱います。
- AIには `row_number,level,question,correct` だけを渡し、`row_number,choice1,choice2,choice3` CSVだけを受け取ります。
- `choice1`〜`choice3` は `correct` と同じ言語で作るよう指示します。英単語モードのように `question` が英単語で `correct` が日本語の場合は、日本語4択問題として扱い、英単語・英語フレーズ・英語類義語を不正解選択肢に入れないよう明記しています。さらに、`correct` が日本語を含む場合は `choice1`〜`choice3` に英字 `[A-Za-z]` が1文字でも含まれると不正として再試行します。
- 選択肢品質ルールとして、`correct` の単なる類義語・派生語・`correct` を含む語・同一意味領域の近縁語連発を禁止し、誤答3個の意味領域を分散させ、学習者が混同しやすいが別概念の語を優先するよう指示します。
- `row_number` をキーに元Excelへ貼り戻し、`correct` との重複、選択肢同士の重複、空欄、日本語の `correct` に対する英語選択肢混入を検出します。
- 不正行は最大3回再試行し、50行ごとに `output_completed.xlsx` へ途中保存します。
- エラー時は処理済み部分を保存して停止するため、再実行すると未補完行から再開できます。

主なオプション:

```bash
python3 tools/fill_excel_choices.py input.xlsx \
  --output output_completed.xlsx \
  --sheet Sheet1 \
  --model gpt-4.1-mini \
  --batch-size 50 \
  --max-retries 3
```

### study-app の英文和訳モードについて

`study-app` の `definition` 内部IDは互換性のため維持し、表示名だけでなく処理も英文和訳モードとして扱います。標準ファイル名も `study-app/data/definition_mode.csv` のままです。C列相当の `question` に英文、D列相当の `correct` に英文全体の日本語訳、E〜G列相当の `choice1`〜`choice3` に日本語の誤訳選択肢を入れます。旧ファイル名のアップロードは可能ですが、新しい英文和訳形式では `question` を英文、`correct` を日本語訳として出題します。RPG本体の英英辞典モードは別仕様のため維持しています。

## Render本番運用と共通問題データ

Renderでは `server.js` を起動し、静的ファイル配信と共通問題データAPIを同じURLで提供します。アップロードされたCSV/Excelはブラウザの `localStorage` を正本にせず、Persistent Disk上の `/var/data/english_words_game/current-questions.json` に保存します。

### API

- `GET /api/questions/current?mode=word|chunk|definition`: 現在保存されている共通問題データを返します。未保存の場合は404を返し、画面側は標準CSVへフォールバックします。
- `POST /api/questions/upload`: `multipart/form-data` の `file` と `mode` を受け取り、CSV/Excelを行データへ変換してPersistent Diskへ保存します。
- `GET /api/questions/status?mode=word|chunk|definition`: 保存有無、問題数、最終更新日時、保存ファイルパスを返します。

### Render設定

`render.yaml` に、Node Web Service、`npm start`、Persistent Diskのマウント先 `/var/data` を定義しています。保存先は環境変数で変更できます。

- `DATA_DIR`: 既定値 `/var/data/english_words_game`
- `QUESTIONS_FILE`: 既定値 `${DATA_DIR}/current-questions.json`

GitHub Pagesは静的ホスティングのため、`POST /api/questions/upload` でのサーバー保存は動作しません。端末間共有が必要な場合はRender版URL `https://english-words-game.onrender.com/study-app/` を利用してください。RPG本体にも同URLへのリンクを表示し、GitHub Pages版の学習アプリ画面では「サーバー保存不可」とRender版へのリンクを表示します。

## Render版への統一（2026-06-16更新）

Render版では、アップロードしたExcel/CSV問題データをRPG本体と学習アプリの共通データとして扱います。正本はRender APIで、ブラウザの端末内保存ではありません。

### URL

- `/` → 英単語RPG（`/index.html`）
- `/study-app/` → 学習アプリ（`/study-app/index.html`）
- `/admin/wordbook-batch/` → 管理ツール（`/admin/wordbook-batch/index.html`）

RenderサーバーはディレクトリURLの `index.html` を自動解決します。

### 共通問題データAPI

- `GET /api/questions/current`: 現在の共通問題データを取得します。RPG本体は起動時にこのAPIを優先します。
- `POST /api/questions/upload`: CSV/Excel由来の問題データを共通問題データとして保存します。RPG側・学習アプリ側のどちらからアップロードしても同じ保存先を更新します。
- `POST /api/study-app/upload`: 学習アプリ用の互換APIです。`mode=word|chunk|definition` と `file` を受け取り、A〜L列だけを標準CSVへ正規化して `/var/data/study-app/*.csv` にも保存します。
- `GET /api/questions/status`: 保存状態、問題数、最終更新日時、保存ファイルパスを返します。

学習アプリは既存互換のため `?mode=word|chunk|definition` を付けてモード別データを読みます。RPG本体はモード指定なしの現在データを読み、取得に成功した場合は「共通問題データから○問を読み込みました」と表示します。取得に失敗した場合のみ `data/default-words.csv` へフォールバックします。

### PC・iPhoneで同じ問題を読む確認

1. Render版URL `https://english-words-game.onrender.com/study-app/` をPCで開きます。
2. RPG本体 `/` または学習アプリ `/study-app/` からCSV/Excelをアップロードします。
3. iPhoneで同じRender版URLの `/` または `/study-app/` を開きます。
4. 共通問題データの読み込みメッセージと問題数が、PCでアップロードした内容と一致することを確認します。

Persistent DiskなしのRender環境やGitHub Pagesでは、アップロード内容の端末間共有は保証されません。
