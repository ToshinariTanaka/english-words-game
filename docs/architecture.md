# Architecture Notes

## 管理者・会員認証基盤（2026-07-17）

認証機能は既存のRPG／study-app用APIから分離し、`server.js` は `/api/auth/`、`/api/admin/`、`/api/member/` だけを `src/auth/app.js` へ渡します。`DATABASE_URL` がなくても認証モジュールは遅延接続となるため、既存静的画面、問題API、音声APIの起動を妨げません。

### モジュール

- `src/db/`: PostgreSQL Pool、トランザクション、接続不能判定、チェックサム付き前方マイグレーション。
- `src/auth/security.js`: bcrypt、AES-256-GCM、ランダムセッショントークン、HMAC-SHA-256、CSRF派生トークン。
- `src/auth/service.js`: ログイン、ロック、会員／管理者管理、セッション失効、監査ログ。
- `src/auth/app.js`: JSONサイズ制限、Cookie、CSRF／Origin検証、権限確認、APIルーティング。
- `admin/`・`member/`: サーバーセッションだけを使う最小画面。認証情報はlocalStorageへ保存しない。

### データモデル

- `administrators`: 個別ログインID、`owner` / `admin` / `viewer`、bcryptハッシュ、ロック状態、`session_version`。
- `members`: `member_number_seq` から発行する `UP000001` 形式の不変ID、bcryptハッシュ、暗号化した初期・仮パスワード、ロック状態、`session_version`。
- `sessions`: 管理者／会員共通のサーバー側セッション。Cookieの平文トークンは保存せず、HMAC-SHA-256だけを保存する。
- `audit_logs`: 認証・管理操作をJSONメタデータ付きで記録する。秘密値は `cleanMetadata` で除外する。
- `schema_migrations`: ファイル名、SHA-256チェックサム、適用日時を記録し、二重適用と適用済みファイル改変を防ぐ。

会員IDはPostgreSQL sequenceを使うため、トランザクションのロールバックや同時作成があっても一度発行した番号を再利用しません。欠番は許容します。

### 認証・失効

パスワードはSHA-256で長さを固定してからbcrypt（標準cost 12）へ渡し、bcryptの入力長制約と極端に長い入力への負荷を抑えます。入力自体は管理者8〜128文字、会員4〜128文字です。初期・仮パスワードは認証用ハッシュとは別にAES-256-GCMで暗号化し、会員本人が変更すると暗号文を削除します。

セッションは30日有効で、CookieはHttpOnly（CSRF Cookieを除く）、SameSite=Lax、本番Secure、Path=/です。パスワード変更、再設定、利用停止、権限変更、全端末ログアウトでは `session_version` を増やして既存セッションを失効します。本人のパスワード変更後は現在端末へだけ新しいセッションを再発行します。

状態変更APIは、セッションからHMACで導出したCSRF値をCookieと `X-CSRF-Token` の両方で照合し、Origin／Sec-Fetch-Siteも検証します。SQLは固定SQLとパラメータ化クエリだけを使用します。

### 権限境界

- 代表管理者: 管理者・会員・監査ログの全機能。
- 一般管理者: 会員作成、停止、仮パスワード、ロック解除、セッション失効。
- 閲覧者: 自分の管理者情報、ダッシュボード、ログアウトのみ。
- 会員: 自分の情報、パスワード変更、ログアウトのみ。

画面上の非表示だけに依存せず、各APIでアカウント種別と権限を再検証します。

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

- `study-app/index.html`: ゲーム要素を含まない英語学習アプリの画面。4モード（英単語 / チャンク / 文節和訳 / 英文和訳）のモード選択、成績、4択、復習導線を持つ。
- `study-app/script.js`: 標準CSV読み込み、アップロードCSV/Excel読み込み、簡易CSVパース、SheetJS連携、モード切り替え、正誤判定、正答数/出題数/正答率、誤答復習を担当。
- `study-app/style.css`: スマホ優先のカード型UI。HP/Gold/敵/バトル演出などのゲーム表現は含めない。
- `study-app/script.js` の音声選択はWeb Speech APIの `speechSynthesis.getVoices()` を使い、「自動選択」「ランダム」「各音声」を `VOICE_STORAGE_KEY` で保存・復元する。固定音声・`random`・自動選択はいずれも `ALLOWED_STUDY_VOICES` の10種類（Junior/Kathy/Ralph/Samantha/Daniel/Karen/Moria/Rishi/Tessa/Fred）に `voice.name` と `voice.lang` が大文字小文字を区別せず一致する取得済み音声だけを対象にし、0件なら `utterance.voice` 未指定でブラウザに任せる。
- `speechSynthesis.onvoiceschanged` は維持し、Safariなどで音声一覧が遅延取得されても保存済みの `random` や固定音声の復元機会を残す。保存済み固定音声が指定10種類以外、または現在の取得済み一覧に存在しない場合は自動選択へフォールバックして保存値をクリアする。
- `study-app/data/word_mode.csv`: 英単語モード用CSV。
- `study-app/data/chunk_mode.csv`: チャンクモード用CSV。
- `study-app/data/phrase_mode.csv`: 文節和訳モード用CSV。内部IDは `phrase`。
- `study-app/data/definition_mode.csv`: 英文和訳モード用CSV。内部IDとファイル名は互換性維持のため `definition` のまま。


