## 今回やったこと
- `/admin/audio-upload/` のMP3作成状況確認を、Excel上の対象キーと `/var/data/audio` の実MP3ファイル存在・サイズ確認に基づく仕様へ戻しました。
- 0バイトMP3は作成済みではなく未作成として扱うようにしました。
- 状況確認APIのレスポンスに `total` / `generated` / `missing` / `generatedRate` / `firstKey` / `lastKey` / `lastContiguousGeneratedKey` / `firstMissingKey` / `nextStartKey` / `nextEndKey` / `nextMissingKeys` を含めました。
- 「次の10件を入力」ボタンは、状況確認APIの `nextStartKey` / `nextEndKey` を使って開始キー・終了キーを入力するようにしました。
- OpenAI TTS用voice選択（13種類、初期値 `marin`）を管理画面・FormData・サーバー検証・TTSリクエストに反映しました。
- Samantha / en-US などの Web Speech API フォールバック音声候補は既存仕様のまま維持しました。

## 変更ファイル
- `server.js`: MP3生成状況API、0バイト除外、voice検証、TTS voice指定を追加。
- `admin/audio-upload/index.html`: voiceセレクト、状況確認ボタン、次の10件入力ボタンを追加。
- `admin/audio-upload/style.css`: 追加ボタンの横並び表示を追加。
- `admin/audio-upload/script.js`: 状況確認API呼び出し、API返却範囲の入力反映、voice送信を追加。
- `tests_server_audio_upload.js`: w000001〜w000010作成済み、w000011が0バイトの場合の `nextStartKey=w000011` / `nextEndKey=w000020` を検証するテストを追加。
- `README.md`: 管理画面のMP3作成状況確認とvoice選択仕様を更新。
- `docs/project_status.md`: 今回のMP3状況確認・voice選択更新を追記。

## テスト結果
- `node --check server.js`: 成功。
- `node tests_server_audio_upload.js`: 成功。
- `npm test`: 成功。

## 注意点
- UI変更がありますが、この環境にはブラウザ実行コマンド（Chromium/Google Chrome）が見つからなかったため、スクリーンショット取得は未実施です。
- 状況確認はアップロードされたExcelの対象行を正とし、`/var/data/audio/{question_key}.mp3` が存在し、かつサイズが1バイト以上の場合のみ作成済み扱いにします。
- `nextEndKey` は最初の未作成キーから10件分の末尾キーとして計算します。

## 次にやるべきこと
- 本番Renderの `/var/data/audio` で、実ファイルを使って状況確認APIと「次の10件を入力」ボタンの動作を確認してください。
- 13種類voiceのうち、本番で利用予定のvoiceを少数件で生成確認してください。

## チャッピーに相談すべき点
- `nextEndKey` を「最初の未作成キーから10連番固定」にする現仕様で、途中に生成済みファイルが混ざるケースでも運用上問題ないか確認してください。
