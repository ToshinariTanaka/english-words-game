## 今回やったこと
- GitHub Pages単体では端末間共有保存ができないため、Render上のNodeサーバーで共通問題データを保存・配信する構成を追加しました。
- `GET /api/questions/current`、`POST /api/questions/upload`、`GET /api/questions/status` を追加し、CSV/Excelアップロード内容をPersistent Disk想定のJSONファイルへ保存するようにしました。
- `study-app` は起動時・モード切替時に共通問題データAPIを先に読み、取得できた場合は「共通問題データから○問を読み込みました」と表示します。未保存・取得失敗時のみ標準CSVへフォールバックします。
- アップロード成功時はRender APIへ保存し、「共通問題データを保存しました。PC・iPhone共通で利用できます」と表示するようにしました。
- Render用の `render.yaml` とREADMEの運用説明を追加しました。

## 変更ファイル
- `server.js`
- `package.json`
- `render.yaml`
- `study-app/script.js`
- `study-app/index.html`
- `README.md`
- `docs/codex_report.md`
- `docs/project_status.md`
- `docs/architecture.md`
- `docs/next_tasks.md`

## テスト結果
- `npm install` : PASS
- `npm test` : PASS
- `DATA_DIR=/tmp/english_words_game_test PORT=4317 npm start` : PASS（ローカルサーバー起動確認）
- `curl -fsS http://127.0.0.1:4317/api/questions/status?mode=word` : PASS
- `curl -fsS -F mode=word -F file=@study-app/data/word_mode.csv http://127.0.0.1:4317/api/questions/upload` : PASS
- `curl -fsS http://127.0.0.1:4317/api/questions/current?mode=word` : PASS

## 注意点
- RenderのPersistent Diskを `/var/data` にマウントする前提です。DiskなしのRender環境ではデプロイや再起動時に保存データが失われる可能性があります。
- GitHub PagesではAPIサーバーがないため、共通保存アップロードは動作しません。標準CSVへのフォールバック表示で利用してください。
- 共通問題データはモード別に同一JSONファイルへ保存します。ユーザー別・ログイン別の分離はしていません。

## 次にやるべきこと
- Renderへデプロイし、PCでアップロードした問題がiPhoneの同じRender URLで読めることを実機確認する。
- 必要ならアップロード管理者だけが保存できるように認証または管理用トークンを追加する。
- 共通問題データのバックアップ・復元手順を整備する。

## チャッピーに相談すべき点
- 共通問題データを全員で1セットに固定するか、将来的にクラス・教材・ユーザー単位で切り替える必要があるか。
- Renderの無料/有料プラン、Persistent Disk容量、バックアップ頻度をどう運用するか。
