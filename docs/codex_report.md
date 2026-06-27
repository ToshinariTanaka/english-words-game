## 今回やったこと
- 同じ main ブランチ・同じコードベースで通常版と中学生版を切り替えられるよう、`APP_VARIANT` / `APP_TITLE` / `DATA_DIR` / `QUESTION_FILE` / `AUDIO_DIR` に対応しました。
- `APP_VARIANT=junior` の場合だけ、サーバー側の問題データ保存先、MP3保存先、派生データ保存先を `DATA_DIR` 配下へ分離できるようにしました。
- study-app 起動時に `/api/app-config` を読み込み、中学生版では画面タイトルとヘッダーを中学生専用表示へ切り替えるようにしました。
- study-app の localStorage キーを variant ごとに分け、中学生版の学習履歴・今日/今月/今年/累計カウンター・モード別カウンター・設定・共通問題キャッシュが通常版と混ざらないようにしました。
- README に、通常版とは別のRender Web Serviceとして中学生版を作る環境変数例とPersistent Disk分離の注意を追記しました。
- `docs/architecture.md` と `docs/project_status.md` に、環境変数ベースの中学生版運用方針を追記しました。

## 変更ファイル
- `server.js`
- `study-app/index.html`
- `study-app/script.js`
- `README.md`
- `docs/codex_report.md`
- `docs/architecture.md`
- `docs/project_status.md`

## テスト結果
- `node -c server.js` 成功。
- `node -c study-app/script.js` 成功。
- `APP_VARIANT=junior APP_TITLE=中学生英単語アプリ DATA_DIR=/tmp/ewg-junior QUESTION_FILE=/tmp/ewg-junior/questions.xlsx AUDIO_DIR=/tmp/ewg-junior/audio PORT=3131 node server.js` を起動し、`GET /api/app-config` が `variant: junior` と中学生版タイトルを返すことを確認しました。
- 同じ中学生版サーバーで `GET /api/questions/status` を確認し、未保存時でも専用データファイル側で通常応答することを確認しました。
- `npm test` 成功。npm の `Unknown env config "http-proxy"` 警告は表示されましたが、テスト自体はすべて通過しました。
- `git diff --check` 成功。

## 注意点
- `QUESTION_FILE=/var/data/junior/questions.xlsx` はアップロード済みExcelのコピー保存先です。アプリが配信に使う解析済みJSONは `DATA_DIR/current-questions.json`（または `QUESTIONS_FILE` 指定時はそのパス）へ保存します。
- `APP_VARIANT` 未設定または `default` の通常版は、既存保存先 `/var/data/english_words_game/current-questions.json` と `/var/data/audio` を維持します。
- 中学生版Renderサービスでは、通常版と同じPersistent Diskパスを指定しないでください。
- 画面表示のテキスト差し替えのみで、大きなレイアウト変更はしていないためスクリーンショットは取得していません。

## 次にやるべきこと
- Render上で通常版とは別のWeb Serviceを作り、`APP_VARIANT=junior` などの環境変数と専用Persistent Diskを設定してください。
- 中学生版専用Excelをアップロードし、4モードそれぞれで出題できることを本番URLで確認してください。
- 中学生版専用MP3をアップロードまたは生成し、通常版MP3ディレクトリにファイルが増えないことをRender Shell等で確認してください。

## チャッピーに相談すべき点
- `QUESTION_FILE` の例を `.xlsx` のまま運用するか、実体に合わせて `/var/data/junior/current-questions.json` のような名前に変更するか。
- 中学生版のサブタイトル文言を「中学生専用・英単語／チャンク／文節／英文トレーニング」のままでよいか。
