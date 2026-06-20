## 今回やったこと
- study-app用MP3をRender Persistent Diskへ保存する管理者API `POST /api/audio/upload` を追加しました。
- `AUDIO_UPLOAD_TOKEN` とリクエストヘッダー `X-Audio-Upload-Token` が一致した場合だけアップロードを許可し、環境変数未設定時はAPIを無効化するようにしました。
- アップロードファイル名を `w000001.mp3` / `c000001.mp3` / `p000001.mp3` / `s000001.mp3` 形式に制限し、不正ファイル名・空ファイルを拒否するようにしました。
- `/admin/audio-upload/` に最小構成のMP3アップロード管理画面を追加しました。
- study-appの「自動読み上げ」チェックボックスを非表示（DOMから削除）にし、音声は問題カードの「🔊 もう一度聞く」ボタンで再生する旨を出題設定内に表示しました。
- 既存のMP3優先再生、Web Speech APIフォールバック、`/audio/` 配信は維持しました。
- UI変更は管理画面追加と文言追加です。`npx --yes playwright --version` でスクリーンショット準備を試みましたが、npm registry 403でPlaywrightを取得できずスクリーンショットは未取得です。画面上は `/admin/audio-upload/` にファイル選択・トークン入力・アップロードボタン・結果表示が出ます。

## 変更ファイル
- `server.js`: 音声アップロードAPI、トークン認証、ファイル名検証、Persistent Disk保存処理を追加。
- `admin/audio-upload/index.html`: MP3アップロード管理画面を追加。
- `admin/audio-upload/style.css`: 管理画面の最小スタイルを追加。
- `admin/audio-upload/script.js`: 管理画面から `/api/audio/upload` へmultipart送信する処理を追加。
- `study-app/index.html`: 「自動読み上げ」チェックボックスを削除し、手動再生案内文を追加。
- `tests_server_audio_upload.js`: 音声アップロードAPIと管理画面、上書き、既存 `/audio/` 配信のテストを追加。
- `package.json`: `npm test` に音声アップロードAPIテストを追加。
- `README.md`: MP3配信・アップロード管理機能の説明を更新。
- `docs/project_status.md`: 今回の対応状況を追記。
- `docs/architecture.md`: 音声アップロードAPIと管理画面の設計を追記。
- `docs/codex_report.md`: 今回の作業内容、テスト結果、注意点を更新。

## テスト結果
- `node -c server.js`: 成功。
- `node -c study-app/script.js`: 成功。
- `node tests_server_audio_upload.js`: 成功。
- `npm test`: 成功。
- `npx --yes playwright --version`: npm registry 403によりPlaywright取得不可（スクリーンショット未取得）。

## 注意点
- Render本番でアップロードAPIを有効化するには、必ず環境変数 `AUDIO_UPLOAD_TOKEN` を設定してください。未設定の場合は安全のため `POST /api/audio/upload` は503で無効化されます。
- 管理画面は簡易認証トークンを入力して送信する最小構成です。ユーザー管理やログイン機能は追加していません。
- MP3の中身の音声コーデック検査までは行っていません。サーバー側ではファイル名形式と空ファイル拒否で制限しています。
- 既存ファイルは同名アップロードで上書きされます。

## 次にやるべきこと
- Render Dashboardで `AUDIO_UPLOAD_TOKEN` を設定し、デプロイ後に `/admin/audio-upload/` から `w000001.mp3` などをアップロードしてください。
- アップロード後、`/audio/w000001.mp3` が再生でき、study-appの「🔊 もう一度聞く」ボタンでMP3優先再生されることを実機確認してください。
- 必要に応じて、管理画面へのアクセスURLを運用者だけに共有してください。

## チャッピーに相談すべき点
- MP3ファイルの実体検査（ID3/MPEGフレーム確認など）やアップロードサイズ上限を、現状の10MBから変更する必要があるか相談してください。
- 簡易トークン認証で十分か、将来的に管理者ログインへ拡張するか相談してください。
