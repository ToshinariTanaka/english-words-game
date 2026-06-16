## 今回やったこと
- study-appのCSV/Excel読み込みを、A〜Lの最初の12列だけを標準列として扱う位置ベースの正規化に変更しました。
- M列以降の余分な列と、後方に混ざる `A row_number` / `note` などの重複ヘッダーを無視するようにしました。
- UTF-8 BOM付きCSVを正常に読み込み、UTF-8で文字化けが出る場合は可能な範囲でShift_JIS/CP932デコードを試すようにしました。
- ファイル名に「英単語」「英単語テスト」「チャンク」「英文和訳」が含まれる場合、アップロード先モードを自動判定するようにしました。判定できない場合は従来どおり現在選択中モードを使います。
- Render版サーバーのアップロードAPIでも同じA〜L標準化を行い、`POST /api/study-app/upload` を `POST /api/questions/upload` と同じ処理で受け入れるようにしました。
- サーバー保存時に、モード別の標準CSVを `/var/data/study-app/{word_mode.csv,chunk_mode.csv,definition_mode.csv}` へBOM付きUTF-8で保存するようにしました。
- アップロード失敗時の画面表示にAPI名と理由を含め、原因を追いやすくしました。

## 変更ファイル
- `study-app/script.js`
- `server.js`
- `tests_study_app_definition_mode.js`
- `README.md`
- `docs/architecture.md`
- `docs/project_status.md`
- `docs/codex_report.md`

## テスト結果
- `npm test` : PASS
- ローカルNodeサーバーを一時起動し、UTF-8 BOM付き・日本語/★付きファイル名・英文中カンマ・M列以降の重複ヘッダーを含むCSVを `POST /api/study-app/upload` へ送信できることを確認 : PASS
- 保存された `/var/data/study-app` 相当のCSVが標準ヘッダー `row_number,level,question,correct,choice1,choice2,choice3,total_correct,total_wrong,accuracy,current_streak,note` になり、M列以降を含まないことを確認 : PASS

## 注意点
- ユーザー指定の実ファイル3点（`★英単語テスト_001_補完済み003.csv` / `★チャンク_001_補完済み005.csv` / `★英文和訳_001_補完済み002.csv`）はリポジトリ内に存在しなかったため、同等条件のテストCSVで確認しました。
- `.xlsx` のサーバー側直接パースは依存ライブラリがないため未対応です。ブラウザ側ではSheetJSでExcelを読み、正規化CSVとしてAPIへ送信します。
- PC/iPhone間で同じ問題が読めるかは、Render本番環境とPersistent Disk設定での実機確認が必要です。ローカルではAPI保存と標準CSV書き出しまで確認済みです。
- GitHub Pagesではサーバー保存APIが使えないため、アップロード内容は一時確認用途です。

## 次にやるべきこと
- 実教材3ファイルを入手して、今回追加したA〜L位置ベース読み込み、選択肢不足行スキップ、問題数表示を実データで確認する。
- Render本番へデプロイし、PCでアップロード後、iPhoneで同じモードを開いて同じ問題セットが読まれることを確認する。
- サーバー側でも`.xlsx`を直接受け入れる必要がある場合は、xlsxライブラリの導入可否を判断する。

## チャッピーに相談すべき点
- Render APIで保存するJSON正本と `/var/data/study-app/*.csv` のどちらを運用上の一次データと呼ぶか。
- サーバー側Excel直接アップロード対応のために依存ライブラリを追加してよいか。
