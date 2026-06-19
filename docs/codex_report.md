## 今回やったこと
- `question_key` から `{API_BASE}/audio/{question_key}.mp3` を組み立て、手動の「もう一度聞く」操作でMP3を優先再生するようにしました。
- MP3が存在しない、読み込み失敗、または再生失敗の場合は、従来のWeb Speech APIで現在表示中のC列相当 `question` の英語だけを読み上げるフォールバックを維持しました。
- スマホ利用前提に合わせ、問題表示時の自動読み上げを停止し、ユーザー操作時だけ音声再生するようにしました。
- 次の問題表示、読み込み状態、セッション終了時にMP3とWeb Speech APIの両方を停止する共通停止処理を追加しました。
- Render側に `GET /audio/{filename}.mp3` を追加し、Persistent Diskの `/var/data/audio` から `audio/mpeg` と `access-control-allow-origin: *` 付きでMP3を配信するようにしました。
- UIの見た目は変更していないため、スクリーンショット取得は不要と判断しました。

## 変更ファイル
- `server.js`: `/audio/` 配信ルート、Persistent Disk音声ディレクトリ、CORS付き `audio/mpeg` レスポンスを追加。
- `study-app/script.js`: MP3優先再生、Web Speech APIフォールバック、音声停止処理、自動再生停止を追加。
- `README.md`: Render音声配信仕様とMP3配置ルールを追記。
- `docs/project_status.md`: MP3音声配信対応の状態を追記。
- `docs/architecture.md`: study-app音声再生とRender音声配信APIの設計を追記。
- `docs/next_tasks.md`: Renderデプロイ後の音声配信確認項目を追記。
- `docs/codex_report.md`: 今回の作業内容、テスト結果、注意点を更新。

## テスト結果
- `node -c server.js` を実行し、構文エラーがないことを確認しました。
- `node -c study-app/script.js` を実行し、構文エラーがないことを確認しました。
- `npm test` を実行し、既存テストがすべて成功しました。

## 注意点
- MP3生成処理やAPIキーはブラウザ側にもサーバー側にも追加していません。ブラウザは生成済みMP3を取得して再生するだけです。
- `/audio/` の実ファイルはRender Persistent Diskの `/var/data/audio` に `{question_key}.mp3` 形式で配置する必要があります。
- MP3が1つも存在しない場合でも、404後にWeb Speech APIへフォールバックするため既存読み上げとクイズは継続します。
- `autoSpeak` チェックボックスは既存UIとして残っていますが、今回のスマホ前提仕様に合わせて問題表示時の自動再生には使っていません。

## 次にやるべきこと
- Render Persistent Diskに `/var/data/audio/w000001.mp3` などの実ファイルを置き、`https://english-words-game-1ph3.onrender.com/audio/w000001.mp3` が `content-type: audio/mpeg` と CORS ヘッダー付きで返ることを確認してください。
- GitHub Pages版の `/study-app/` から「もう一度聞く」を押し、RenderのMP3再生またはWeb Speech APIフォールバックが動くことを実機確認してください。

## チャッピーに相談すべき点
- 既存の「問題表示時に自動で読み上げ」チェックボックスを非表示または文言変更するか相談してください。
