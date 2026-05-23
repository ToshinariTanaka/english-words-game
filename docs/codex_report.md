## 今回やったこと
- `admin/wordbook-batch/script.js` の `checkRows()` 内で、許容ステータスに `COMPLETED` を追加。
- 貼り戻し成功後に `status=completed` が入る運用変更に追従し、チェック機能で不正扱いされないよう調整。

## 変更ファイル
- `admin/wordbook-batch/script.js`
- `docs/codex_report.md`

## テスト結果
- `node --check admin/wordbook-batch/script.js` : PASS

## 注意点
- `checkRows()` の集計表示は `OK` / `要確認` 以外を `pending` カウントに寄せる実装のため、`COMPLETED` も件数上は `pending` 側に加算される。
- 厳密に `COMPLETED` 件数を別表示したい場合は、`result` 構造体と `renderCheckResult()` の文言拡張が別途必要。

## 次にやるべきこと
- 必要ならチェック結果サマリに `COMPLETED` 件数を独立表示する。
- `status` 値の正規化方針（`completed` 入力時の表示・保存）を仕様として明文化する。

## チャッピーに相談すべき点
- `COMPLETED` を `OK` 同等に集計するか、別カテゴリで見せるかの運用判断。
- 管理画面上のステータス表示文言を英語統一（`PENDING/COMPLETED`）するか日本語混在を維持するか。
