## 今回やったこと
- Render APIを共通問題データの正本として扱う方針に合わせ、RPG本体も起動時に `GET /api/questions/current` を優先取得するようにしました。
- RPG本体で共通問題データ取得に成功した場合は「共通問題データから○問を読み込みました」を表示し、取得失敗時のみ `data/default-words.csv`（さらに失敗時は内蔵サンプル）へフォールバックするようにしました。
- RPG本体のCSV/Excelアップロードを一時確認ではなく `POST /api/questions/upload` へ保存する処理に変更し、学習アプリ側からのアップロードと同じ共通問題データを更新するようにしました。
- サーバー側で `GET /api/questions/current` / `GET /api/questions/status` のモード指定なしアクセスを「現在の共通問題データ」として解決し、従来の `?mode=word|chunk|definition` も維持しました。
- `/`、`/study-app/`、`/admin/wordbook-batch/` のようなディレクトリURLで、それぞれの `index.html` を自動解決するようにしました。
- README、設計メモ、プロジェクト状況、次タスクをRender統一方針に合わせて更新しました。

## 変更ファイル
- `server.js`
- `script.js`
- `index.html`
- `README.md`
- `docs/codex_report.md`
- `docs/project_status.md`
- `docs/architecture.md`
- `docs/next_tasks.md`

## テスト結果
- `npm test` : PASS
- ローカルNodeサーバーを一時起動し、`/`、`/study-app/`、`/admin/wordbook-batch/` がHTMLとして返ることを確認 : PASS
- ローカルNodeサーバーへ `POST /api/questions/upload` でCSVを保存し、`GET /api/questions/current` が同じ4問を返すことを確認 : PASS

## 注意点
- PCアップロード後にiPhoneで同じ問題セットが読まれるかは、同一Render URL・Persistent Diskありの本番環境での実機確認が必要です。ローカルではAPI保存・取得の一貫性まで確認済みです。
- RenderのPersistent Diskを `/var/data` にマウントする前提です。Diskなしの環境では再起動や再デプロイで保存データが失われる可能性があります。
- GitHub Pagesなど静的ホスティングではAPI保存ができないため、端末間共有を使う場合はRender版URLを利用してください。
- 学習アプリは従来どおりモード別 `?mode=...` を利用します。RPG本体はモード指定なしの現在データを読みます。サーバーは最新アップロードを `current` として保持します。

## 次にやるべきこと
- Render本番へデプロイし、PCでアップロードしたあと、iPhoneで `/` と `/study-app/` を開いて同じ問題セットが読まれることを実機確認する。
- 必要ならアップロードAPIに管理者トークンや認証を追加し、誰でも共通データを上書きできる状態を避ける。
- 共通問題データJSONのバックアップ・復元手順を決める。

## チャッピーに相談すべき点
- RPG本体が常に「最後にアップロードされたモード」を読む運用でよいか、またはRPG用データを `word` モード固定にするか。
- 共通問題データを全員で1セットに固定するか、クラス・教材・ユーザー単位で切り替える必要があるか。
