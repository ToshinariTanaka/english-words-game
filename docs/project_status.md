- 2026-06-23: study-appの音声UIを調整。手動再生ボタンは上部のモード名右側へ移動し、画面表示はスピーカーアイコンのみ（aria-label/titleで音声再生の説明を維持）に変更。音声ステータスは問題ID・レベル・学習履歴の下へ移動。
- 2026-06-23: study-app の学習画面で、問題ID・レベル・学習履歴の情報ブロックを「次の問題へ」ボタン直下へ移動。判定メッセージとは別の `questionMeta` として表示し、表示内容・計算ロジック・文言は変更しない。
- 2026-06-22: study-appの勉強数カウンターの累計合計を、既存`total`ではなく表示中のモード別内訳（`word + chunk + phrase + definition`）の合算に統一。version 1の`total` / `byDate`はlocalStorage上保持するが、今日・今月・今年・累計の表示合計はいずれもモード別合計と一致する。
- 2026-06-22: study-appの勉強数カウンターをモード別表示へ拡張。localStorageキー `englishWordsGame.studyApp.studyCounts.v1` は維持し、保存形式をversion 2（`byMode` / `byDateMode`追加）として読み書きする。version 1の`total` / `byDate`は保持し、過去分は分配せず新規回答分から現在モードへ加算する。結果画面は今日・今月・今年・累計カード内に英単語/チャンク/文節/英文/合計を表示する。
- 2026-06-22: study-appの自動読上げチェックボックスを復活。設定は `englishWordsGame.studyApp.autoSpeak` に保存し初期ON。問題表示時はONの場合だけC列相当 `question` を読み上げる。音声再生は手動再生ボタンと共通化し、HEAD確認ではなくAudio要素でMP3を実再生試行してから、失敗時のみWeb Speech APIへフォールバックする。
- 2026-06-21: study-appの結果画面に勉強数カウンターを追加。専用localStorageキー `englishWordsGame.studyApp.studyCounts.v1` に `{ version, total, byDate }` 形式で保存し、ブラウザローカル日付の `byDate` から今日・今月・今年を表示時に集計する。既存学習履歴 `englishGameLearningStats` は削除・初期化しない。
- 2026-06-21: `/admin/audio-upload/` の「次の10件を入力」を `nextMissingKeys` 優先に修正し、`w0000021` のような桁数過多のキーをクライアント・サーバー両方で拒否する検証を追加。
- 2026-06-20: `/admin/audio-upload/` にExcelからMP3生成する管理機能を追加。`POST /api/audio/generate-from-workbook` は `AUDIO_UPLOAD_TOKEN` 認証後、Render側の `OPENAI_API_KEY` を使って4シートExcelのC列 `question` から最大10件のMP3を生成し、M列 `question_key` を `{question_key}.mp3` として `/var/data/audio` に保存する。既存MP3は標準でスキップし、上書き指定時のみ再生成する。
- 2026-06-20: study-app用MP3管理機能にZIP一括アップロードを追加。`POST /api/audio/upload-zip` は既存の `AUDIO_UPLOAD_TOKEN` 認証を使い、ZIP内の `.mp3` だけを対象に `/var/data/audio` へbasename保存する。不正ファイル名・空ファイル・mp3以外はスキップし、成功数・スキップ数・エラー一覧をJSONで返す。`/admin/audio-upload/` にZIP欄を追加。
- 2026-06-19: study-app用MP3管理機能を追加。`POST /api/audio/upload` は `AUDIO_UPLOAD_TOKEN` と `X-Audio-Upload-Token` の一致時のみ有効で、`w/c/p/s` + 6桁の `.mp3` を `/var/data/audio` へ上書き保存する。`/admin/audio-upload/` から最小構成の管理アップロードが可能。study-appの自動読み上げチェックボックスは非表示にし、音声は「もう一度聞く」ボタンで再生する方針に統一。
# Project Status

