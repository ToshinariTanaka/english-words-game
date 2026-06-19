## 今回やったこと
- Render本番buildでNode依存関係に加えてPython依存関係も入るよう、`render.yaml` の `buildCommand` を `npm ci && python3 -m pip install -r tools/requirements.txt` に変更しました。
- 既存の `tools/requirements.txt` にある `openpyxl>=3.1.0` を、4シートExcelアップロード用の本番依存関係として明示利用する形にしました。
- サーバー側のExcel読み込みで `python3` 起動失敗または `openpyxl` import失敗などが起きた場合、ユーザーへ長い技術ログを返さず、Render環境の `python3` / `openpyxl` 確認を促すエラーにしました。詳細はサーバーログへ出します。
- README / docsに、4シートExcelアップロードには `python3` と `openpyxl` が必要で、Render build時にインストールすること、デプロイ後は `/study-app/` から実Excelアップロード確認することを追記しました。

## 変更ファイル
- `render.yaml`
- `server.js`
- `README.md`
- `docs/architecture.md`
- `docs/project_status.md`
- `docs/next_tasks.md`
- `docs/codex_report.md`

## テスト結果
- `python3 -c "import openpyxl; print(openpyxl.__version__)"`: 成功
- `npm test`: 成功
- `node tests_server_workbook_api.js`: 成功
- `git diff --check`: 成功

## 注意点
- Render環境のPython/pip自体が利用できる前提です。build logで `python3 -m pip install -r tools/requirements.txt` が成功しているか確認してください。
- 旧 `/api/questions/upload` と `/api/study-app/upload` は410のままです。RPG本体の旧アップロード導線は今後見直しが必要です。
- 第3段階の `question_key` 形式チェック、重複チェック、B列 `level` 厳格チェック、D〜G列重複チェック、専用エラー表示は今回未実装です。

## 次にやるべきこと
- Render本番へデプロイし、build logで `openpyxl` インストール成功を確認する。
- `/study-app/` から正式4シートExcelをアップロードし、4モードの保存件数と学習画面の読み込みを確認する。
- 第3段階として `question_key` と選択肢品質の厳格チェックを追加する。
- RPG本体の旧アップロード導線を、新しい4シートExcel運用に合わせて整理する。

## チャッピーに相談すべき点
- Render上でPython/pipが使えない場合に備えて、Docker化やNodeのみの `.xlsx` パーサーへ寄せるべきか。
- RPG本体でも4シートExcelを正式導線にするか、RPG側アップロードを非表示にしてstudy-appへ集約するか。
