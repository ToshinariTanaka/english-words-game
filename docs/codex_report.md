## 今回やったこと
- 第3.7段階として、Render本番のNode Web Service実行時でも `openpyxl` を確実に import できるよう、Python依存関係を `.python_packages` に固定配置する構成へ変更しました。
- `render.yaml` の `buildCommand` を `npm ci && python3 -m pip install --target ./.python_packages -r tools/requirements.txt` に変更しました。
- `server.js` に `PYTHON_PACKAGE_DIR` と `getPythonEnv()` を追加し、Excel解析用 `parseWorkbookBuffer()` と診断用 `buildPythonDiagnostics()` の `spawnSync('python3', ...)` が同じ `PYTHONPATH` を使うようにしました。
- Excel解析失敗時のサーバーログに `pythonPackageDir` と `pythonPath` を追加しました。ユーザー画面には従来どおり短いエラーだけを返します。
- 診断APIのJSONに `pythonPackageDir` と `pythonPath` を含め、`/api/diagnostics/python` で確認したPython環境とExcel解析処理のPython環境が一致するようにしました。
- `.python_packages/` をGit管理対象外にするため `.gitignore` を追加しました。
- READMEに、Render本番のPython依存関係を `.python_packages` に入れるBuild Commandと、`/api/diagnostics/python` で `openpyxl.available:true` を確認してからExcelアップロードする手順を追記・更新しました。

## 変更ファイル
- `.gitignore`: `.python_packages/` を除外。
- `render.yaml`: Render buildCommandを `.python_packages` へのtarget install方式に変更。
- `server.js`: `PYTHON_PACKAGE_DIR` / `getPythonEnv()` を追加し、診断APIとExcel解析のPython実行に同じ `PYTHONPATH` を適用。失敗ログにもPythonパス情報を追加。
- `tests_server_workbook_api.js`: 診断APIレスポンスに `pythonPackageDir` / `pythonPath` が含まれ、`.python_packages` が参照されることを確認。
- `README.md`: Render本番のPython依存関係インストール方式と診断API確認手順を更新。
- `docs/project_status.md`: 第3.7段階のRender Python依存関係固定配置対応を追記。
- `docs/codex_report.md`: 今回の作業内容・テスト結果・注意点を更新。

## テスト結果
- `npm test`: 成功。
- `git diff --check`: 成功。
- `rm -rf .python_packages`: 成功。
- `python3 -m pip install --target ./.python_packages -r tools/requirements.txt`: 環境制限により未完了（プロキシ経由は403、プロキシなしはDNS解決不可）。
- `PYTHONPATH=./.python_packages python3 -c "import openpyxl; print(openpyxl.__version__)"`: 上記install未完了のため未実施。

## 注意点
- `.python_packages` はビルド成果物としてRender上に作られる想定で、Gitにはコミットしません。
- 診断APIは `pythonPath` を返します。機密値ではありませんが、Render実行環境のパス情報が見えるため、公開URLとして必要な範囲で利用してください。
- UI変更はありません。スクリーンショット取得対象の見た目変更はありません。
- Render本番ではデプロイ後に必ず `https://<service>.onrender.com/api/diagnostics/python` を開き、`openpyxl.available:true` を確認してから `/study-app/` で正式4シートExcelをアップロードしてください。

## 次にやるべきこと
- Renderへデプロイし、`/api/diagnostics/python` の `pythonPath` に `.python_packages` が含まれ、`openpyxl.available:true` になることを確認してください。
- 診断API成功後、`/study-app/` から正式4シートExcelをアップロードし、`/api/questions/status` で4モードの件数が保存されることを確認してください。

## チャッピーに相談すべき点
- Render本番のサービスURLが確定したら、README内の未確認URL表記を正式URLに置き換えるか相談してください。
- 診断APIに `pythonPath` を返し続けるか、運用安定後にレスポンスから外してログのみへ寄せるか相談してください。
