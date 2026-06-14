# Next Tasks

- `study-app/` をGitHub Pages上で開き、3つのCSVが正しくfetchできるか確認する。
- スマホ実機でモード切り替え、4択回答、次の問題、誤答復習の操作感を確認する。
- `row_number` を問題IDとして、localStorageに問題ごとの `total_correct` / `total_wrong` / `accuracy` / `current_streak` を保存・更新する。
- 必要に応じて `study-app/README.md` や教材作成ガイドを追加する。
- Playwright等を導入できる場合は、静的アプリのUI回帰テストを追加する。

- `.xlsx` アップロードをGitHub Pages本番URLで確認し、CDNブロック時の案内文が十分か確認する。
- CSV/Excelテンプレートのダウンロード機能を追加するか検討する。

- 実教材Excelを使って `tools/fill_excel_choices.py` を実行し、AI生成の不正解選択肢品質と再試行挙動を確認する。
- OpenAI APIの利用モデル、コスト、教材品質のバランスを見て、デフォルトモデルやプロンプトを調整する。
- 必要に応じて、補完ログCSV、実行前バックアップ、対象シート自動検出の強化を追加する。
