# Codex Report: 第2弾 グループ管理（2026-07-19）

## 今回実装したこと

- `groups`と`group_members`を追加する前方マイグレーション。
- 代表管理者／一般管理者向けグループ管理API。
- グループ作成、編集、会員所属の差し替え、アーカイブ。
- グループ管理画面と管理者ダッシュボードの導線。
- グループ操作の監査ログ、権限／入力の単体テスト、PostgreSQL統合テスト。

## 続く第2弾

CSV／Excel会員一括登録・出力、テスト作成・配信・受験・採点・履歴・成績出力を、今回のグループを配信対象として利用する形で追加します。

---

# Codex Report: PostgreSQL・管理者／会員認証基盤（2026-07-17）

## 今回実装したこと

- PostgreSQL接続、チェックサム付きマイグレーション、状態確認CLI。
- 代表管理者／一般管理者／閲覧者と会員の個別認証。
- `UP000001` 形式の会員IDをPostgreSQL sequenceで自動発行。
- bcryptパスワード、AES-256-GCMによる初期・仮パスワード一時表示、DB保存型30日セッション。
- 10回連続失敗時の15分停止、管理者による解除、全端末ログアウト。
- 権限別管理API、本人用API、CSRF／Origin検証、JSONサイズ制限、監査ログ。
- 管理者／会員ログイン、ダッシュボード、会員管理、管理者管理、監査ログ、会員ホーム、パスワード変更の最小画面。
- DB未設定・接続不能時に認証機能だけ503とし、既存RPG／study-appを継続する縮退動作。
- 単体テスト、任意PostgreSQL統合テスト、Render／ローカル運用手順。

## 今回実装していないこと

グループ管理、CSV／Excel会員一括登録・出力、テスト作成・配信・受験・採点・履歴・成績出力、穴埋め、英文並べ替えは第2弾以降です。本番Render環境変数の設定、本番マイグレーション、本番アカウント作成は実施していません。

## 主な変更ファイル

- `server.js`、`package.json`、`package-lock.json`、`render.yaml`、`.env.example`、`.gitignore`
- `src/config.js`、`src/db/**`、`src/auth/**`、`src/http/json.js`
- `scripts/db-migrate.js`、`scripts/db-status.js`、`scripts/admin-create.js`、`scripts/admin-unlock.js`
- `admin/login/**`、`admin/dashboard/**`、`admin/members/**`、`admin/administrators/**`、`admin/audit-logs/**`
- `member/login/**`、`member/change-password/**`、`member/index.html`、`member/script.js`
- `auth-ui.css`、`auth-ui.js`
- `tests/auth_unit.test.js`、`tests/auth_no_db_server.test.js`、`tests/auth_db_integration.test.js`
- Python実行ファイル／UTF-8／CRLF差異を吸収する既存テストのクロスプラットフォーム修正。
- `README.md`、`docs/architecture.md`、`docs/project_status.md`、`docs/member_auth_operations.md`

## データベーステーブル

- `administrators`: ログインID、表示名、権限、bcryptハッシュ、利用／ロック状態、セッション世代、日時。
- `members`: 会員ID、氏名、bcryptハッシュ、暗号化初期・仮パスワード、利用／ロック状態、セッション世代、日時。
- `sessions`: アカウント種別／ID、HMAC化トークン、セッション世代、期限、失効、端末情報。
- `audit_logs`: 実行者、操作、対象、秘密値を除外したJSONメタデータ、日時。
- `schema_migrations`: マイグレーション名、SHA-256チェックサム、適用日時。
- `member_number_seq`: 会員ID用の再利用しない連番。

## 追加依存関係

- `pg`: Render PostgreSQLへの接続、Pool、パラメータ化クエリ、トランザクション。
- `bcryptjs`: ネイティブビルドを要求せずWindows／Renderで同じ動作をする、保守されたbcrypt実装。

`npm install` 後の監査結果は脆弱性0件でした。

## セキュリティ設計

- パスワードは最大128文字に制限し、SHA-256で固定長化してからbcrypt cost 12で保存。平文は保存しない。
- 初期・仮パスワードだけを環境鍵によるAES-256-GCMで別保存し、会員変更時に削除。
- セッショントークンは32ランダムバイト。Cookieだけへ平文を置き、DBはHMAC-SHA-256のみ。
- CookieはHttpOnly、SameSite=Lax、本番Secure、Path=/、30日。有効期限とサーバー失効を併用。
- 状態変更はCSRF Cookie＋ヘッダー＋セッション派生値＋Origin／Sec-Fetch-Siteで検証。
- すべてのDB入力はパラメータ化。APIは32KiB上限、128文字パスワード上限、一貫した日本語エラー。
- 利用停止、パスワード変更／再設定、権限変更、全端末ログアウトで `session_version` を増加。
- 監査メタデータからpassword／token／secret／cookieなどのキーを再帰除外。
- 最後の有効な代表管理者を停止または降格する更新をDBトランザクション内で拒否。

