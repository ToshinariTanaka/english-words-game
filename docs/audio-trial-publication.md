# 試作音声の初回公開

対象は承認済み30問×Nova/Ashの60本のみ。全9,185問の生成ではない。
Production/PreviewのJUNIOR_AUDIOをup-words-audioに接続し、Productionを再デプロイ済み。

## 手順

1. このPRのPublish approved audio trialチェックを確認してmainへマージ。
2. ActionsのPublish approved audio trialをmainで手動実行し、publishを有効にする。
3. 4モードの公開一覧と全60本の生徒サイト経由での照合が成功したことをログで確認。
4. PC/iPhoneで対象問題のNova、Ash、ランダム、繰り返し再生を確認する。

push時はローカルテストと生成artifactの検証のみ。手動publish時だけR2へ書く。
60本すべてをR2から読み戻して照合後、固定リリースの4一覧を保存・照合し、最後にcurrent.jsonを条件付き新規作成する。
別リリースが存在する場合は上書きせず停止する。再実行は同じリリースを照合して再利用する。
公開後のHTTP検証で失敗した場合もポインターは残る。ログの段階を確認して再実行できる。音声生成APIは呼ばない。
公開対象外の問題は既存の端末音声フォールバックを利用する。アプリの英語本文ハッシュが一致した音声だけ再生する。
R2バケットのPublic Accessを有効にする必要はない。生徒サイトの既存読取専用APIを使う。

mainにはCloudflare管理画面のビルドスクリプトがなく、管理画面の自動プレビューチェックは別途失敗し得る。
