## 今回やったこと
- `study-app/` の英単語モード、チャンクモード、英英辞典モードのCSVを新形式 `row_number,question,correct,choice1,choice2,choice3,total_correct,total_wrong,accuracy,current_streak,note` に変更。
- `question` に出題文、`correct` に正解、`choice1`〜`choice3` に不正解選択肢を入れる仕様へ移行。
- `study-app/script.js` で `correct` + `choice1`〜`choice3` をシャッフルして4択を生成するよう変更。
- `row_number` を問題IDとして保持し、将来localStorageで学習履歴を保存できるようにした。
- `total_correct` / `total_wrong` / `accuracy` / `current_streak` をCSVから読み込み、初期版として問題ごとのCSV成績を表示するようにした。
- 既存RPG本体（ルートの `index.html` / `style.css` / `script.js`）は変更せず、`study-app/` とドキュメントのみ更新。
- README / architecture / project_status / next_tasks を新CSV形式に合わせて更新。

## 変更ファイル
- `study-app/script.js`
- `study-app/data/word_mode.csv`
- `study-app/data/chunk_mode.csv`
- `study-app/data/definition_mode.csv`
- `README.md`
- `docs/codex_report.md`
- `docs/project_status.md`
- `docs/architecture.md`
- `docs/next_tasks.md`

## テスト結果
- `node --check study-app/script.js` : PASS
- `python3` によるCSVヘッダー・必須列・4択生成元（`correct` + `choice1`〜`choice3`）確認 : PASS

## 注意点
- CSV由来の `total_correct` / `total_wrong` / `accuracy` / `current_streak` は今回の初期版では表示のみで、回答後にCSVやlocalStorageへ保存・更新はしていない。
- `row_number` は文字列として保持して問題ID表示に使っている。localStorage保存時にはキー設計を別途決める必要がある。
- UI上の成績カード（正答数 / 出題数 / 正答率）は従来どおり現在セッションの成績を表示し、CSV由来の問題別成績は問題カード内に表示している。
- UI文言の追加はあるが、ブラウザスクリーンショット確認はこの環境では未実施。

## 次にやるべきこと
- `row_number` をキーに、localStorageへ問題別の正解数・不正解数・正答率・連続正解数を保存/復元する。
- 実データCSVで `row_number` の重複や欠番を検出するバリデーションを追加する。
- Playwright等を導入できる場合は、3モード切替と4択生成のブラウザ回帰テストを追加する。

## チャッピーに相談すべき点
- CSV由来の学習成績表示を、現在の問題カード内表示で十分とするか、専用の問題別成績カードに分けるべきか。
- localStorage保存時にCSVの初期値とローカル履歴が競合した場合、どちらを優先する運用にするか。

---
## 今回やったこと
- 既存の英単語RPG本体を変更せず、新規ディレクトリ `study-app/` にゲーム要素なしの英語学習アプリ最小構成を追加。
- 英単語モード、チャンクモード、英英辞典モードを分離し、それぞれ別CSVを読み込む構成にした。
- HP / Gold / 敵キャラ / バトル演出 / レベルアップ / 報酬倍率を含めず、4択・正誤表示・次問・正答数・出題数・正答率・誤答復習に絞った。
- スマホで使いやすいカード型UIを追加。
- README / architecture / project_status / next_tasks を新規アプリ追加に合わせて更新。

## 変更ファイル
- `study-app/index.html`
- `study-app/style.css`
- `study-app/script.js`
- `study-app/data/word_mode.csv`
- `study-app/data/chunk_mode.csv`
- `study-app/data/definition_mode.csv`
- `README.md`
- `docs/codex_report.md`
- `docs/project_status.md`
- `docs/architecture.md`
- `docs/next_tasks.md`

## テスト結果
- `node --check study-app/script.js` : PASS
- `python3 -m http.server 4173` + `curl -I http://127.0.0.1:4173/study-app/` : PASS
- `curl -fsS http://127.0.0.1:4173/study-app/data/{word_mode,chunk_mode,definition_mode}.csv` 相当のCSV取得確認 : PASS
- スクリーンショット確認: この環境にはChromium/Playwright等のブラウザ実行環境が無いため未実施。静的配信確認とJavaScript構文チェックのみ実施。

