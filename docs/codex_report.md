## 今回やったこと
- RPG本体のホーム画面に、PC・iPhone共通保存用のRender版「英語学習アプリ（アプトレ）」リンクを追加しました。
- Render上で開いている場合は同一オリジンの `/study-app/`、GitHub Pages等で開いている場合は `https://english-words-game.onrender.com/study-app/` へ誘導するようにしました。
- 学習アプリ画面に現在の配信元を表示し、GitHub Pages版では「サーバー保存不可」とRender版へのリンクを明示するようにしました。
- GitHub Pages版でアップロードAPIが失敗した場合のメッセージに、Render版へ移動すべき理由を追加しました。
- Render版 `/study-app/` と `POST /api/questions/upload` は既存の `server.js` ルーティングを維持し、今回のUI変更後もローカルで動作確認しました。

## 変更ファイル
- `index.html`
- `script.js`
- `style.css`
- `study-app/index.html`
- `study-app/script.js`
- `study-app/style.css`
- `README.md`
- `docs/architecture.md`
- `docs/project_status.md`
- `docs/next_tasks.md`
- `docs/codex_report.md`

## テスト結果
- `npm test` : PASS
- `DATA_DIR=/tmp/ewg-test-data STUDY_APP_DATA_DIR=/tmp/ewg-test-study PORT=3131 npm start` でローカルサーバーを起動 : PASS
- `curl -I http://127.0.0.1:3131/study-app/` でRender相当のディレクトリURL `/study-app/` が `study-app/index.html` として返ることを確認 : PASS
- `curl -F mode=word -F file=@/tmp/ewg-upload.csv http://127.0.0.1:3131/api/questions/upload` で `POST /api/questions/upload` が成功し、件数が返ることを確認 : PASS
- `curl http://127.0.0.1:3131/api/questions/current?mode=word` でアップロード済み問題が取得できることを確認 : PASS

## 注意点
- 実際のRenderサービスURLは `https://english-words-game.onrender.com/study-app/` として実装しました。Render側のサービス名が異なる場合は `script.js` と `study-app/script.js` の定数を差し替える必要があります。
- PC/iPhoneの実機共有確認は、Render本番へデプロイ後に同じRender URLで行う必要があります。ローカルではAPI保存と取得まで確認済みです。
- GitHub Pages版では引き続き標準CSVの閲覧はできますが、`/api/questions/upload` が存在しないためサーバー保存はできません。

## 次にやるべきこと
- Render本番へデプロイし、UpTraから開いたURLが `github.io` ではなく `onrender.com` になっていることを実機確認する。
- PCでRender版にCSV/Excelをアップロード後、iPhoneで同じRender URLを開いて同じ問題数が表示されることを確認する。
- RenderサービスURLが確定URLと異なる場合は、定数とREADMEを修正する。

## チャッピーに相談すべき点
- Renderの正式サービスURLが `https://english-words-game.onrender.com/` で確定かどうか。
- GitHub Pages版アクセス時に警告表示だけで残すか、自動的にRender版へリダイレクトするか。
