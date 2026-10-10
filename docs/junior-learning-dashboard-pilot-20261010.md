# 中学生英単語・学習管理：試験ブランチ実装報告

更新日：2026-10-10（日本時間）

## 開発対象と保存先

- リポジトリ：ToshinariTanaka/english-words-game
- 起点：PR #114、`feature/junior-student-auth-d1-20261009`、コミット `4418f7e930c558c785bd38294fab0773780c9a2f`
- 新しい試験ブランチ：`feature/junior-learning-dashboard-pilot-20261010`
- 管理者認証は `fix/junior-admin-public-jwks-fallback-20261009` の検証済み実装を取り込み。
- PR #114のマージ、本番ブランチ変更、R2教材への書き込み、Renderへのデプロイは行っていない。
- 公開済み1,691問の教材・既存の `study-app/script.js` / `index.html` / 教材ファイル / `server.js` は変更していない。

## 実装した機能

| 機能 | 内容 |
|---|---|
| 生徒管理 | 管理者サイトの `/students/` でID発行、任意表示名、仮パスワードの一度だけの表示、再発行、利用停止・再開。仮パスワードは2分または画面非表示で消去 |
| ダッシュボード | 全体・生徒別の解答数、正解数、正答率、推定学習時間、最終学習日時。日付範囲と生徒検索 |
| 詳細 | 日別履歴、苦手問題（最大100件、続きはCSV）、解答履歴50件ごとのページング。R2に接続できれば現在の問題文・正解も表示 |
| CSV | 全生徒の集計／全解答／生徒別履歴。UTF-8 BOM、日本時間、引用符と数式注入対策。履歴を1,000件ずつ取得して一つのファイルにする |
| 同期 | IndexedDBに1解答ずつ保存。通信復旧・画面復帰・定期・手動の再送、指数バックオフ。受信確認済みIDだけ端末から除去 |
| 重複と混入防止 | サーバーの生徒ID＋UUIDによる冪等性、大小文字違いUUIDの同一バッチ重複拒否、ログイン中のIDと送信元IDの一致検証 |
| 共用端末 | キューと画面内の復習履歴・学習回数を生徒別に分離。匿名の既存履歴は削除しない。ログアウト後も未送信記録は元の生徒に紐付けて保持 |
| 学習日時 | 再送時にも元の学習日で集計。旧記録は受信日時を使用。日付区切りは日本時間 |
| 認証 | Access JWTの署名・issuer・audience・期限・メール許可リストを検証。生徒CookieはHttpOnly/Secure/SameSite=Strict |
| 更新の原子性 | パスワード変更／再発行／停止とセッション失効をD1 batchで一括処理。ログイン失敗回数の加算はSQL内で実行 |
| バックアップ準備 | `scripts/junior-d1-backup.mjs` で認証済みWranglerからD1をSQLに読み取り専用エクスポート。出力はGit対象外 |

学習時間は「表示中の問題への解答時間、1問最大120秒」の推定値。集中していた時間を証明する値ではない。正誤・学習日時は端末からの自己申告であり、監督付き試験の不正防止は対象外。

## 実施したローカル検証

`npm ci`、`npm run test:junior`、`npm test` で再実行できる。Node.js 24を使用。

最終結果：学習管理関連44テストすべて成功（32＋10＋2）。既存の `npm test` も成功。生徒版・管理者版のFunctionsコンパイルも成功。

- 生徒認証、管理者JWT検証、R2既存処理、集計、画面操作、キュー、Cloudflare実行環境、ビルド後の経路分離を自動検証。
- ダミー70人の集計（実在生徒情報なし）、1,235解答のCSVを全件取得。
- 260件の未送信記録を2つのキュー接続から保存し、再接続後にも保持。
- 通信失敗→ページ終了→別生徒ログイン→元の生徒ログイン→再送を検証。
- 部分的な受信確認や認証不一致でも記録を削除しないことを確認。
- 日本時間の日付またぎ、旧記録の日時互換、履歴のページングを確認。
- 非表示時間の除外、表示区間の加算、IndexedDB保存エラーの画面表示を確認。
- 管理画面で生徒登録・詳細・再発行・停止・再開、HTML注入防止、秘密情報の画面消去を検証。
- 故障を注入し、パスワード再発行が途中失敗した場合に元の状態へロールバックすることを確認。
- SQLiteのダミーバックアップを復元し、アカウント・セッション・解答の件数とハッシュ、`integrity_check`、`foreign_key_check` を確認。
- Miniflare/workerdでPBKDF2 600,000回、生徒登録→ログイン→パスワード変更→D1記録→集計を実行。
- 生徒版・管理者版のPages Functionsをそれぞれコンパイル。生成後のWorkerでも経路分離を検証。
- 既存の音声・4モード・CSV/Excel・Renderサーバー・認証の回帰テストを実行。

