## 今回やったこと
- study-app用MP3音声をZIPで一括アップロードできる `POST /api/audio/upload-zip` を追加しました。
- 既存の単一MP3アップロード `POST /api/audio/upload` は維持し、同じ `AUDIO_UPLOAD_TOKEN` / `X-Audio-Upload-Token` 認証方式を使うようにしました。
- ZIP内では `.mp3` のみを処理対象にし、保存時はサブフォルダを無視して basename のみ使います。
- `w000001.mp3` / `c000001.mp3` / `p000001.mp3` / `s000001.mp3` 形式以外、空ファイル、mp3以外、未対応圧縮方式はスキップし、JSONの `errors` に理由を返すようにしました。
- `/admin/audio-upload/` にZIP一括アップロード欄を追加しました。
- UI変更として管理画面にZIP選択欄と一括アップロードボタンを追加しました（スクリーンショットは未取得。テストはAPI中心）。

## 変更ファイル
- `server.js`: ZIPアップロードAPI、ZIP展開処理、保存・スキップ結果JSONを追加。
- `admin/audio-upload/index.html`: ZIP一括アップロード欄を追加。
- `admin/audio-upload/script.js`: 単一MP3/ZIPの共通アップロード処理を追加。
- `admin/audio-upload/style.css`: ZIP欄向けの見出し・区切り線スタイルを追加。
- `tests_server_audio_upload.js`: ZIPアップロードの正常保存・スキップ結果テストを追加。
- `README.md`: MP3管理アップロードAPIにZIP一括アップロードの説明を追記。
- `docs/project_status.md`: ZIP一括アップロード対応状況を追記。
- `docs/architecture.md`: 音声アップロードAPI構成にZIP一括アップロードを追記。
- `docs/codex_report.md`: 今回の作業内容に更新。

## テスト結果
- `node -c server.js`: 成功。
- `node tests_server_audio_upload.js`: 成功。
- `npm test`: 成功。

## 注意点
- ZIP展開はNode標準機能のみで実装しており、通常のstore/deflate圧縮に対応しています。暗号化ZIPや特殊な圧縮方式はスキップ対象です。
- ZIP内に同じbasenameが複数ある場合は処理順に上書きされ、最後に処理された正常ファイルが残ります。
- Render本番で利用するには既存同様 `AUDIO_UPLOAD_TOKEN` と Persistent Disk `/var/data/audio` が必要です。

## 次にやるべきこと
- Render本番の `/admin/audio-upload/` から小さなZIPで実アップロードし、`/audio/{filename}.mp3` で再生できることを確認してください。
- 大量アップロードが必要な場合は `MAX_UPLOAD_BYTES` の運用上限を確認してください。

## チャッピーに相談すべき点
- ZIP内に同一basenameが複数ある場合、現状どおり「後勝ち上書き」で良いか相談してください。
- スキップ詳細JSONの項目名（`uploaded` / `skipped` / `errors` / `files`）を運用画面や手順書と合わせる必要があるか確認してください。