## マイグレーション・初回管理者

```bash
npm run db:status
npm run db:migrate
npm run admin:create -- --login-id tanaka --display-name "田中" --role owner
```

初回パスワードは `ADMIN_INITIAL_PASSWORD` 一時環境変数または標準入力で渡し、引数やログへ残しません。適用済みSQLを変更した場合はチェックサム不一致として停止します。自動破壊ロールバックはありません。

## テスト結果

- `npm test`: 成功。既存JavaScript／Pythonテスト20件と新規認証テスト11件が成功。
- `npm run test:auth`: 11件成功。bcrypt、AES-GCM改ざん検出、Cookie、CSRF、ロック、権限、秘密除外、DB未設定時の縮退動作を確認。
- `npm run test:db-integration`: `TEST_DATABASE_URL` 未設定のため1件スキップ。専用DB指定時はマイグレーション二重適用、同時会員ID発行、認証、30日セッション、ログアウト、パスワード変更、ロック解除を実行する構成。
- Node.js構文確認: 追加・変更JavaScriptで成功。

## 手動確認結果

ローカルブラウザ（DB未設定）で次を確認しました。

- `/admin/login/`: DB接続不能の日本語案内、ログインボタン無効化。
- `/member/login/`: 同じ接続不能案内、ログインボタン無効化。
- `/`: 既存「英単語RPG」が表示される。
- `/study-app/`: 既存「英語学習アプリ」が表示される。

本番またはローカルPostgreSQLがないため、代表管理者作成から会員の仮パスワード再設定までの実ブラウザ確認は未実施です。

## Renderで必要な作業

1. PostgreSQLを作成しInternal Database URLを `DATABASE_URL` へ設定。
2. 十分に長い `SESSION_SECRET` と32バイト `TEMP_PASSWORD_ENCRYPTION_KEY` をSecret設定。
3. `APP_TIMEZONE=Asia/Tokyo`、`NODE_ENV=production` を確認。
4. バックアップを確認後 `npm run db:migrate` と `npm run db:status` を実行。
5. 安全な一時環境変数／標準入力で初回代表管理者を作成。
6. 管理者→一般管理者→会員→会員パスワード変更→仮パスワード再設定→利用停止を実ブラウザ確認。

詳細は `docs/member_auth_operations.md` に記載しました。

## 後方互換性

既存公開URLと既存APIは変更していません。`server.js` は認証パスだけを先に振り分けます。`DATABASE_URL` が未設定・接続不能でもサーバーを停止せず、既存機能を利用できます。Python実行ファイルは従来どおり `python3` が既定で、必要な環境だけ `PYTHON` / `PYTHON_COMMAND` で上書きできます。

## 未確認・未解決事項

- 実PostgreSQLでの統合テストと同時採番負荷試験。
- Render本番マイグレーション、バックアップ／復旧、Cookie Secure、プロキシ越しOriginの実機確認。
- 本番ブラウザでの管理者／会員一連操作。
- 教室運用上のパスワード配布方法と、初期・仮パスワードの表示期限／自動削除期限。
- `TEMP_PASSWORD_ENCRYPTION_KEY` のローテーション手順は第1弾では単一鍵。ローテーションが必要なら鍵バージョン列を追加する。

## 次に実装すべきこと

第2弾でグループ、CSV／Excel会員一括登録・出力、テスト作成・配信・受験・採点・履歴・成績出力を追加します。先に本番相当PostgreSQLで統合テストと手動確認を完了し、監査ログの保持期間と運用担当者の権限分担を確定してください。

## 田中塾長へ確認が必要な点

- 会員の初期・仮パスワードを管理画面で確認できる期間を無期限ではなく、例として30日で自動削除するか。
- 一般管理者に会員の初期・仮パスワード確認を許可する現要件を継続するか。
- 監査ログの保持期間、Render DBバックアップ保持期間、退会会員のアーカイブ保持期間。
- 第2弾の会員属性（学年、学校、教室、グループ）と既存会員データ移行元。

---

# 過去のCodex Report

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
