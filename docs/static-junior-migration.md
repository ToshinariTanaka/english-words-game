# 中学生版・静的試験移転（2026-10-08）

## 目的と安全条件

- 調査対象の本番サービス：Render の english-words-game-junior。
- 本番の Render Web Service・Persistent Disk・共有教材・MP3・会員情報には変更を加えない。
- 現行の english-words-game リポジトリを使用する。junior-english-words-game という別リポジトリを本番のソースと混同しない。
- この試験版は **公開可能なデモ教材だけ**を使用し、生徒の情報や保存済み本番問題を自動取得しない。
- 学習履歴と学習回数はブラウザの localStorage に保存されるが、元のRender版とは別ドメインのため自動引継ぎ・端末間同期はしない。
- 音声はブラウザの Web Speech API のみ。Render上のMP3や生成APIは呼び出さない。
- 単一CSV・正式4シートExcelの一時読み込みは可能。アップロードした教材をサーバーへ保存せず、ページ更新後はサンプルに戻る。
- この試験版は一般公開・有料化・本番停止の承認ではない。試験段階で検索除外を設定するが、URLを知る第三者がアクセスできるため、非公開データを置かない。

## ビルドとテスト

Node.js 18以上でリポジトリ直下から実行：

    node scripts/build-static-junior.js
    node --test tests/static_junior_build.test.js

成果物：dist-junior/（HTML・JS・CSS・4モードのデモCSV・robots.txt・_headers）。

生成スクリプトは study-app/ を **読み取るだけ**で、本番アプリを改変しない。
既存コードの特定箇所が変更された場合はビルドを失敗させ、Render APIへの接続を誤って残さない。

## Cloudflare Pages（最終試験配置先）設定案

- プロジェクト新規作成時に GitHub の ToshinariTanaka/english-words-game を連携。
- **試験専用の本番ブランチ**として feature/static-junior-preview-20261008 を選択する（GitHub の main には反映しない）。
- ルートディレクトリ：/（リポジトリのルート）。
- フレームワーク：なし。
- Build command：node scripts/build-static-junior.js && node --test tests/static_junior_build.test.js
- Build output directory：dist-junior。
- デプロイ後の Pages URLで、iPhone・PCの4モード出題、正誤判定、復習、読み上げ、CSV/Excel読み込みを確認。
- _headers に基本的なセキュリティヘッダーを設定。

Cloudflare接続・作成作業はアカウント所有者が行う。GitHubだけの操作では Cloudflare アカウントにWebサイトを作成できない。

## 代替：Render無料 Static Site で一時検証

Cloudflareを接続する前でも、同じ feature ブランチから無料 Static Site を作って、同じ Build command と publish path dist-junior でブラウザ動作を確認できる。ただしこれはCloudflareへの移転完了を意味しない。

## 正式な教材移行前の未解決事項

1. english-words-game-junior のディスク上の current-questions.json、questions.xlsx、既存MP3のバックアップが必要。
2. 正式な4シートExcelを公開してよい教材か確認する。現行問題は build 時に収集・配信しない。
3. 自動教材更新が必要な場合、認証付きの教材管理・保存先を別途設計する。
4. 会員管理・認証・PC/iPhone間同期はこの試験版に含めない。必要なら静的配信だけで完結しない。
5. 履歴の扱い、学習数カウンターの引継ぎ方針を決める。
6. Chrome・iPhone Safariの音声はブラウザの音声環境に依存する。Web Speech APIはMP3音声と同一ではない。
7. 公開利用者に12歳を含める場合、公開先の利用規約・児童向けサービス要件を確認する。

## 判断基準

Renderの有料ジュニアWebサービスは、上記を満たす別配信先が安定稼働し、正本のデータを安全に退避・移行できて初めて停止候補となる。テスト段階で削除しない。
