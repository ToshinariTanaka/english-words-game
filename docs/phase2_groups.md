# 第2弾・グループ管理

## 目的

会員を授業、学年、講座などの単位へまとめ、今後追加するテスト配信の対象として利用できる土台を提供します。会員は複数グループに所属できます。

## 権限

- 代表管理者: グループの閲覧・作成・編集・所属変更・アーカイブ
- 一般管理者: グループの閲覧・作成・編集・所属変更・アーカイブ
- 閲覧者: グループ管理不可

画面表示だけでなくAPI側でも毎回権限を検証します。状態変更APIは既存の管理者セッション、CSRF Cookie、`X-CSRF-Token`、Origin検証を使用します。

## データモデル

### groups

- `id`: 内部ID
- `name`: グループ名。アーカイブされていないグループ間で大文字小文字を無視して一意
- `description`: 500文字以内の説明
- `created_by`: 作成した管理者
- `created_at` / `updated_at` / `archived_at`

### group_members

- `group_id` / `member_id`: 複合主キー
- `added_by`: 所属させた管理者
- `created_at`

グループのアーカイブ時に所属行は削除せず、今後の配信・受験履歴と結び付けられるよう保持します。

## API

- `GET /api/admin/groups`: グループ一覧と所属会員数
- `POST /api/admin/groups`: グループ作成
- `PATCH /api/admin/groups/:id`: 名前・説明の編集
- `DELETE /api/admin/groups/:id`: グループのアーカイブ
- `GET /api/admin/groups/:id/members`: 所属会員の内部ID一覧
- `PUT /api/admin/groups/:id/members`: 所属会員一覧の差し替え

## 監査ログ

- `group.created`
- `group.updated`
- `group.members.replaced`
- `group.archived`

所属変更ログには追加・解除した会員IDと変更後の件数を記録します。秘密情報は既存の`cleanMetadata`で除外します。

## 検証

`npm test`で既存RPG／study-appと認証回帰を確認します。専用PostgreSQLを`TEST_DATABASE_URL`へ設定し、`npm run test:db-integration`で次を確認します。

- マイグレーションの初回適用と二重適用防止
- 大文字小文字を無視したグループ名重複拒否
- 会員所属の追加・解除・差し替え
- 存在しない会員の拒否
- グループ更新・アーカイブ
- 監査ログ