## 注意点
- 最小構成のため、CSV列は3モード共通で `question,correct,choice1,choice2,choice3,choice4,explanation` にしている。将来、モードごとに列を拡張する余地あり。
- `fetch()` でCSVを読むため、ローカルファイル直開きではなくGitHub PagesやローカルHTTPサーバー経由で開く必要がある。
- 誤答復習は現在表示中モード内の間違いだけを対象にし、永続保存はしていない。

## 次にやるべきこと
- GitHub Pages上で `study-app/` を開き、CSV読み込みとUI操作を確認する。
- 実際の教材CSVを投入し、英単語 / チャンク / 英英辞典それぞれの列設計を固める。
- 必要なら学習履歴のlocalStorage保存や、問題順のランダム化設定を追加する。

## チャッピーに相談すべき点
- 英英辞典モードのCSV列を、現状の `question` に定義文を書く方式で十分とするか、`definition` / `answer_word` など専用列に分けるか。
- チャンクモードに例文や日本語訳の追加列を持たせるべきか。

---

## 今回やったこと
- `admin/wordbook-batch` の名称を「英単語CSV 50行バッチ編集ツール」に変更し、複数の英単語アプリで共通利用する管理者・教材作成者向けツールとして説明文を更新。
- 「用途を選ぶ」セレクトボックスを追加し、中学英単語 / 高校・大学受験英単語 / 英検 / TOEIC / 教科書・定期テスト / カスタムを選べるようにした。
- チャッピー用プロンプト生成時に選択用途ごとの指示文を追加。中学英単語では「中1基本」「中2基本」「中3基本」「入試標準」を案内し、高校・大学受験/英検では A1 / A2 / B1 / B2 / C1 / C2 も使える旨を明記。
- 既存のCSV列仕様、CSVパース、50行抽出、指定範囲抽出、貼り戻し、status処理、CSV出力は維持。
- 用途別プロンプト生成の最小回帰テストを追加。
- README / project_status / architecture / next_tasks を今回の汎用化第1段階に合わせて更新。

## 変更ファイル
- `admin/wordbook-batch/index.html`
- `admin/wordbook-batch/script.js`
- `admin/wordbook-batch/style.css`
- `admin/wordbook-batch/README.md`
- `tests_wordbookBatchPrompt.js`
- `README.md`
- `docs/codex_report.md`
- `docs/project_status.md`
- `docs/architecture.md`
- `docs/next_tasks.md`

## テスト結果
- `node --check admin/wordbook-batch/script.js` : PASS
- `node tests_wordbookBatchPrompt.js` : PASS
- `node tests_parseCsv.js` : PASS
- スクリーンショット確認: ローカルに Chromium / Playwright / wkhtmltoimage が無く、この環境では画像取得未実施。HTML/CSS/JSの静的確認と構文チェックのみ実施。

## 注意点
- 今回は汎用化の第1段階として、用途選択はプロンプト生成文への反映に限定。CSV列構造や貼り戻し処理は変更していない。
- `hydrateRows()` の既存 `normalizeLevel()` は従来どおり A1〜C2 ベースの正規化を行うため、読み込み済みCSV内に中学向け独自levelがある場合の扱いは今後の検討余地あり。ただし今回の要件に従い、CSVパース処理は変更していない。
- ブラウザ実機でのセレクト操作・コピー操作・CSV貼り戻しの手動確認は未実施。

## 次にやるべきこと
- 実データで各用途を選択し、生成プロンプトをチャッピーに投入して、level / chunk / definition の品質を確認する。
- 中学英単語の独自level（中1基本など）をCSV読み込み時にも維持する必要があるか検討する。
- Playwright等のブラウザテスト環境を導入できる場合は、用途選択からプロンプト生成までのUI回帰テストを追加する。

## チャッピーに相談すべき点
- 用途別の指示文（特にTOEIC、教科書・定期テスト）の粒度が十分か。
- 中学英単語の `level` 候補を、将来UI上やCSV検証ルールにも反映すべきか。

---

