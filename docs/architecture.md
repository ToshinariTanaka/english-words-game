# Architecture Notes

- `script.js`: ゲームロジック本体（出題、判定、Gold計算、復習モード、自動遷移）。
- `index.html`: 画面構成（home/battle/result/gameclear/gameover）。
- `style.css`: 共通UI + 今回追加した`feedbackOverlay`演出。

今回の設計変更:
- 判定ロジック本体には手を入れず、`judgeAnswer`から`updateFeedbackOverlay()`を呼ぶ構成へ拡張。
- 演出の責務をCSSに寄せ、ロジック層への影響を最小化。