ローカル試験は実際のCloudflareアカウントの設定確認やスマートフォン実機試験の代替ではない。

## Cloudflare側：2026-10-10 10:04（日本時間）の確認状況

エージェントのCloudflare Dashboardはログイン画面の認証エラーで操作できない。以下は利用者が自身のEdgeで操作し、共有した画面を照合した結果。エージェントによる直接操作・実機試験の完了を意味しない。利用可能な連携の検索でもCloudflare用は見つからなかった。

| 項目 | 画面から確認した状態 |
|---|---|
| 試験D1 | `up-junior-learning-pilot` を新規作成 |
| 試験スキーマ | `junior_students`、`junior_sessions`、`junior_attempts` の3テーブルと名前付き4インデックスをSQLで確認。学習日時列と学習日時インデックスを含む |
| 生徒Pages Preview | `JUNIOR_DB → up-junior-learning-pilot` の保存を確認 |
| 管理者Pages Preview | `JUNIOR_DB → up-junior-learning-pilot` の保存を確認 |
| 管理者Previewの環境変数 | `ADMIN_ALLOWED_EMAILS`、`CF_ACCESS_TEAM_DOMAIN`、`CF_ACCESS_AUD` を保存して再デプロイ。既存の許可管理者で管理画面と集計APIの読み込み成功を確認 |
| 管理者PreviewのAUD | Preview用AccessアプリのAUDを設定。再デプロイ後の署名・issuer・audience・許可メール検証を通過し、管理画面が表示された |
| 管理者Previewの保護範囲 | Preview accessが有効。対応するAccessアプリが `*.up-junior-words-admin.pages.dev` を対象としていることを確認 |
| Accessの許可ルール | `Allow Members - Cloudflare Pages` はAllow／Include Emails。既存1件のメールとアプリ側設定を照合。適用先はこのPreviewアプリ1件 |
| 管理者の試験版ビルド | Buildは `node scripts/build-junior-admin.js`／`dist-junior-admin`、Previewは全非本番ブランチが対象。設定反映後、コミット `1f21c55` のデプロイ `430d536e` が08:52に成功（Cloudflare公式botでも確認） |
| 管理画面の実表示 | 09:45の利用者画面で `/students/`、集計API取得後の成功メッセージ、更新時刻、生徒0人・解答0問を確認。試験D1の読み込みが成功。実データを使った登録・学習試験はまだ未実施 |
| 追加管理者2件 | 利用者の明示依頼により既存1件と合わせて計3件へ拡張中。Preview環境変数にカンマ区切りで入力（スクリーンショットでは末尾が省略）。Accessのポリシー編集後、10:04時点ではアプリ全体の最終Saveが残る画面。追加2件でのログインは未検証 |
| 生徒の試験版ビルド | 画面共有時点で試験コミットは `No deployment available`。Previewブランチ制御・ビルド設定・公開状態の確認が必要 |
| 既存環境 | 既存 `up-junior-learning` のデータ・スキーマ変更、本番ブランチ切替、R2教材更新、Render変更はこの手順では実施していない |

試験DBはConsoleへ最終スキーマをまとめて入力して初期化した。`occurred_at_ms` は既に存在するため、この同じDBへ `0002_attempt_study_time.sql` のALTER TABLEをそのまま再実行しない。Wranglerのマイグレーション履歴はこの手動手順では登録していない。今後CLI管理に移す場合は実スキーマと履歴を照合する。

認証の設定値、許可メールの実値、AUD、セッショントークンはこの報告へ記載しない。次の操作はAccessアプリ全体の保存を確定し、追加管理者設定を読み込むPreview再デプロイと追加メールでのログイン確認。この進捗更新は試験ブランチにのみコミットし、既存のPages Git連携からPreviewの再ビルドを開始する。本番へのマージはしない。その後、生徒PagesのPreviewブランチ制御・教材読み出し設定を確認する。オンラインのダミー登録、再送試験、CSV取得、実D1のバックアップ／復元はまだ未実施。

当初の引き継ぎ情報（Production側での確認・変更は別途必要）：

- D1 `up-junior-learning`：初期3テーブル・3インデックスを作成済みとの申告。
- 管理者Pages Productionの `JUNIOR_DB` Binding：保存済みとの申告。
- 生徒Pages Productionの `JUNIOR_DB` Binding：未確認。今回保存したのはPreviewのみ。

## 認証復旧後の試験導入手順

