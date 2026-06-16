## 今回やったこと
- 誤ったRender URLとして報告された `https://english-words-game.onrender.com/study-app/` を、アプリ内の固定リンク・誘導文・README/設計メモから使わないようにしました。
- `script.js` と `study-app/script.js` の `RENDER_STUDY_APP_URL` は空文字にし、正しいRender Web Service URLが確認できるまでGitHub Pages等から誤URLへ誘導しないようにしました。
- Render上で同一オリジンから開いている場合は、引き続き現在のオリジンの `/study-app/` を使うため、正しいRenderサービス上ではリンクが自動で同じサービス内の学習アプリへ向きます。
- `render.yaml` と `package.json` を確認し、このリポジトリ側のRender定義は Web Service名 `english-words-game`、Start Command相当 `npm start`、実体 `node server.js` になっていることを確認しました。
- 公開URL `https://english-words-game.onrender.com/study-app/` と `https://english-words-game.onrender.com/api/questions/current?mode=word` は、この環境からの確認ではどちらも `403 Forbidden` でした。Render Dashboardにはアクセスできないため、GitHub連携リポジトリ・mainブランチ参照・実機でのヘブライ語UI非表示・iPhone共有までは未確認です。

## 変更ファイル
- `script.js`
- `study-app/script.js`
- `index.html`
- `README.md`
- `docs/architecture.md`
- `docs/project_status.md`
- `docs/codex_report.md`

## テスト結果
- `npm test`: PASS
- `PORT=3131 DATA_DIR=/tmp/ewg-render-url-check node server.js`: PASS（ローカルサーバー起動）
- `curl -I http://127.0.0.1:3131/study-app/`: PASS（ローカルで `study-app/index.html` が返ることを確認）
- `curl -F mode=word -F file=@/tmp/ewg-upload.csv http://127.0.0.1:3131/api/questions/upload`: PASS（ローカルAPIでアップロード保存成功）
- `curl -i https://english-words-game.onrender.com/study-app/`: WARN（外部公開URLは `403 Forbidden`。別アプリ表示の直接再現や正しいRender URL特定は不可）

## 注意点
- 正しいRender Web Service URLは、このリポジトリ内だけでは確定できません。Render Dashboardで対象サービスのURL、Repository、Branch、Start Commandを確認してください。
- `RENDER_STUDY_APP_URL` は意図的に未設定です。正しいURLが確定したら `script.js` と `study-app/script.js` に `/study-app/` まで含めたURLを設定し、READMEも同じURLに更新してください。
- `https://english-words-game.onrender.com/study-app/` は、ユーザー報告ではヘブライ語アプリが表示されるため、正しいURLとして扱わないでください。

## 次にやるべきこと
- Render Dashboardで、GitHub Repository が `ToshinariTanaka/english-words-game`、Branch が `main`、Start Command が `npm start` または `node server.js` であることを確認する。
- 正しいRender Web Service URLの `/study-app/` で「英語学習アプリ」が表示され、ヘブライ語アプリが表示されないことを確認する。
- 正しいRender Web Service URLで `/api/questions/upload` が存在し、CSVアップロード後にサーバー保存が成功することを確認する。
- PCアップロード後、iPhoneで同じ問題数が表示されることを実機確認する。

## チャッピーに相談すべき点
- Render Dashboard上で正しいサービスURLが複数候補ある場合、どのURLを本番導線に採用するか。
- 正しいURL確定後、GitHub Pages版アクセス時にリンク表示だけにするか、自動リダイレクトにするか。
