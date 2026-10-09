# 中学生英単語アプリ・Cloudflare Access管理者サイト分離手順

## 目的
生徒用サイトは従来どおりログイン不要のまま公開する。
管理者のExcelアップロード画面を別のCloudflare Pagesサイトに置き、メール認証後は一定期間ログイン状態を維持する。64文字のJUNIOR_UPLOAD_TOKENを毎回入力しない。

## 既存環境を守るルール

- 公開中の塾生用サイト up-junior-words-preview.pages.dev は変更しない。
- 同じ非公開R2バケット up-junior-words-data を両サイトから利用する。
- Renderの授業報告書メニューは、管理者サイトへの認証・教材更新が成功してからリンク先を切り替える。
- 旧サイトの管理者アップロードAPIおよび JUNIOR_UPLOAD_TOKEN は、移行テストと復旧手順を確定するまで無効化・削除しない。
- 現段階でRenderのサービスやデータは停止・移動しない。

## 管理サイトを新規作成する

Cloudflare > Compute > Workers & Pages > Create application > Pages > Import an existing Git repository。

- GitHub repository: ToshinariTanaka/english-words-game
- 新サイト名の候補: up-junior-words-admin（取得可否はCloudflare画面で確定する）
- Production branch: feature/junior-admin-cloudflare-access-20261009
- Framework preset: None
- Root directory: 未指定（repository root）
- Build command: node scripts/build-junior-admin.js
- Build output directory: dist-junior-admin

同じGitHubリポジトリの別ブランチから構築するため、現在の生徒用サイト・Renderには影響しない。
初期状態ではCloudflare Accessの設定がないため、管理者サイトは認証設定不足の503応答とし、一切の教材操作を拒否する。公開画面に表示されても開放状態にしない。

## R2 Binding

新規Pages管理プロジェクトの Settings → Bindings → Add:
- Type: R2 bucket
- Variable name: JUNIOR_DATA
- Bucket: up-junior-words-data
- Environment: Production

R2をパブリックに設定しない。

## Cloudflare Zero Trust → Access

管理者用Pagesプロジェクトのホスト名に対し、Cloudflare AccessのSelf-hosted applicationを設定し、認証対象を塾長など許可する管理者の **特定のメールアドレスのみ**とする。
メールOTP（ワンタイムPIN）または適切なIdPで認証。Session durationは例として7日間。

重要：Cloudflare Pagesの「Enable access policy」は通常プレビューの保護設定であり、本番の *.pages.dev まで自動的に保護するわけではない。必ず新しいプロジェクトの実際の本番ホスト名（例: up-junior-words-admin.pages.dev）が保護されているか確認する。Cloudflare公式のPages「Known issues / Enable Access on your pages.dev domain」に、本番ホストとプレビューの保護手順がある。

また、新管理サイト内のfunctions/_middleware.jsが、すべてのURLでJWT署名・発行者・アプリAudience・期限・管理者メールの一致を検証する。Access側の設定漏れがあっても、認証なしのAPI書き込みを拒否するための二重チェックである。

## 管理者サイトに設定するVariables

新規Pages管理サイトの Production 環境に次の設定を登録する。

- CF_ACCESS_TEAM_DOMAIN: https://(自身のCloudflare Zero Trustチーム名).cloudflareaccess.com
- CF_ACCESS_AUD: 作成したSelf-hosted Access ApplicationのApplication Audience (AUD) Tag
- ADMIN_ALLOWED_EMAILS: 実際に許可する管理者メールアドレス（複数ならカンマ区切り）

管理者サイトでは JUNIOR_UPLOAD_TOKEN を使用しない。
これらの設定を登録・保存した後、Pagesを再デプロイして反映する。

## アップロード試験

1. 認証していないInPrivateブラウザから管理サイトを開き、Accessによるログインが必要になることを確認。
2. 許可メールへ届くコードでログインする。
3. 管理画面に64文字のキー入力欄が **存在しない** ことを確認。
4. 元のExcelで「A1・A2のみ」を選択して検査。英単語1652問、チャンク29問、文節和訳5問、英文和訳5問（計1691問）を確認。
5. 「共有教材として公開する」を押して、R2に保存できることを確認。
6. 別のInPrivateウィンドウから管理サイトを開き、認証なしでは画面とAPIを利用できないことを確認。
7. 生徒用サイトが引き続きログイン不要で動くことを確認。

## Renderメニューの切替（管理者サイト完成後）

授業報告書アプリの「教材・学習アプリ」内にある既存の「中学生英単語アプリ 教材アップロード」ボタンのリンク先を、管理者サイトの **実際に確認した正式URL** に切り替える。
プロジェクト名がまだ確定していない間は、仮のURLをハードコードしない。

## 旧公開サイト側の認証キー廃止（最終工程）

管理者サイトのAccess認証とR2アップロード・学習サイト配信が動作することを確認後、別PRで公開サイトから以下を削除する。
- 一般公開サイトの admin/junior-data/ 管理画面
- 公開サイト側の /api/admin/questions/stage/... と /api/admin/questions/publish の書き込みルート
- 管理者用シークレット JUNIOR_UPLOAD_TOKEN（新管理側には不要）

生徒用の /api/questions/current と /api/questions/status は維持する。
古い共有URLをブックマークしている場合は、新しい管理者サイトへ切り替える。
