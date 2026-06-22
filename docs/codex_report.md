## 今回やったこと
- study-app の出題設定欄に「自動読上げ」チェックボックスを復活させました。
- 自動読上げ設定を `englishWordsGame.studyApp.autoSpeak` に保存し、初期値はON、ユーザーがOFFにした場合は次回以降もOFFを保持するようにしました。
- 問題表示時、自動読上げONの場合だけ現在の C列相当 `question` の英語を読み上げるようにしました。セッション終了画面や問題なし状態では読み上げません。
- 「もう一度聞く」と自動読上げを同じ `speakCurrentQuestion` 経路に統一し、`question_key` がある場合は HEAD 確認をせず Audio 要素でMP3再生を実際に試すようにしました。
- MP3の未生成・読み込み失敗・`audio.play()` reject・`error`イベント・タイムアウト・`question_key` なしの場合だけ Web Speech API へフォールバックするようにしました。
- 問題切り替え時に、前のMP3再生とWeb Speech API読み上げを停止する既存処理を維持し、自動読上げでも利用するようにしました。
- `voiceStatus` に自動読上げON/OFF、MP3再生中、Web Speechフォールバック、ブラウザ音声利用不可の状態を表示するようにしました。
- `script.js` のキャッシュバスターを `v=20260622-auto-speak` に更新しました。
- 自動読上げとMP3優先/フォールバックの回帰テストを追加・更新しました。

## 変更ファイル
- `study-app/index.html`
- `study-app/script.js`
- `tests_study_app_audio_fallback.js`
- `tests_study_app_auto_speak.js`
- `package.json`
- `docs/codex_report.md`
- `docs/architecture.md`
- `docs/project_status.md`

## テスト結果
- `node tests_study_app_auto_speak.js`: 成功
- `node tests_study_app_audio_fallback.js`: 成功
- `npm test`: 成功

## 注意点
- スマホブラウザでは自動再生制限により、自動読上げONでも初回や状況によってMP3/Web Speech APIの再生がブロックされる可能性があります。その場合でも出題進行と4択回答は止めない設計です。
- Web Speech APIの音声候補はブラウザ・OS依存です。指定10種類が端末にない場合はブラウザ自動選択へフォールバックします。
- MP3判定はHEADではなく実再生試行に変更したため、直接URLで再生できるMP3がHEAD制限で誤って除外される問題を避けます。

## 次にやるべきこと
- iPhone Safari / Android Chrome の実機で、自動読上げON/OFF、初回ユーザー操作後の再生可否、voiceStatus表示を確認してください。
- Render上の実MP3配置済みデータで、MP3優先再生とWeb Speechフォールバックを確認してください。

## チャッピーに相談すべき点
- スマホで自動再生がブロックされた場合、voiceStatus以外に「もう一度聞くを押してください」の案内を常時表示するか相談してください。
