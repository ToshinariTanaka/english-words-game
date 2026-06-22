## 今回やったこと
- study-app の「もう一度聞く」で、question_key がある場合は MP3 URL を HEAD で確認してから MP3 再生を試すようにしました。
- MP3 が 404/403/500 などの非 200 系、fetch 失敗、audio.play() 失敗、question_key なしの場合に、必ず C列相当の question テキストだけを Web Speech API で読み上げるフォールバックを追加しました。
- voiceStatus に「MP3を再生しています」「MP3が未作成のため、ブラウザ音声で読み上げます」「ブラウザ音声が利用できません」を表示できるようにしました。
- study-app/index.html の script.js にキャッシュ対策用クエリ `v=20260622-audio-fallback` を追加しました。
- MP3存在時、404時、question_keyなし、audio.play() reject、fetch失敗の音声フォールバック回帰テストを追加し、npm test に組み込みました。

## 変更ファイル
- `study-app/script.js`: MP3のHEAD確認、MP3再生失敗時のWeb Speech APIフォールバック、voiceStatus表示を追加。
- `study-app/index.html`: `script.js` のキャッシュバスターを追加。
- `tests_study_app_audio_fallback.js`: 音声フォールバックの回帰テストを追加。
- `package.json`: 新規テストを `npm test` に追加。
- `docs/architecture.md`: study-app音声仕様にHEAD確認とフォールバック条件を追記。
- `docs/project_status.md`: 2026-06-22の音声フォールバック修正状況を追記。
- `README.md`: study-appの音声再生仕様を追記。
- `docs/codex_report.md`: 本作業内容へ更新。

## テスト結果
- `npm test`: 成功。

## 注意点
- MP3未生成時のWeb Speech APIフォールバックはブラウザの `speechSynthesis` に依存します。ブラウザや端末設定でWeb Speech API自体が使えない場合は `voiceStatus` に「ブラウザ音声が利用できません」と表示します。
- UIの見た目を変える変更ではないため、スクリーンショットは取得していません。
- HEADリクエストが失敗した場合は、無音回避を優先してMP3再生へ進まずWeb Speech APIにフォールバックします。

## 次にやるべきこと
- Render本番で、MP3がある問題・未生成の問題・iPhone Safariの各パターンを実機確認してください。
- 必要であれば、HEAD非対応サーバー向けに通常GETでの存在確認へ切り替える追加フォールバックを検討してください。

## チャッピーに相談すべき点
- MP3未生成時に `voiceStatus` だけで十分か、追加で小さなトースト表示やログ表示が必要か相談してください。