### study-app のMP3音声配信

`study-app/script.js` は現在表示中の問題の `questionKey` を使い、`{API_BASE}/audio/{question_key}.mp3` を `HTMLAudioElement` で実際に再生試行します。HEAD確認だけではMP3なしと判定しません。対象テキストはC列相当の `question` の英語だけで、正解や選択肢の日本語は読み上げません。MP3の未生成・読み込み失敗・`audio.play()` reject・`error`イベント・タイムアウト・`question_key` なしの場合だけ Web Speech API へフォールバックします。自動読上げは `englishWordsGame.studyApp.autoSpeak` に保存するON/OFF選択制で初期値はONです。問題表示時は自動読上げONの場合だけ読み上げ、スピーカーアイコンのみの手動再生ボタンは自動読上げOFFでも同じ音声再生関数で利用できます。問題遷移、読み込み状態、セッション終了時はMP3とWeb Speech APIの両方を停止します。

Renderサーバーの `server.js` は `GET /audio/{filename}.mp3` を Persistent Disk の `/var/data/audio` から配信します。MP3ファイル名は `w000001.mp3` / `c000001.mp3` / `p000001.mp3` / `s000001.mp3` のような `{question_key}.mp3` 形式だけを許可し、解決後のパスが音声ディレクトリ内であること、実体が0バイトより大きい通常ファイルであることを確認します。`audio_manifest.json` は問題との対応管理、生成状況確認、誤対応防止の補助情報として維持しますが、Persistent Disk上の既存MP3を配信するための必須条件にはしません。レスポンスは `content-type: audio/mpeg` と `access-control-allow-origin: *` を付与します。TTS生成処理やAPIキーはブラウザには置かず、ブラウザは生成済みMP3だけを取得します。

### study-app のCSV形式

第1段階では4モードとも次のA〜M列を使います。

```csv
row_number,level,question,correct,choice1,choice2,choice3,total_correct,total_wrong,accuracy,current_streak,note,question_key
```

- `level`: 問題カードに表示する難易度・教材レベルです。
- `question`: 英単語モードでは英単語、チャンクモードでは英語チャンク、文節和訳モードでは英文中の部分、英文和訳モードでは英文全体を入れます。
- `correct`: 正解を入れます。英文和訳モードでは英文全体の正しい日本語訳を入れます。
- `choice1`〜`choice3`: 不正解選択肢を入れます。英文和訳モードでは日本語の誤訳選択肢を入れます。
- アプリ側で `correct` + `choice1`〜`choice3` をシャッフルし、4択として表示します。
- `total_correct` / `total_wrong` / `accuracy` / `current_streak` などのH〜L列は既存CSV/Excelとの互換性のため受け入れますが、学習履歴としては使いません。
- 学習履歴は `localStorage` の `englishGameLearningStats` に `schema_version: 2` と `items` を持つ形式で保存し、キーは `モード名::固定シート名::question_key` です。`row_number`、問題文、読み込み元ラベル（例: 共通問題データ）は履歴キーに使いません。
- 教材CSV/Excelは、元ヘッダーが `A row_number,B level,C question,...,L note` 形式でも、保存時は上記の標準ヘッダーへ正規化します。
- 読み込み時は最初の13列（A〜M）を標準列として位置ベースで読み、M列 `question_key` まで受け入れます。後方に重複ヘッダーがあってもA〜L列を上書きしません。
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
3. 文節和訳モード: `study-app/data/phrase_mode.csv`
4. 英文和訳モード: `study-app/data/definition_mode.csv`

起動時・モード切替時は常に標準CSVを `fetch` し、`IndexedDB` / `localStorage` に保存された過去のアップロードデータを標準CSVより優先しません。CSV/Excelアップロードは現在表示中モードの一時確認用で、ページ再読み込みやモード切替後は再び標準CSVへ戻ります。

ルートRPG本体は `data/default-words.csv` を標準問題として読み込みます。CSV/Excelアップロードは同様に一時確認用であり、アップロード本文を `localStorage` に保存して次回起動時に優先する仕様は廃止しています。なお、Goldなど問題データ本体ではないユーザー状態の保存は既存どおり別用途として扱います。

