# english-words-game

英単語を倒してgoldを稼ぐ英語学習RPGです。既存のRPG本体は `index.html` / `style.css` / `script.js` で維持しています。

## RPG本体の音声・効果音設定（2026-06-17）

ルートのRPG本体（`index.html` / `script.js` / `style.css`）に、読み上げ音声と効果音の設定を追加しました。

- 「音声ランダム」ON時は、`speechSynthesis.getVoices()` で取得した英語系音声（`en-US`, `en-GB`, `en-AU`, `en-CA` など `en-*`）から毎回ランダムに読み上げます。
- 「音声ランダム」OFF時は、取得できた英語系音声の先頭を優先音声として固定利用します。
- 英語音声が取得できない場合は、`utterance.lang = "en-US"` のみ指定し、ブラウザ標準の音声にフォールバックします。
- iPhone/Safariで初回の音声候補が空になる場合に備え、`speechSynthesis.onvoiceschanged` で候補を再読み込みします。
- 「現在の声：○○」で最後に使った声、ランダム/固定モード、候補数を確認できます。
- 「効果音ON」ON時は、正解音・不正解音をそれぞれ複数パターンからランダムにWeb Audio APIのoscillatorで再生します。外部音声ファイルは使いません。
- 「音声ランダム」と「効果音ON」は `localStorage` に保存されます。

## 新規: 英語学習アプリ（最小構成）

ゲーム要素を削除した英語学習アプリを `study-app/` に追加しました。PC・iPhone共通保存を使う本番導線はRender版 （未確認のため未設定。Render Dashboardで正しいWeb Service URLを確認後、`https://<service>.onrender.com/study-app/` を設定） に統一します。GitHub Pages版は標準CSVの閲覧・一時確認のみで、サーバー保存はできません。

- 起動ファイル: `study-app/index.html`
- ロジック: `study-app/script.js`
- スタイル: `study-app/style.css`
- データ:
  - `study-app/data/word_mode.csv`（英単語モード）
  - `study-app/data/chunk_mode.csv`（チャンクモード）
  - `study-app/data/definition_mode.csv`（英文和訳モード。内部IDは互換性維持のため `definition`）

### 音声読み上げ（2026-06-18）

`study-app/` はブラウザ標準の Web Speech API（`speechSynthesis`）で、現在表示中の C列相当 `question` の英語だけを読み上げます。英単語モードは英単語、チャンクモードは英語チャンク、英文和訳モードは英文全体が対象です。日本語の正解・選択肢は読み上げません。

- 新しい問題表示時は、出題設定の「自動読み上げ」がONの場合に自動再生します（初期値ON）。
- 問題カード付近の「🔊 もう一度聞く」ボタンで、現在の問題を手動再生できます。
- 音声選択は「自動選択」「ランダム」「各音声」の順に表示します。選択値は `englishWordsGame.studyApp.voiceURI` に保存され、再読み込み後も復元されます。
- 手動の固定音声プルダウンは `speechSynthesis.getVoices()` で取得できた音声のうち、Junior / en-US、Kathy / en-US、Ralph / en-US、Samantha / en-US、Daniel / en-GB、Karen / en-AU、Moria / en-IE、Rishi / en-IN、Tessa / en-ZA、Fred / en-US に一致するものだけを指定順で表示します。
- 音声選択欄には、指定10種類のうち実際に取得できた候補数と「音声候補は指定した10種類のうち、このブラウザで利用できるものだけを表示します。」という説明を表示します。
- 「ランダム」選択時と自動選択時も同じ指定10種類の取得済み候補だけから選びます。候補が複数ある場合は直前と同じ音声を避け、候補が0件の場合は `utterance.voice` を指定せずブラウザ既定音声に任せます。保存済み固定音声が指定10種類以外、または現在のブラウザで取得できない場合は自動選択へ戻して保存値をクリアします。
- 「現在の音声」または「今回の音声」として、固定音声・ランダムで実際に使った音声・ブラウザ自動選択を表示します。
- 次の問題や読み込み状態へ移る前に `speechSynthesis.cancel()` で前の音声を停止します。
- iPhone Safariなどで自動再生が制限されても、手動ボタンで再生できるように外部音声APIやAPIキーは使いません。

