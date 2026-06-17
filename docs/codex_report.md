## 今回やったこと
- `study-app/` に、現在表示中の C列相当 `question` の英語だけを Web Speech API で読み上げる機能を追加しました。
- 新しい問題を表示したとき、出題設定の「自動読み上げ」がONなら自動で発音するようにしました。初期値はONです。
- 問題カード付近に「🔊 もう一度聞く」ボタンを追加し、自動読み上げOFFでも手動再生できるようにしました。
- 次の問題、読み込み状態、空状態、終了状態へ移る前に `speechSynthesis.cancel()` を呼び、前の音声が残りにくいようにしました。
- 初回の「この設定で出題開始」ボタン押下時に `speechSynthesis.cancel()` で音声機能へ触れ、iPhone Safariの手動再生が安定しやすいようにしました。
- 音声機能がないブラウザでは何もせず戻るガードを入れ、学習アプリ本体が壊れないようにしました。
- READMEに `study-app/` の音声読み上げ仕様を追記しました。

## 変更ファイル
- `study-app/index.html`
- `study-app/script.js`
- `study-app/style.css`
- `README.md`
- `docs/codex_report.md`
- `docs/project_status.md`

## テスト結果
- `node --check study-app/script.js`: PASS
- `npm test`: PASS
- `python3 -m http.server 4173`: PASS（ローカル静的サーバー起動）
- `curl -I http://127.0.0.1:4173/study-app/`: PASS（`study-app/` がローカルで配信されることを確認）
- `npx playwright --version`: WARN（npm registry が 403 Forbidden のためPlaywrightを取得できず、ブラウザスクリーンショットは未取得）

## 注意点
- Web Speech APIの自動再生はブラウザ・端末のポリシーに左右されます。特にiPhone Safariでは自動読み上げがブロックされる可能性があるため、手動の「🔊 もう一度聞く」ボタンを併用してください。
- この環境では実機のPC Chrome音声出力、iPhone Safari音声出力までは確認できません。ブラウザ上のUI表示とコード上の再生処理・ガードを確認しました。
- 外部音声APIは使用していないため、利用できる英語音声・品質はブラウザ/OSに依存します。

## 次にやるべきこと
- 実機のPC Chromeで、英単語・チャンク・英文和訳の3モードそれぞれが `question` の英語だけを読み上げることを確認する。
- 実機のiPhone Safariで、少なくとも「🔊 もう一度聞く」ボタンによる手動再生が動くことを確認する。
- 必要に応じて、ユーザーが選べる読み上げ速度や英語音声の種類を追加するか検討する。

## チャッピーに相談すべき点
- iPhone Safariで自動読み上げをどこまで重視するか（自動再生が不安定な場合、初回だけ案内文や「音声を有効化」ボタンを出すべきか）。
- 英語音声のアクセント（en-US固定のままか、en-GBなどを選べるようにするか）。