## Render共通問題データAPI

Render版は `server.js` が静的ファイルとAPIを同一オリジンで提供します。アップロードされたCSV/Excelはサーバー側で行データへ変換し、Persistent Disk想定の `/var/data/english_words_game/current-questions.json` に保存します。 `.xlsx` の4シートExcel変換は `python3` と `openpyxl` を使うため、Render build時に `tools/requirements.txt` から `openpyxl>=3.1.0` をインストールします。

- `GET /api/questions/current?mode=word|chunk|phrase|definition`: 保存済み行データを返す。未保存なら404。
- `POST /api/questions/upload-workbook`: `multipart/form-data` の `.xlsx` 4シートExcelを受け取り、`schema_version: 2` の4モード形式で保存する。
- `POST /api/questions/upload` / `POST /api/study-app/upload`: 旧形式APIのため使用不可。呼び出し時は410と新API案内を返す。
- `GET /api/questions/status`: 4モード全体の保存状態、問題数、最終更新日時、ファイル名を返す。

`study-app` は共通問題データAPIを正本として扱い、localStorageは取得済みデータの補助キャッシュに限定します。API取得失敗時のみ標準CSVを読み込みます。GitHub Pages版では `/api/questions/upload` が存在しないため、アップロード失敗時にサーバー保存不可とRender版URL （未確認のため未設定。Render Dashboardで正しいWeb Service URLを確認後、`https://<service>.onrender.com/study-app/` を設定） を表示します。

## Render統一後のURLとデータ正本

Render版では `server.js` が静的ファイルとAPIを同一オリジンで提供します。URLは以下のまま利用します。

- `/` → RPG本体（`/index.html`）
- `/study-app/` → 学習アプリ（`/study-app/index.html`）
- `/admin/wordbook-batch/` → 管理ツール（`/admin/wordbook-batch/index.html`）

ディレクトリURLでアクセスされた場合は、サーバー側で末尾の `index.html` を自動解決します。

共通問題データの正本はRender APIです。

- `GET /api/questions/current`: RPG本体が起動時に読む現在の共通問題データ。保存済みデータがなければ404。
- `GET /api/questions/current?mode=word|chunk|phrase|definition`: 学習アプリがモード別に読む共通問題データ。従来のRender API利用を維持。
- `POST /api/questions/upload-workbook`: study-app正式アップロード用。`.xlsx` 4シートExcelをPersistent Disk上の同じJSONへ `schema_version: 2` 形式で保存する。
- `GET /api/questions/status`: 4モード全体の保存状態、問題数、最終更新日時、ファイル名を返す。

保存先JSONには `schema_version: 2`、`updatedAt`、`filename`、4モード分の `modes` を保持します。`current` は第2段階の保存形式では保持しません。`GET /api/questions/current` の `mode` 省略時は `word` を返します。学習アプリは従来どおり `?mode=...` を使います。

RPG本体の起動順は以下です。

1. `GET /api/questions/current` を取得する。
2. 取得成功かつRPGで使える行が4問以上なら「共通問題データから○問を読み込みました」を表示する。
3. 取得失敗時のみ `data/default-words.csv` を読み込む。
4. 標準CSVも失敗した場合だけ内蔵サンプルを利用する。

RPG本体のアップロード欄は第4段階で一時確認用に整理しました。RPG本体は旧 `POST /api/questions/upload` / `POST /api/study-app/upload` を呼び出さず、読み込んだCSV/Excelをブラウザ上で試すだけで共通保存しません。共通保存は `/study-app/` の正式4シートExcelアップロードへ集約します。旧APIは410を返します。

### study-appのExcelブック読み込み

`study-app/script.js` の正式アップロードは、アップロードされたExcelブックを完全一致の公式4シート（`★英単語` / `★チャンク` / `★文節和訳` / `★英文和訳`）として読み込みます。旧シート名・別名・`word_mode` / `chunk_mode` / `definition_mode` などは正式アップロードでは許可しません。

公式4シートが不足している場合、または許可外シートが含まれる場合は、先頭シートへフォールバックせずエラーを表示します。単一CSV/単一シートExcelを読み込む場合も一時確認用に限定し、共通保存は行いません。

ブラウザ上では、見つかったモード別シートを `state.localModeRows` に保持し、モード切替時は該当モードのシート由来データだけを `normalizeQuestions` に渡します。Render APIが利用できる場合は `/api/questions/upload-workbook` へExcelファイルを一括送信し、サーバー側は `schema_version: 2`、`updatedAt`、`filename`、`modes.word|chunk|phrase|definition` の形式で一括保存します。

### study-app のMP3アップロード管理