### 学習アプリで残した機能

- 4択問題
- 正解・不正解表示
- 次の問題へ進む
- 正答数 / 出題数 / 正答率
- 間違えた問題の復習
- 出題数選択（10問 / 20問 / 30問 / 40問 / 50問 / 70問 / 100問 / 150問 / 全て）
- 開始レベル〜終了レベル（A1 / A2 / B1 / B2 / C1 / C2）による出題範囲の絞り込み。空白または範囲外の `level` は出題対象外です。
- 出題数の選択肢は、現在のレベル範囲で出題できる問題数に合わせて自動で無効化され、対象0件の場合は出題開始できません。

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
- `total_correct` / `total_wrong` / `accuracy` / `current_streak` などのH〜L列は既存CSV/Excelとの互換性のため受け入れますが、学習履歴としては使いません。
- 学習履歴は `localStorage` の `englishGameLearningStats` に保存し、キーは「モード名::固定シート名::問題文」です。`row_number` や読み込み元ラベル（例: 共通問題データ）は履歴キーに使いません。
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


### study-app: Excelブックのモード別アップロード

`study-app/` のExcelアップロードでは、現在選択中のモードに対応するシートをシート名で探して読み込みます。ファイル名だけで読み込み先モードを判定しません。複数シートExcelで現在モードに対応するシートが見つからない場合は、別モードの先頭シートを代用せず、エラーを表示します。

| 読み込み先モード | 対応シート名 | C列 `question` の内容 |
| --- | --- | --- |
| `word`（英単語モード） | `英単語`, `英単語テスト`, `word`, `word_mode`, `単語`, `★英単語テスト_001_生成` | 英単語 |
| `chunk`（チャンクモード） | `チャンク`, `chunk`, `chunk_mode`, `★チャンク_001_生成` | チャンク |
| `definition`（英文和訳モード） | `英文和訳`, `英文`, `和訳`, `definition`, `definition_mode`, `★英文和訳_001_生成` | 英文 |

複数シートExcel内に複数モードの対応シートがある場合は、見つかったシートを `word` / `chunk` / `definition` の別々の rows として保持し、Render版では `/api/questions/upload` へモード別CSVとして個別保存します。これにより `/api/questions/current?mode=word`、`?mode=chunk`、`?mode=definition` は、それぞれ該当モードの問題だけを返します。

各シートは1行目をヘッダーとして扱い、A〜L列（`row_number`, `level`, `question`, `correct`, `choice1`, `choice2`, `choice3`, `total_correct`, `total_wrong`, `accuracy`, `current_streak`, `note`）だけを読み込みます。C列 `question`、D列 `correct`、E〜G列 `choice1`〜`choice3` がそろった行だけを出題対象にし、H〜L列の空欄、A列 `row_number` の空欄、M列以降の余分な列、空白行はエラーにしません。H〜L列に値があっても初期学習履歴としては読み込まず、localStorageの学習履歴とは分離します。

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

GitHub Pagesは静的ホスティングのため、`POST /api/questions/upload` でのサーバー保存は動作しません。端末間共有が必要な場合はRender版URL （未確認のため未設定。Render Dashboardで正しいWeb Service URLを確認後、`https://<service>.onrender.com/study-app/` を設定） を利用してください。RPG本体にも同URLへのリンクを表示し、GitHub Pages版の学習アプリ画面では「サーバー保存不可」とRender版へのリンクを表示します。

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

1. Render版URL （未確認のため未設定。Render Dashboardで正しいWeb Service URLを確認後、`https://<service>.onrender.com/study-app/` を設定） をPCで開きます。
2. RPG本体 `/` または学習アプリ `/study-app/` からCSV/Excelをアップロードします。
3. iPhoneで同じRender版URLの `/` または `/study-app/` を開きます。
4. 共通問題データの読み込みメッセージと問題数が、PCでアップロードした内容と一致することを確認します。

