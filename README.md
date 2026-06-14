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
  - `study-app/data/definition_mode.csv`（英英辞典モード）

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
- `question`: 英単語・チャンク・英英定義文を入れます。
- `correct`: 正解を入れます。
- `choice1`〜`choice3`: 不正解選択肢を入れます。
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
