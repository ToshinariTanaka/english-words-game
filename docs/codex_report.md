## 今回やったこと
- 現在のMP3ファイル名だけを信用して再生する方式をやめ、`audio_manifest.json` に存在する `question_key` / MP3対応だけをサーバーが配信する方式に変更しました。
- Excel由来の4シート問題データを検証してからMP3生成対象を作り、生成成功時に `question_key`、モード、問題ID、読み上げ英語テキスト、MP3ファイル名を manifest に保存するようにしました。
- manifestにない既存MP3は `/audio/...` から404扱いになり、旧MP3を誤再生しないようにしました。
- 新生成時に同名の旧MP3がmanifest管理外の場合は削除せず `mp3_backup_before_relink` へ退避してから再生成するようにしました。上書き再生成時は音声フォルダ内の既存MP3をまとめて退避できます。
- ローカル生成ツール `tools/generate_study_audio.py` でも `audio_manifest.json` と `audio_manifest.csv` を出力するようにしました。
- 音声生成状況APIは、実ファイルの存在だけでなく manifest に載っているMP3だけを生成済みとして数えるようにしました。

## 変更ファイル
- `server.js`
- `tools/generate_study_audio.py`
- `tests_server_audio_upload.js`
- `docs/codex_report.md`
- `docs/architecture.md`
- `docs/project_status.md`
- `README.md`

## テスト結果
- `node --check server.js` 成功。
- `python3 -m py_compile tools/generate_study_audio.py` 成功。
- `npm test -- --runInBand` 成功。npm の `Unknown env config "http-proxy"` 警告は表示されましたが、テスト自体はすべて通過しました。

## 注意点
- この作業環境には添付Excelファイルが存在しなかったため、実データからのMP3一括生成・実MP3退避は未実行です。コード側は、ExcelアップロードまたはローカルCLI実行時に新しいmanifestを作る状態まで整えています。
- 既存MP3ファイルはmanifestに載っていなければ配信されません。生成済みのはずの音声が404になる場合は、正しいExcelから再生成して `audio_manifest.json` を作成してください。
- 単体MP3/ZIPアップロード機能は保存自体は可能ですが、再生可否はmanifestに登録済みかどうかで決まります。今後の正規運用はExcelからの再生成を優先してください。

## 次にやるべきこと
- 本番/検証環境で、正しい4シートExcelを `/admin/audio-upload/` からアップロードしてMP3を再生成してください。
- 再生成後、`/var/data/audio/audio_manifest.json` の `items` が `question_key` と1対1になっていることを確認してください。
- 英単語、チャンク、文節和訳、英文和訳の各モードで、MP3あり問題は新MP3だけ、MP3なし問題はWeb Speech APIで読まれることを実ブラウザで確認してください。

## チャッピーに相談すべき点
- 単体MP3/ZIPアップロードを今後も残すか、manifestとExcelの整合性を守るため管理画面上で非推奨または無効にするか。
- `question_key` 以外に別の問題ID列をmanifestへ保持する必要があるか。現状は安定IDとして `question_key` を `questionId` にも入れています。
