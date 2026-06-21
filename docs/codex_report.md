## 今回やったこと
- サーバー側の `OPENAI_TTS_MODEL` 既定値を `tts-1` から `gpt-4o-mini-tts` に変更しました。
- ローカル一括生成ツールの `OPENAI_TTS_MODEL` 既定値も同じく `gpt-4o-mini-tts` にそろえました。
- READMEのTTSモデル既定値の説明を更新しました。
- 管理画面の初期voice `marin` や `cedar` を含む13種類voice対応仕様に合わせ、デフォルトモデルを13種類voice対応のモデルへ変更しました。

## 変更ファイル
- `server.js`: OpenAI TTS API呼び出しで使うモデル既定値を `gpt-4o-mini-tts` に変更。
- `tools/generate_study_audio.py`: ExcelからMP3を一括生成するローカルツールのモデル既定値を `gpt-4o-mini-tts` に変更。
- `README.md`: `OPENAI_TTS_MODEL` の既定値説明を更新。
- `docs/codex_report.md`: 今回の作業内容とテスト結果を記録。
- `docs/project_status.md`: 今回の変更状況を追記。

## テスト結果
- `node tests_server_audio_upload.js`: 成功。
- `npm test`: 成功。

## 注意点
- 環境変数 `OPENAI_TTS_MODEL` が設定されている環境では、その値が引き続き優先されます。
- `OPENAI_TTS_VOICE` の既定値は今回変更していません。
- UI変更はないためスクリーンショットは取得していません。

## 次にやるべきこと
- Render本番環境で `OPENAI_TTS_MODEL` を明示設定している場合は、必要に応じて `gpt-4o-mini-tts` へ更新してください。
- 本番で `marin` / `cedar` を含む音声を使ったMP3生成を少数件で確認してください。

## チャッピーに相談すべき点
- 本番環境変数で `OPENAI_TTS_MODEL` を固定する運用にするか、アプリ既定値に任せる運用にするか。
- `OPENAI_TTS_VOICE` の既定値も管理画面の初期voice `marin` に合わせるべきか。
