# 中学生英単語教材：Excelアップロードによる共通更新

## 毎回の操作

1. 塾長がExcelの4シートを編集・保存。
2. 管理者用ページ /admin/junior-data/ で .xlsx を選び、公開対象を指定。
3. ブラウザが全問題を検査し、モード別の問題数を表示。
4. 管理者用トークンを入力して公開を確定。検査済みの4モードがR2へ保存され、すべて揃ってから共有公開の版が切り替わる。
5. 塾生はアプリを再読込するだけで新しい問題を使用。GitHub操作や再デプロイは不要。

元Excelは塾長のPC上の原本。Cloudflareには問題の構造化JSONだけを保存し、元のxlsxバイナリは保存しない。学習履歴は現在どおりブラウザ端末に保存し、端末間同期は行わない。

## 出題範囲

- a1a2：4シートともCEFR A1・A2のみ（初期推奨）。
- target1800：★英単語シートのN1を target1800、採用行のN列を1とする。★チャンク・★文節和訳・★英文和訳はA1・A2を使用する。フラグの見出しがなければ検査エラーとする。
- all：4シートの全問題（システムテスト用）。上級問題も公開されるので注意。

正式シート名：★英単語、★チャンク、★文節和訳、★英文和訳。
標準列：A～Mの row_number, level, question, correct, choice1, choice2, choice3, total_correct, total_wrong, accuracy, current_streak, note, question_key。
検査対象：問題文・正解・誤答3個・CEFRレベル・問題IDの重複・4択の重複・容量制限。

## Cloudflare初回設定（アカウント所有者が実施）

対象のCloudflare Pagesプロジェクト：up-junior-words-preview。

1. R2 Object Storageで標準クラスの非公開バケットを作成する（例：up-junior-words-data）。Publicアクセスを有効にしない。
2. Pagesプロジェクトの Settings → Bindings → Add → R2 bucket で、Variable name を JUNIOR_DATA にして上記バケットを指定する。
3. Settings → Variables and Secrets に32文字以上の十分ランダムな値をシークレット JUNIOR_UPLOAD_TOKEN として登録する。値をGitHub・チャット・画面写真に掲載しない。
4. この開発用ブランチをレビューしてから、現在Cloudflareで本番ブランチとして指定されている feature/static-junior-preview-20261008 へ反映する。反映後は再デプロイし、バインディングを適用する。
5. 管理者用ページからExcelを検査・公開し、塾生の学習画面で各モードを確認する。

R2の有効化時に課金方法の登録が必要になる可能性がある。無料枠と料金設定を確認してから進めること。

## API

- GET /api/questions/current?mode=word|chunk|phrase|definition：公開中の問題JSONをR2からストリーミング配信。
- GET /api/questions/status：公開有無、各モードの問題数、更新日時。
- POST /api/admin/questions/stage/:mode：同一オリジン、管理者トークン必須。検査済み問題をR2へ保存。
- POST /api/admin/questions/publish：同じ認証必須。4モードの存在を確認して公開版のマニフェストを更新。
- バインディング：JUNIOR_DATA
- シークレット：JUNIOR_UPLOAD_TOKEN

Functionsの対象は出力先の_routes.jsonにより /api/* のみに限定。静的HTML/JS/CSSはFunctionsの課金対象にしない。

## 安全性

- 既存のRender本番・テスト環境と保存ディスクは触らない。
- 途中のアップロード失敗時は以前の教材を維持。
- R2には過去の版が残る。容量と利用料を定期確認する。
- 教材データのみ公開し、塾生の個人情報は含めない。
- 管理画面のURL自体は一般から見えるが、保存APIは管理者トークンがないと使用できない。
- 公開JSONは第三者も取得できるため、公開可能な自作教材だけを採用する。
- 学習履歴のクラウド同期・有料会員認証は別途設計する。

## 自動テスト

Node.js 22で次を実行する。

    node scripts/build-static-junior.js
    node --test tests/static_junior_build.test.js tests/junior_excel_upload.test.mjs

公開前にA1・A2、ターゲット1800のフラグ、全9,000問程度の処理、認証エラー、途中失敗時のロールバック、音声・復習・4モード出題を確認する。

## Secretを再設定した後の再デプロイ

Cloudflare Pagesで管理者Secret JUNIOR_UPLOAD_TOKENを更新した場合は、公開用ブランチで安全な変更を行って再デプロイする。Secretの実際の値や一部をこの文書・GitHub・ログに記載しない。既存R2データとRenderの本番サービスは変更しない。