## 今回やったこと
- `admin/wordbook-batch` の「4. チャッピー出力貼り戻し」で、quoted CSV（カンマ・改行・エスケープ付き）を正しく扱うように修正。
- 貼り戻し処理のCSV解析を単純分割ではなく既存CSVパーサー経由に統一。
- コードフェンス（```csv / ```）除去後に、ヘッダー有無を判定して15列（`row_number`〜`note`）でマッピングする実装に変更。
- 列不足やrow_number不正時に「何行目で何が不足/不正か」を返すエラーメッセージを追加。
- 貼り戻し成功行は `status` を強制的に `completed` に設定するよう変更。
- 「次の未処理50行を抽出」は `status !== completed` の行を対象にする仕様へ変更。

## 変更ファイル
- `admin/wordbook-batch/script.js`
- `docs/codex_report.md`

## テスト結果
- `node --check admin/wordbook-batch/script.js` : PASS

## 注意点
- 今回はブラウザUIの手動操作（実CSVでの貼り戻し実演）まではこの環境で未実施。
- 貼り戻しは15列未満をエラーにするため、ChatGPT出力列が欠けると反映されない（意図通り）。

## 次にやるべきこと
- 実データで「quoted comma」「quoted newline」「コードフェンス付きCSV」「ヘッダーあり/なし」を網羅した手動検証を実施。
- 必要ならテスト用の最小CSV fixture と回帰テスト（Playwright等）を追加。

## チャッピーに相談すべき点
- `status` を常に `completed` 強制する運用が今後も妥当か（`要確認` 等のワークフローを残すか）。
- 貼り戻し時に「現在の50行外のrow_number」を無視ではなく警告一覧表示にするか。


---

## 今回やったこと
- `admin/wordbook-batch/script.js` の `checkRows()` で `allowedStatus` に `"COMPLETED"` を追加し、`completed` ステータスをチェック許可対象にした。
- 既存のCSV貼り戻し処理（`mergePasted` まわり）には変更を入れず、先行修正を維持。

## 変更ファイル
- `admin/wordbook-batch/script.js`
- `docs/codex_report.md`

## テスト結果
- `node --check admin/wordbook-batch/script.js` : PASS

## 注意点
- `checkRows()` の集計表示は `OK / 要確認 / pending` の3区分のままのため、`COMPLETED` は現在 `pending` 件数側に集計される。

## 次にやるべきこと
- 必要であれば、チェック結果表示に `COMPLETED` 件数の独立カウントを追加する。

## チャッピーに相談すべき点
- `COMPLETED` を `pending` と同一集計で良いか、または別表示にするか。

---

## 今回やったこと
- 「指定範囲を抽出」と「次の未処理50行を抽出」の処理を分離し、ボタンごとに専用関数を割り当てた。
- `extractRange()` を追加し、`rangeStart` / `rangeEnd` の入力値を `Number()` + `Number.isInteger()` で検証してから `row_number` 範囲抽出するよう修正した。
- 指定範囲抽出では `status` を見ずに `row_number` のみで抽出するようにし、抽出結果を `STATE.currentBatch` に反映して `renderBatch()` するようにした。
- 入力不正（空欄・整数でない・start <= 0・end < start）時に `extractStatus` へエラーを表示する `showExtractStatus()` を追加した。
- 「次の未処理50行を抽出」は `status !== completed` の先頭50件抽出ロジックを `extractNextUnresolved50()` として維持した。

## 変更ファイル
- `admin/wordbook-batch/script.js`
- `docs/codex_report.md`

## テスト結果
- `node --check admin/wordbook-batch/script.js` : PASS

## 注意点
- この環境ではブラウザ手動検証（実際のボタンクリックで 195〜244 表示確認）までは未実施。
- `row_number` が文字列でも `Number(row.row_number)` で比較しているため、数値化不能なデータ行は範囲抽出対象外になる。

## 次にやるべきこと
- UIで以下を手動確認する：
  - 195〜244 指定時に `row_number` 195〜244 のみ表示される
  - 53〜102 指定時に `row_number` 53〜102 のみ表示される
  - 「次の未処理50行を抽出」が従来どおり未完了先頭50件を出す
- 必要なら `extractRange()` の単体テスト（DOMモック）を追加する。

## チャッピーに相談すべき点
- 範囲抽出で0件だったときの文言を「0件」表示で十分か、追加ガイダンス（例: 範囲外/row_number欠損）を出すべきか。