`server.js` は `POST /api/audio/upload` で `multipart/form-data` のMP3ファイルを受け取り、Render Persistent Disk の `/var/data/audio` へ保存します。加えて `POST /api/audio/upload-zip` でZIP一括アップロードを受け取り、ZIP内の `.mp3` だけを対象にします。さらに `POST /api/audio/generate-from-workbook` は4シートExcelのC列 `question` とM列 `question_key` を使い、サーバー側環境変数 `OPENAI_API_KEY` でOpenAI TTSへ接続して最大10件の `{question_key}.mp3` を生成します。生成成功時は `audio_manifest.json` に `question_key`、モード、Excel行、読み上げテキスト、MP3ファイル名を保存します。manifest外の同名旧MP3は削除せず `mp3_backup_before_relink` へ退避してから再生成します。既存MP3はmanifestに登録済みの場合だけ標準でスキップし、上書き指定時は退避後に再生成します。これらのAPIは `AUDIO_UPLOAD_TOKEN` が設定され、リクエストヘッダー `X-Audio-Upload-Token` と一致した場合だけ許可します。未設定時はAPIを無効化します。ファイル名は `w000001.mp3` / `c000001.mp3` / `p000001.mp3` / `s000001.mp3` 形式だけを許可し、ZIP内のサブフォルダは保存時に無視してbasenameだけを使います。単一アップロードの空ファイルは拒否し、ZIP内の空ファイル・不正ファイル名・mp3以外はスキップして結果JSONへ記録します。同名ファイルは上書きし、正規名かつ0バイトより大きい通常ファイルならmanifest登録の有無にかかわらず再生できます。`admin/audio-upload/` は単一MP3とZIP一括アップロードの管理画面ですが、正規の再リンク運用はExcelからの再生成を優先します。

## ローカルTTS生成ツール

`tools/generate_study_audio.py` は、study-app正式4シートExcelを入力にして、ブラウザへAPIキーを渡さずローカル環境でMP3を生成する管理者向けCLIです。Excel読み取りは `openpyxl`、TTS provider境界は `synthesize_text_to_mp3(text, output_path)` に分離しています。現在は `OPENAI_API_KEY` を環境変数から読むOpenAI TTS実装ですが、将来別providerへ差し替える場合もCLIのExcel抽出・ログ出力・skip/overwrite制御を維持できます。CLIは `audio_manifest.json` と `audio_manifest.csv` も出力し、`question_key` とMP3ファイル名の対応表を成果物として残します。

## 環境変数による中学生専用版（2026-06-27）

通常版と中学生専用版はブランチを分けず、同じ `main` ブランチの `server.js` と `study-app/` を使います。サーバーは `APP_VARIANT` を読み、未設定または `default` の場合は従来の通常版保存先を維持します。`APP_VARIANT=junior` の場合は `DATA_DIR` を基準に解析済み問題データJSON、アップロード済みExcelコピー、派生CSV保存先、MP3保存先を分けられるようにし、`AUDIO_DIR` や `QUESTION_FILE` が指定されていればそれを優先します。

`GET /api/app-config` は現在の variant、画面タイトル、サブタイトル、利用可能モードを返します。`study-app/script.js` は起動時にこの設定を読み、タイトル表示と localStorage キーを variant 別に切り替えます。これにより、中学生版の学習履歴、学習カウンター、モード別カウンター、設定、共通問題キャッシュは通常版のキーと混ざりません。

通常版の既定値は後方互換性のため変更していません。

- 問題データ: `/var/data/english_words_game/current-questions.json`
- MP3音声: `/var/data/audio`
- study-app派生CSV: `/var/data/study-app`

中学生版Renderサービスでは、通常版とは別Web Service・別Persistent Diskを作り、例として `DATA_DIR=/var/data/junior`、`QUESTION_FILE=/var/data/junior/questions.xlsx`、`AUDIO_DIR=/var/data/junior/audio` を設定します。

### iOS Safari Web Speech診断

iPhone／iPad Safariは `userAgent` の端末名だけでなく、`platform` と `maxTouchPoints` によるデスクトップ表示iPadOS判定も併用します（iOS版Chrome等は除外）。この判定時は手動・自動ともMP3を試さずWeb Speechを直接使います。手動操作では音声一覧待機の `await` を通らず、クリックイベントの同期実行経路内で `speechSynthesis.speak()` を呼びます。その他のブラウザは従来どおりMP3優先で、失敗時に音声一覧を最大800ms待ってWeb Speechへフォールバックします。発話中は `SpeechSynthesisUtterance` の参照を保持し、状態を `[WebSpeech]` ログへ記録します。独立診断ページは `study-app/speech-synthesis-safari-test.html` です。