1. 現在の生徒・管理者PagesのProductionブランチ、Build設定、Preview Binding、Access保護対象を読み取り確認する。本番のブランチは変更しない。
2. 既存D1が空か・実データがあるかを読み取り確認する。ダミー試験には別D1 `up-junior-learning-pilot` を推奨。生徒／管理者の **Preview環境** の `JUNIOR_DB` を同じ試験D1へ結び付ける。本番・試験のDBを混同しない。
3. 生徒プロジェクト `up-junior-words-preview` の接続設定を完成させる。Production側への `up-junior-learning` Bindingを保存しても、本番コードの切替・再デプロイは承認まで行わない。
4. 新しい空の試験D1へ `0001_student_learning.sql` → `0002_attempt_study_time.sql` を順に適用する。上記チェックポイントの試験DBは同等スキーマを手動作成済みのため再適用しない。既存の `up-junior-learning` への追加マイグレーションは承認後に行う。
5. 両Pagesの試験デプロイに新ブランチを使用する。生徒Build commandは `node scripts/build-static-junior.js`、出力は `dist-junior`。管理者は `node scripts/build-junior-admin.js`、出力は `dist-junior-admin`。
6. 管理者PreviewにもAccessの環境変数と許可メール設定を継承し、**PreviewのURLもAccessの保護対象**に入れる。既存の認証制御を無効にして試験しない。
7. 匿名の管理URL/APIが拒否されること、生徒サイトがAccessログインを要求しないこと、教材数が1,691問のままであることを確認する。教材アップロード／公開ボタンは押さない。
8. PreviewだけでDUMMY生徒を作り、iPhone・iPad・Windowsの3端末から4モード学習、再送、管理画面、CSV、再発行、利用停止を確認する。
9. D1のTime Travel期間・bookmarkを実アカウントで確認し、SQLエクスポートを取得する。復元は別の試験DBへ行い、件数と整合性を確認する。既存DBへ戻す操作は承認なしに行わない。
10. 結果を報告し、本番DBマイグレーション・本番コード切替について塾長の承認を得る。

### 二つのビルドを混ぜないこと

`cloudflare/junior-site-role.js` はビルド時に生成される定数。生徒ビルドは `student`、管理者ビルドは `admin`。Git管理しない。ビルドとFunctionsコンパイルは同じ環境で続けて行う。管理者ではすべてのURLにJWT検証がかかり、設定不足なら503。生徒では管理APIに403を返す。

旧生徒サイトの教材トークン方式は既存動作との互換のため残している。管理者版ではAccess署名検証済みの本人情報を必須とし、旧トークンによる代替認証は認めない。

## バックアップ運用

認証が済んだ環境で、まず試験DBを指定する。

```sh
node scripts/junior-d1-backup.mjs up-junior-learning-pilot
```

本番の読み取り専用エクスポートは以下。

```sh
node scripts/junior-d1-backup.mjs up-junior-learning
```

SQLにはパスワードのハッシュとセッションハッシュが含まれる。教材R2や公開GitHubへ置かない。バックアップファイルは非公開の保管先を定めて保存し、CSVだけを復元用バックアップとみなさない。端末内の未送信キューはD1バックアップに含まれない。

Cloudflare公式資料：
- [Pages FunctionsのD1 Binding](https://developers.cloudflare.com/pages/functions/bindings/#d1-databases)
- [D1 Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/)
- [D1のimport/export](https://developers.cloudflare.com/d1/best-practices/import-export-data/)

## 本番前の残作業・運用上の限界

- 両PreviewのD1 Binding保存、試験スキーマ作成、管理者Previewの認証設定と再デプロイ、Windowsでの管理画面・空の集計読み込みは確認済み。追加管理者2件の保存・反映・ログイン確認、生徒Previewのデプロイ、ダミー生徒による一連の実機試験が残る。本番D1への追加マイグレーションは未実施。
- 実アカウントでのバックアップ取得・復元試験、WAF/IP単位の制限、CPU・D1容量・料金の確認が必要。
- IndexedDBの消去、端末紛失、プライベート閲覧モード終了などでは未送信記録を失う可能性がある。端末に保存できない場合は画面に明示する。
- 学習ページ自体を完全オフラインで読み込むPWA、端末をまたぐ生徒側の復習状態統合、課題配信、保護者公開は今回の対象外。
- 問題文は現在のR2教材から表示するため、将来教材を改訂したときの旧問題文スナップショットは未対応。
- Access公開鍵の補助スナップショットは30日制限。通常取得が失敗し続ける場合は再ビルドで更新が必要。
- 実名の扱い、退塾後の保管期間、バックアップ保管先を運用として確定する。
- mikan for Schoolは実機受入試験と並行運用で必須機能を満たすことを確認してから解約判断する。
