# Architecture Notes

## 既存RPG本体

- `script.js`: ゲームロジック本体（出題、判定、Gold計算、復習モード、自動遷移）。
- `index.html`: 画面構成（home/battle/result/gameclear/gameover）。
- `style.css`: 共通UI + `feedbackOverlay`演出。

既存RPG本体は今回の学習アプリ追加では変更しない方針です。

## 新規: study-app

- `study-app/index.html`: ゲーム要素を含まない英語学習アプリの画面。モード選択、成績、4択、復習導線を持つ。
- `study-app/script.js`: 標準CSV読み込み、アップロードCSV/Excel読み込み、簡易CSVパース、SheetJS連携、モード切り替え、正誤判定、正答数/出題数/正答率、誤答復習を担当。
- `study-app/style.css`: スマホ優先のカード型UI。HP/Gold/敵/バトル演出などのゲーム表現は含めない。
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
- `row_number` は将来localStorageに学習履歴を保存するための問題IDとして扱います。

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

`study-app/script.js` のモードキー `definition` は保存済みアップロードや既存URL/CSV名との互換性のため変更しません。ただし `study-app` では表示名を「英文和訳モード」とし、説明文は「英文を読んで、正しい日本語訳を選びます。」です。列判定は `question` / `英文` / `英語` / `問題` を英文として優先し、`correct` / `和訳` / `日本語訳` / `意味` / `正解` を日本語訳として優先します。RPG本体の `definition` モードは英英辞典モードのまま別仕様として維持します。


## ルートRPG本体の問題データ読み込み順

`index.html` / `script.js` のRPG本体は、起動時に以下の順で問題データを決定する。

1. `localStorage` の `englishWordsGameUploadedWordsCsv` に保存されたアップロードCSV/Excel。
2. GitHub Pagesで配信される相対パス `./data/default-words.csv`。
3. fetch失敗時の内蔵サンプルCSV。

アップロードCSV/Excelは端末・ブラウザローカルの状態として扱い、PCとiPhone間では同期しない。共通の標準問題を更新したい場合は、リポジトリ内の `data/default-words.csv` を変更する。
