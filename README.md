# english-words-game

英単語を倒してgoldを稼ぐ英語学習RPGです。既存のRPG本体は `index.html` / `style.css` / `script.js` で維持しています。

## 新規: 英語学習アプリ（最小構成）

ゲーム要素を削除した静的な英語学習アプリを `study-app/` に追加しました。GitHub Pagesなどの静的ホスティングで動作します。

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
- `row_number` は将来localStorageに学習履歴を保存するための問題IDとして扱います。
- 各モードで標準の `study-app/data/*.csv` を読み込めるほか、画面から手元の `.csv` / `.xlsx` をアップロードして同じ列形式の問題に差し替えできます。Excel読み込みはGitHub Pagesで動作するようSheetJSをCDNから読み込みます。

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
