## 今回やったこと
- `/admin/audio-upload/` に「ExcelからMP3生成」欄を追加し、4シートExcel、対象モード、開始キー、終了キー、最大件数、上書きオプションを指定できるようにしました。
- サーバー側に `POST /api/audio/generate-from-workbook` を追加し、ExcelのC列 `question` を読み上げ、M列 `question_key` を `{question_key}.mp3` として `/var/data/audio` に保存できるようにしました。
- TTS APIキーはブラウザに出さず、Render側の環境変数 `OPENAI_API_KEY` から読みます。未設定時は分かりやすいエラーを返します。
- 既存MP3は標準でスキップし、上書きオプション指定時だけ再生成します。
- 既存の単一MP3アップロード、ZIPアップロード、`/audio/` 配信は維持しました。

## 変更ファイル
- `server.js`: ExcelからMP3生成する管理APIを追加。
- `admin/audio-upload/index.html`: 管理画面にExcel生成フォームを追加。
- `admin/audio-upload/script.js`: Excel生成API呼び出し処理を追加。
- `admin/audio-upload/style.css`: 追加フォームのレイアウトを追加。
- `tests_server_audio_upload.js`: 管理画面表示と `OPENAI_API_KEY` 未設定エラーの確認を追加。
- `README.md`: 管理画面からのMP3生成手順を追記。
- `docs/project_status.md`: 今回の実装状況を追記。
- `docs/architecture.md`: 音声管理APIの設計を更新。

## テスト結果
- `node tests_server_audio_upload.js`: 成功。
- `npm test`: 成功。

## 注意点
- MP3生成は同期的に最大10件まで処理する少数生成用です。大量生成は後で分割処理・ジョブ化が必要です。
- Render本番では `AUDIO_UPLOAD_TOKEN` と `OPENAI_API_KEY` の両方が必要です。
- TTSモデルと音声は環境変数 `OPENAI_TTS_MODEL` / `OPENAI_TTS_VOICE` で変更できます。
- UI変更のスクリーンショットは、この環境ではブラウザ表示確認を行っていないため未取得です。画面上は既存アップロード欄の下に「ExcelからMP3生成」フォームが追加されます。

## 次にやるべきこと
- Render本番で小さなExcelを使い、1〜2件のMP3生成と `/audio/{question_key}.mp3` 再生を確認してください。
- 大量生成向けに、バックグラウンドジョブ、進捗表示、リトライ、生成ログ永続化を検討してください。

## チャッピーに相談すべき点
- TTSの voice / model の標準値を現在の `tts-1` / `alloy` のままでよいか。
- 大量生成時の分割単位、失敗時の再開方法、課金上限の運用ルール。
