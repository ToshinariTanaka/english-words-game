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
- `study-app/data/definition_mode.csv`: 英英辞典モード用CSV。

### study-app のCSV形式

最小構成では3モードとも次の列を使います。

```csv
row_number,level,question,correct,choice1,choice2,choice3,total_correct,total_wrong,accuracy,current_streak,note
```

- `level`: 問題カードに表示する難易度・教材レベルです。
- `question`: 英単語・チャンク・英英定義文を入れます。
- `correct`: 正解を入れます。
- `choice1`〜`choice3`: 不正解選択肢を入れます。
- アプリ側で `correct` + `choice1`〜`choice3` をシャッフルし、4択として表示します。
- `total_correct` / `total_wrong` / `accuracy` / `current_streak` はCSVから読み込み、初期版では問題ごとのCSV成績として表示のみ行います。
- `row_number` は将来localStorageに学習履歴を保存するための問題IDとして扱います。

今後、モードごとに列を拡張する場合も、既存RPG本体や既存CSV管理ツールとは別管理にします。

## admin/wordbook-batch

- `admin/wordbook-batch/index.html`: 管理者・教材作成者向けCSVバッチ編集画面。用途選択はプロンプト生成文だけに反映し、列構造や貼り戻し仕様は変更しない。
- `admin/wordbook-batch/script.js`: CSVパース、50行/範囲抽出、チャッピー用プロンプト生成、貼り戻し、チェック、CSV書き出しを担当。用途別文言は `PURPOSE_GUIDANCE` に集約。