Persistent DiskなしのRender環境やGitHub Pagesでは、アップロード内容の端末間共有は保証されません。

## study-app 第1段階: 4モード化と `question_key` 基礎対応（2026-06-19）

`study-app/` は第1段階として、学習モードを次の4つに変更しました。表示順もこの順番です。

| 表示名 | 内部mode | 標準CSV | 固定シート名 |
| --- | --- | --- | --- |
| 英単語 | `word` | `study-app/data/word_mode.csv` | `★英単語` |
| チャンク | `chunk` | `study-app/data/chunk_mode.csv` | `★チャンク` |
| 文節和訳 | `phrase` | `study-app/data/phrase_mode.csv` | `★文節和訳` |
| 英文和訳 | `definition` | `study-app/data/definition_mode.csv` | `★英文和訳` |

標準CSVはA〜M列形式です。

```csv
row_number,level,question,correct,choice1,choice2,choice3,total_correct,total_wrong,accuracy,current_streak,note,question_key
```

- 4モードすべて、読み上げ対象はC列相当の `question` だけです。D〜G列の日本語選択肢は読み上げません。
- B列 `level` は `A1` / `A2` / `B1` / `B2` / `C1` / `C2` だけを出題対象にします。空白や範囲外のlevelは除外します。
- M列 `question_key` を読み込み、学習履歴キーは `モード名::固定シート名::question_key` を優先します。例: `文節和訳::★文節和訳::p000001`。
- localStorageの `englishGameLearningStats` は `schema_version: 2` と `items` を持つ形式です。`schema_version: 2` がない旧履歴は読み込み時に削除します。
- 第1段階では既存のCSV/ExcelアップロードAPI互換を維持しています。`.xlsx` のみ許可、4シート必須チェック、一括アップロードAPI新設、既存API無効化、`question_key` の厳格検証や重複検証は第2段階・第3段階で実施予定です。

## study-app 第2段階: 4シートExcel一括アップロードと保存形式v2（2026-06-19）

第2段階から、study-appの正式アップロードは `.xlsx` の4シートExcelのみです。CSV単体アップロードは廃止し、旧API `POST /api/questions/upload` は使用不可（410）です。

正式シート名は完全一致で次の4つです。旧シート名や別名（例: `英単語`, `definition`, `word_mode`）は正式アップロード導線では受け付けません。

| 表示名 | 内部mode | 正式シート名 |
| --- | --- | --- |
| 英単語 | `word` | `★英単語` |
| チャンク | `chunk` | `★チャンク` |
| 文節和訳 | `phrase` | `★文節和訳` |
| 英文和訳 | `definition` | `★英文和訳` |

ブラウザ側でExcelを読み込み、各シートのA〜M列（`row_number,level,question,correct,choice1,choice2,choice3,total_correct,total_wrong,accuracy,current_streak,note,question_key`）をrowsへ変換し、4モードまとめて `POST /api/questions/upload-workbook` にJSON送信します。第2段階では、C列 `question`、D列 `correct`、E〜G列 `choice1`〜`choice3`、M列 `question_key` がそろう行だけを完成行として扱い、不足行はスキップします。各シートの完成行が0件の場合は保存しません。

Render Persistent Diskの保存データは `schema_version: 2` をルートに持ち、`modes.word` / `modes.chunk` / `modes.phrase` / `modes.definition` の4つを必ず持つ形式です。4モードすべてが成功した場合のみ一時ファイル経由で `current-questions.json` を更新します。`schema_version: 2` がない旧保存データは無効扱いで読み込まず、study-appは標準CSVへフォールバックして警告を表示します。

取得APIは `GET /api/questions/current?mode=word|chunk|phrase|definition` で各モードのrowsを返します。RPG互換のため、modeなし `GET /api/questions/current` は `word` と同じ扱いです。`GET /api/questions/status` は4モード全体の件数を返します。

詳細バリデーション（`question_key` 形式・重複、level厳格チェック、選択肢重複、正規化、最大20件の詳細エラー、専用エラーボックス）は第3段階で実装予定です。
