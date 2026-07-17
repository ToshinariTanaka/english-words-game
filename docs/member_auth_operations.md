# 会員・管理者認証基盤 運用手順

## 1. 必要環境

- Node.js 20以降
- PostgreSQL 14以降（Render PostgreSQLを利用可能）
- 既存Excel機能を使う場合はPython 3と `tools/requirements.txt` の依存関係

アプリは `.env` を自動読込しません。ローカルではシェルの環境変数を設定するか、Node.jsの `--env-file=.env` を使って各スクリプトを起動してください。

## 2. 環境変数

| 変数 | 必須 | 用途 |
| --- | --- | --- |
| `DATABASE_URL` | 認証利用時 | PostgreSQL接続URL |
| `DATABASE_SSL` | 任意 | `require` / `disable`。本番は既定でTLSを使用 |
| `SESSION_SECRET` | 認証利用時 | 32文字以上のランダム値。セッショントークン／CSRFのHMAC鍵 |
| `TEMP_PASSWORD_ENCRYPTION_KEY` | 会員管理時 | 32バイトBase64（`base64:`接頭辞推奨）または64桁16進数 |
| `APP_TIMEZONE` | 任意 | 既定 `Asia/Tokyo` |
| `NODE_ENV` | 本番 | `production`。CookieへSecureを付与 |
| `PYTHON` / `PYTHON_COMMAND` | 任意 | `python3` 以外のPython実行ファイルを使う場合 |
| `TEST_DATABASE_URL` | 統合テスト時 | 本番とは別の、削除可能な専用テストDB |

秘密値の生成例（出力は安全なパスワード管理ツールへ保存し、Gitへ追加しないでください）:

```bash
node -e "const c=require('crypto'); console.log(c.randomBytes(48).toString('base64url'))"
node -e "const c=require('crypto'); console.log('base64:'+c.randomBytes(32).toString('base64'))"
```

`SESSION_SECRET` または `TEMP_PASSWORD_ENCRYPTION_KEY` を失うと既存セッションや初期・仮パスワード表示に影響します。値を変更するときは全端末ログアウトと仮パスワード再設定を計画してください。

## 3. ローカル導入

1. `npm ci` を実行する。
2. PostgreSQLに専用データベースと最小権限ユーザーを作る。
3. `.env.example` を参考に環境変数を設定する。
4. `npm run db:status` で接続を確認する。
5. `npm run db:migrate` を実行する。
6. `npm run db:status` ですべて「適用済み」になったことを確認する。
7. 初回代表管理者を作る。
8. `npm start` で起動する。

DB未設定でも `npm start` は成功します。その場合、認証APIは503、管理者・会員ログイン画面は接続不能案内となり、既存RPG／study-appは利用できます。

## 4. 初回代表管理者

パスワードをコマンド引数へ書かず、標準入力または一時環境変数で渡します。

```bash
read -s ADMIN_INITIAL_PASSWORD
export ADMIN_INITIAL_PASSWORD
npm run admin:create -- --login-id tanaka --display-name "田中" --role owner
unset ADMIN_INITIAL_PASSWORD
```

PowerShellでは、使用後に必ず環境変数を削除します。

```powershell
$env:ADMIN_INITIAL_PASSWORD = Read-Host "初期パスワード" -MaskInput
npm.cmd run admin:create -- --login-id tanaka --display-name "田中" --role owner
Remove-Item Env:ADMIN_INITIAL_PASSWORD
```

同じログインIDは拒否され、パスワードはログ・監査ログへ記録されません。

## 5. Render PostgreSQL

1. RenderでPostgreSQLを作成し、Web Serviceと同じリージョンを選ぶ。
2. Web Serviceの `DATABASE_URL` にInternal Database URLを設定する。
3. `SESSION_SECRET` と `TEMP_PASSWORD_ENCRYPTION_KEY` をSecretとして設定する。
4. `APP_TIMEZONE=Asia/Tokyo`、`NODE_ENV=production` を設定する。
5. デプロイ後、Render Shellまたは安全なOne-off Jobで `npm run db:migrate` を一度実行する。
6. `npm run db:status` で適用結果を確認する。
7. 安全な一時環境変数を使って `npm run admin:create -- ...` を実行する。
8. `/admin/login/` でログインし、一般管理者と会員を作成する。

本番接続情報がない状態で本番マイグレーションを実行しないでください。マイグレーションは前方適用のみで、データを自動削除するロールバックは用意していません。

## 6. パスワードとロックの運用

- 会員の初期・仮パスワードは、代表管理者／一般管理者が明示的に「確認」を押したときだけ復号します。表示操作は監査ログへ残ります。
- 会員本人がパスワードを変更すると表示用暗号文は削除され、以後は誰も確認できません。
- 忘れた場合は管理画面から新しい仮パスワードへ再設定します。既存セッションは失効します。
- 管理者パスワードは他の管理者にも表示されません。代表管理者が再設定します。
- 10回連続失敗で15分停止します。管理画面の「停止解除」を使えます。
- 唯一の代表管理者がロックされた場合、DBへ直接SQLを入力せず、Render Shellなどアクセス制限された環境で次を実行します。

```bash
npm run admin:unlock -- --login-id tanaka
```

このCLI操作も監査ログへ記録されます。利用停止された管理者はロック解除だけでは再開しません。

## 7. テスト

```bash
npm test
npm run test:auth
TEST_DATABASE_URL=postgresql://... npm run test:db-integration
```

`npm test` と `test:auth` はPostgreSQLなしで実行できます。`test:db-integration` は指定DBの認証テーブルをTRUNCATEするため、本番DBや共有開発DBを絶対に指定しないでください。

## 8. バックアップ・復旧

- 本番マイグレーション前にRenderのバックアップ／PITR方針と最新スナップショットを確認する。
- DBバックアップと同時に `SESSION_SECRET`、`TEMP_PASSWORD_ENCRYPTION_KEY` を別の秘密管理領域へ保管する。
- 復旧時はDBと暗号鍵の世代を合わせる。暗号鍵が合わない場合、認証用bcryptハッシュは利用できますが、初期・仮パスワード表示は復号できません。
- 復旧後は `npm run db:status`、代表管理者ログイン、会員ログイン、既存RPG／study-appを確認する。

## 9. 第2弾予定

グループ管理、CSV／Excel会員一括登録・出力、テスト作成・配信・受験・採点・履歴・成績出力を追加します。第1弾の会員IDと認証／監査基盤をそのまま利用し、未完成画面は現時点では追加していません。
