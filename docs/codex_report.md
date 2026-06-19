## 今回やったこと
- 第4段階として、RPG本体 `/` のCSV/Excelアップロード導線を「共通保存」から「一時確認用」へ整理しました。
- RPG本体の `script.js` から旧 `POST /api/questions/upload` への保存処理・定数・FormData送信を削除し、アップロードファイルはブラウザ上で読み込んで試すだけにしました。
- アップロード成功メッセージに「一時確認用」「共通保存は行っていません」「PC・iPhone共通利用は学習アプリの4シートExcelアップロードを使う」趣旨を明記しました。
- RPG本体のアップロード欄付近に `/study-app/` への「問題データを管理する」導線を追加しました。
- RPG本体の起動時読み込みで `GET /api/questions/current` を優先し、失敗時のみ `data/default-words.csv` へフォールバックする処理は維持しました。
- RPG本体が旧アップロードAPIを呼ばないこと、成功メッセージと `/study-app/` 導線があること、`GET /api/questions/current` 読み込みが維持されることを固定するテストを追加しました。
- README / docs に、正式な問題データ管理は `study-app/` の4シートExcelアップロードへ集約し、RPG本体アップロードは一時確認用であることを追記しました。

## 変更ファイル
- `index.html`: RPG本体のアップロード欄文言を一時確認用に変更し、`/study-app/` への「問題データを管理する」リンクを追加。
- `script.js`: 旧 `POST /api/questions/upload` 保存処理を削除し、アップロード成功時は一時確認用として読み込んだ旨を表示。
- `style.css`: `/study-app/` 管理リンクをボタン風に表示するスタイルを追加。
- `tests_rpg_upload_guidance.js`: RPG本体の旧API非使用・一時確認メッセージ・study-app導線・`GET /api/questions/current` 維持を確認する静的テストを追加。
- `package.json`: `npm test` に `tests_rpg_upload_guidance.js` を追加。
- `README.md`: RPG本体の問題データ読み込み、一時確認アップロード、正式管理先、旧API410を追記。
- `docs/architecture.md`: RPG本体アップロード導線を一時確認用へ整理した設計に更新。
- `docs/project_status.md`: 第4段階の方針変更を追記。
- `docs/next_tasks.md`: RPG本体旧アップロード導線の整理完了に合わせて次タスクを更新。
- `docs/codex_report.md`: 今回の作業内容に更新。

## テスト結果
- `npm test`: 成功。
- `git diff --check`: 成功。

## 注意点
- UI文言と導線を変更しましたが、この環境にはブラウザスクリーンショット取得用ツールがないため、実画面スクリーンショットは未取得です。表示内容としては、アップロード欄のラベルが「CSV/Excelを一時確認用に読み込む」になり、その直下に「問題データを管理する」ボタン風リンクが表示されます。
- RPG本体は4モード化していません。従来どおり mode指定なし `GET /api/questions/current` でサーバー側の既定 `word` を読みます。
- 旧APIは復活させていません。RPG本体からも呼び出しません。
- study-app側の4モードUI、正式4シートExcelアップロード、検証処理、サーバーAPI仕様は変更していません。

## 次にやるべきこと
- Renderへデプロイ後、RPG本体 `/` で共通問題データが `GET /api/questions/current` から読み込まれることを実ブラウザで確認してください。
- RPG本体でCSV/Excelを選択したときに、一時確認用メッセージが表示され、ページ再読み込み後は共通保存されていないことを確認してください。
- `/study-app/` の正式4シートExcelアップロード導線が引き続き使えることを本番で確認してください。

## チャッピーに相談すべき点
- RPG本体の一時確認アップロード欄を残すか、混乱防止のため将来的に非表示・折りたたみにするか相談してください。
- GitHub Pages版で `RENDER_STUDY_APP_URL` を正式Render URLへ設定するタイミングを相談してください。
