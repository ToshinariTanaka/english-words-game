## 今回やったこと
- study-app正式形式の4シートExcelからMP3音声を一括生成するローカルPythonツール `tools/generate_study_audio.py` を追加しました。
- C列 `question`、M列 `question_key`、D〜G列の選択肢がそろった出題対象行だけを読み取り、`w/c/p/s + 6桁` のキー形式をモード別に検証するようにしました。
- `--mode`、`--output`、`--overwrite`、`--limit`、`--start-key`、`--end-key`、`--dry-run` に対応しました。
- TTS生成処理を `synthesize_text_to_mp3(text, output_path)` に分離し、現時点では環境変数 `OPENAI_API_KEY` を使うOpenAI TTS実装にしました。APIキーはブラウザ側やリポジトリには置きません。
- 生成結果を `audio_output/generation_log.csv` 形式で出力するようにしました。
- READMEにセットアップ、実行例、対象シート、キー形式、dry-run、ログ仕様を追記しました。

## 変更ファイル
- `tools/generate_study_audio.py`: study-app用ExcelからMP3を一括生成するCLIツールを新規追加。
- `README.md`: ローカルPython音声生成ツールの使い方を追記。
- `docs/project_status.md`: 今回の追加ツールの状況を追記。
- `docs/architecture.md`: ローカルTTS生成ツールとprovider分離方針を追記。
- `docs/codex_report.md`: 今回の作業内容、テスト結果、注意点を更新。

## テスト結果
- `python3 -m py_compile tools/generate_study_audio.py`: 成功。
- `python3 /tmp/make_audio_test_workbook.py`: 成功。正式4シート形式の最小テストExcelを作成。
- `python3 tools/generate_study_audio.py /tmp/study_audio_test.xlsx --mode all --output /tmp/study_audio_output --dry-run`: 成功。4件のdry-runログを生成。
- `python3 tools/generate_study_audio.py /tmp/study_audio_test.xlsx --mode definition --output /tmp/study_audio_output --dry-run --start-key s000001 --end-key s000050 --limit 1`: 成功。範囲指定とlimitで1件のdry-runログを生成。
- `npm test`: 成功。

## 注意点
- 実MP3生成には `OPENAI_API_KEY` が必要です。未設定で `--dry-run` を付けない場合、対象ごとに `failed` としてログへ記録します。
- 現在のprovider実装はOpenAI TTSです。別TTS APIへ変更する場合は `synthesize_text_to_mp3` を差し替えてください。
- `--start-key` / `--end-key` は選択したモードのキー形式に合う値だけを受け付けます。`--mode all` の場合は複数prefixをまたげますが、文字列順での範囲判定です。通常は単一モードで使う方が安全です。
- 今回はローカルCLIとREADME中心の変更で、Web UI変更はありません。スクリーンショットは不要です。

## 次にやるべきこと
- 実際の本番Excelで `--dry-run` を実行し、生成対象件数とログ内容を確認してください。
- 少数件数で `--limit` を付けて実MP3生成を試し、study-appの `/audio/{question_key}.mp3` 配信・再生と組み合わせて確認してください。
- 必要に応じて `OPENAI_TTS_MODEL` / `OPENAI_TTS_VOICE` の運用標準値を決めてください。

## チャッピーに相談すべき点
- OpenAI TTSの音声・モデルをどれに固定するか、また英単語/英文で音声を変える必要があるか相談してください。
- `--mode all` でprefixをまたぐ `--start-key` / `--end-key` の扱いを、運用上は単一モード推奨で十分か相談してください。