- 2026-06-21: OpenAI TTSの既定モデルを `tts-1` から `gpt-4o-mini-tts` に変更。管理画面の初期voice `marin` と、`marin` / `cedar` を含む13種類voice対応仕様に合わせ、サーバーAPIとローカル一括生成ツールの既定値、READMEの説明を更新。
- 2026-06-19: study-appの音声再生をMP3優先に更新。`question_key` から `https://english-words-game-1ph3.onrender.com/audio/{question_key}.mp3` を取得し、失敗時はWeb Speech APIへフォールバックする。スマホ前提のため問題表示時の自動再生は行わず、手動の「もう一度聞く」操作時のみ再生する。Render側は `/audio/{filename}.mp3` を `/var/data/audio` から `audio/mpeg` と CORS `*` 付きで配信する。
- 2026-06-19: Render正式URLを `https://english-words-game-1ph3.onrender.com` として確定し、study-appの `RENDER_STUDY_APP_URL` を `https://english-words-game-1ph3.onrender.com/study-app/` に設定。GitHub Pages上では `API_BASE` をRender APIベースURLへ切り替え、共通問題データAPIをRenderから取得する構成へ更新。
- 2026-06-18: study-appの学習履歴localStorage保存を追加。履歴キーは読み込み元ラベルではなく「モード名::固定シート名::問題文」に統一し、row_numberや共通問題データラベルに依存しないよう変更。H〜L列は互換性として受け入れるが初期学習履歴には使わない方針に更新。
- 2026-06-18: study-appのレベル範囲選択で、空白およびA1〜C2以外のlevelを出題対象外に変更。レベル範囲変更時・問題適用後は絞り込み後件数で出題数選択肢を更新し、対象0件時は開始ボタンを無効化して専用メッセージを表示。
- 2026-06-18: study-appの音声選択候補を Junior / en-US、Kathy / en-US、Ralph / en-US、Samantha / en-US、Daniel / en-GB、Karen / en-AU、Moria / en-IE、Rishi / en-IN、Tessa / en-ZA、Fred / en-US の固定許可リストに限定。手動選択・ランダム・自動選択はいずれも取得済み許可候補だけを使い、許可候補外の保存値は自動選択へ戻してクリアするよう更新。
- 2026-06-18: study-appの全問終了画面と復習終了画面に「問題設定へ戻る」ボタンを追加。終了後だけ表示し、押すと出題設定見出しへスムーズスクロールする。
- 2026-06-18: study-appのランダム/自動読み上げ向けおすすめ音声名に Ava / Jenny / Aria / Emma / Brian / Andrew / Guy / Davis / Jane / Sara / Nancy / Steffan / Christopher / Cora / Ashley / Jason / Tony / Brandon / Elizabeth / Eric / Ryan を重複なしで追加し、女性系・男性系の性別推定リストも更新。手動プルダウンは全候補表示のまま維持。
- 2026-06-18: study-appのExcelアップロードを現在選択中モードのシート名優先に修正。複数シートExcelでは対応シートがない場合に先頭シートへフォールバックせず、モード別rowsとしてPersistent Diskへ個別保存する方針を固定。
- 2026-06-18: study-appで指定4シートを含むExcelブックをアップロードした場合、英単語・チャンク・文節和訳・英文和訳の4モードへ自動振り分けして読み込む処理を追加。

- 2026-06-16: Render本番運用向けにNodeサーバーを追加し、共通問題データAPIを実装。
- 2026-06-16: RPG本体もRender APIの `GET /api/questions/current` を起動時に優先し、成功時は共通問題データ、失敗時のみ `data/default-words.csv` へフォールバックする構成へ変更。
- 2026-06-19: 第4段階として、RPG本体のCSV/Excelアップロードは一時確認用に整理し、旧 `POST /api/questions/upload` / `POST /api/study-app/upload` を呼び出さない方針へ変更。共通保存は `/study-app/` の正式4シートExcelアップロードに集約。
- 2026-06-16: 当初はRPG本体と `study-app/` のどちらからアップロードしても `POST /api/questions/upload` で共通問題データを更新する方針だったが、現在は第4段階の方針により廃止。
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

## 2026-06-18 study-app 音声選択仕様
- 手動の音声選択プルダウンは Web Speech API で取得できた音声のうち、Junior / en-US、Kathy / en-US、Ralph / en-US、Samantha / en-US、Daniel / en-GB、Karen / en-AU、Moria / en-IE、Rishi / en-IN、Tessa / en-ZA、Fred / en-US に一致するものだけを指定順で表示します。
- 音声選択欄には、指定10種類のうち実際に取得できた候補数と、利用可能な指定音声だけを表示する説明を表示します。
- ランダム選択と自動選択は、Junior / Kathy / Ralph / Samantha / Daniel / Karen / Moria / Rishi / Tessa / Fred の固定許可リストに一致する取得済み音声だけを使います。
- 保存済み固定音声が固定許可リスト内かつ取得済み候補内にあれば復元し、それ以外は自動選択へ戻して保存値をクリアします。許可候補が0件の場合のランダム・自動は Web Speech API の既定自動音声に任せます。

