# Next Tasks

- 実教材Excelで、シート名 `英単語` / `チャンク` / `英文和訳` を含む複数シートブックを各モード選択状態でアップロードし、別モードのC列 `question` が混入しないことをブラウザで確認する。

- `study-app/` をGitHub Pages上で開き、「サーバー保存不可」とRender版への誘導が表示され、3つのCSVが正しくfetchできるか確認する。
- スマホ実機でモード切り替え、4択回答、次の問題、誤答復習の操作感を確認する。
- 学習履歴localStorage保存は実装済み。今後はUI上の履歴表示や苦手問題フィルタの拡張を検討する。
- 必要に応じて `study-app/README.md` や教材作成ガイドを追加する。
- Playwright等を導入できる場合は、静的アプリのUI回帰テストを追加する。

- `.xlsx` アップロードをGitHub Pages本番URLで確認し、CDNブロック時の案内文が十分か確認する。
- CSV/Excelテンプレートのダウンロード機能を追加するか検討する。

- PC/iPhone/別ブラウザで `study-app/` を開き、標準CSVが同じ問題数・同じ内容で読み込まれることを実機確認する。
- 実教材Excelを使って `tools/fill_excel_choices.py` を実行し、AI生成の不正解選択肢品質と再試行挙動を確認する。
- OpenAI APIの利用モデル、コスト、教材品質のバランスを見て、デフォルトモデルやプロンプトを調整する。
- 必要に応じて、補完ログCSV、実行前バックアップ、対象シート自動検出の強化を追加する。

## Render運用後の確認候補

- Render Persistent Diskを `/var/data` にマウントしてデプロイする。
- PCでCSV/Excelをアップロードし、iPhoneの同じRender URLで共通問題データが表示されることを確認する。
- アップロードAPIに管理者認証を付けるか検討する。
- `/var/data/english_words_game/current-questions.json` のバックアップ手順を決める。

## Render統一後の実機確認

- Renderへデプロイし、Persistent Diskが `/var/data` にマウントされていることを確認する。
- PCでRPG本体 `/` からCSV/Excelをアップロードし、iPhoneで `/` を開いて「共通問題データから○問を読み込みました」と表示されることを確認する。
- PCで学習アプリ `/study-app/` からCSV/Excelをアップロードし、iPhoneで `/study-app/` を開いて同じ問題セットが読まれることを確認する。
- `GET /api/questions/status` で件数・最終更新日時・ファイル名が想定どおり更新されることを確認する。
- アップロードAPIを一般公開したままにするか、管理者トークンを追加するか判断する。


## RPG本体の音声・効果音 実機確認

- PC Chrome / Edge / Safariで「音声ランダム」ON/OFFと「現在の声」表示を確認する。
- iPhone Safariで初回表示後に音声候補が遅れて読み込まれても、ゲーム進行が止まらず読み上げできるか確認する。
- 正解音・不正解音のランダム感、音量、効果音OFF時に鳴らないことを実機確認する。

- `★英語学習ゲーム_001_追記済み009.xlsx` を実ブラウザでアップロードし、英単語・チャンク・英文和訳の3モードすべてで出題できることを確認する。

## study-app 第3段階の残作業

- `question_key` の接頭辞/桁数などの形式チェック、重複チェック、D〜G列重複チェックを追加する。
- 専用エラーボックスと最大20件のエラー一覧表示を追加する。
- 実ブラウザで `phrase` モード、音声読み上げ、効果音ON/OFF、復習、レベル範囲、ランダム出題を確認する。

- Renderデプロイ後、build logで `python3 -m pip install -r tools/requirements.txt` が成功していることを確認し、`/study-app/` から正式4シートExcelを実アップロードする。
- RPG本体の旧アップロード導線は `/api/questions/upload` が410になったため、第3段階とは別に新しい4シートExcel導線へ移行するか非表示にするか決める。
