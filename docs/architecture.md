# Architecture Notes

- `script.js`: ゲームロジック本体（出題、判定、Gold計算、復習モード、自動遷移）。
- `index.html`: 画面構成（home/battle/result/gameclear/gameover）。
- `style.css`: 共通UI + 今回追加した`feedbackOverlay`演出。

今回の設計変更:
- 判定ロジック本体には手を入れず、`judgeAnswer`から`updateFeedbackOverlay()`を呼ぶ構成へ拡張。
- 演出の責務をCSSに寄せ、ロジック層への影響を最小化。

admin/wordbook-batch の設計メモ:
- `admin/wordbook-batch/index.html`: 管理者・教材作成者向けCSVバッチ編集画面。用途選択はプロンプト生成文だけに反映し、列構造や貼り戻し仕様は変更しない。
- `admin/wordbook-batch/script.js`: CSVパース、50行/範囲抽出、チャッピー用プロンプト生成、貼り戻し、チェック、CSV書き出しを担当。用途別文言は `PURPOSE_GUIDANCE` に集約。