- 2026-06-19: 第2.5段階としてRenderの `buildCommand` を `npm ci && python3 -m pip install -r tools/requirements.txt` に変更し、4シートExcel読み込みに必要な `openpyxl>=3.1.0` を本番build時に明示インストールする方針へ更新。Excel読み込み失敗時は `python3` / `openpyxl` 確認を促す管理者向けメッセージを返す。
- 2026-06-19: study-appで `GET /api/questions/current?mode=...` が409かつ `{ legacy: true }` を返した場合、レスポンスJSONを読んでから旧形式警告を判定し、標準CSVへフォールバックしつつ4シートExcelの再アップロード案内を表示するよう更新。
- 2026-06-19: study-app第1段階として4モード化を実施。`phrase`（文節和訳）を追加し、表示順を英単語 / チャンク / 文節和訳 / 英文和訳へ変更。標準CSVは `word_mode.csv` / `chunk_mode.csv` / `phrase_mode.csv` / `definition_mode.csv` の4ファイル構成に更新し、A〜M列の `question_key` を読み込む基礎対応を追加。
- 2026-06-19: localStorage学習履歴 `englishGameLearningStats` を `schema_version: 2` + `items` 形式に変更。履歴キーは `モード名::固定シート名::question_key` を優先し、旧schema履歴は読み込み時に削除する方針へ更新。

- 2026-06-19: study-app第2段階として、正式アップロードを完全一致シート名4つを持つ `.xlsx` のみに限定し、`/api/questions/upload-workbook` で `schema_version: 2` の4モード保存形式へ一括保存するよう更新。旧 `/api/questions/upload` は使用不可に変更。

- 2026-06-19: 第3.7段階として、Render本番のPython依存関係を `.python_packages` に固定配置する方式へ変更。`render.yaml` は `python3 -m pip install --target ./.python_packages -r tools/requirements.txt` を実行し、`server.js` は診断APIとExcel解析の両方で同じ `PYTHONPATH` を明示して `openpyxl` を参照する。
- 2026-06-19: 第3.6段階として `GET /api/diagnostics/python` を追加し、Render本番で `python3` と `openpyxl` の利用可否・バージョンをHTTP 200のJSONで確認できるようにした。Excel読み込み失敗時のサーバーログには実行コマンド、cwd、PATH、spawnSyncのerror/status/stdout/stderrを出す方針へ更新。
- 2026-06-19: hotfixとしてPR #79の3モード化を取り消し、study-appを `word` / `chunk` / `phrase` / `definition` の4モードへ復旧。`chunk` は `★チャンク` / `chunk_mode.csv`、`phrase` は `★文節和訳` / `phrase_mode.csv` として分離し、`phrase` API指定を `chunk` に寄せない。

## 2026-06-20: study-app用MP3一括生成ローカルツール

- `tools/generate_study_audio.py` を追加し、正式4シートExcelから `question_key.mp3` を一括生成できるようにしました。
- 対象はC列 `question`、D〜G列、M列 `question_key` がそろった行だけで、`word/chunk/phrase/definition/all` のモード選択に対応しています。
- 既存MP3は既定でスキップし、`--overwrite` 指定時だけ上書きします。
- `--dry-run` とCSVログ出力により、APIキー未設定でも生成対象確認ができます。
- 2026-06-21: `/admin/audio-upload/` のMP3作成状況確認を `/var/data/audio` の実ファイル存在・サイズ確認ベースに更新。0バイトMP3は未作成扱いとし、`nextStartKey` / `nextEndKey` / `nextMissingKeys` を返すAPI結果を「次の10件を入力」ボタンに反映するようにした。OpenAI TTSのvoice選択（13種類、既定 `marin`）も管理画面からサーバー検証・TTSリクエストまで維持。

- 2026-06-22: study-appのMP3音声再生でHEAD確認を追加し、MP3未生成・HTTPエラー・fetch失敗・audio.play()失敗・question_keyなしの全ケースでWeb Speech APIへフォールバックするよう修正。`voiceStatus` にMP3再生中/ブラウザ音声フォールバック/ブラウザ音声利用不可を表示し、script.jsのキャッシュバスターも更新。

- 2026-06-23: study-appの上部モード名横に移動した `speakQuestionButton` の手動クリック処理を専用ハンドラー化し、nullチェック付きでイベント登録するよう修正。自動読上げOFFでも現在の問題があれば手動ボタンは有効で、既存のMP3優先再生→Web Speech APIフォールバックを使って再生できることをテストで固定。ボタンのクリック可能性を補強するCSSも追加。
