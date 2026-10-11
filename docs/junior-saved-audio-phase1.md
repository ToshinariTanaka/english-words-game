# Nova・Ash保存音声：第一段階

2026-10-11。基点は `release/junior-admin-learning-20261010` の `bf1261c9aef035528df02c8644965d3967e9f9a2`。

## 今回の実装

- Cloudflare生徒版の音声選択を **Nova（初期値）／Ash／ランダム** にする。
- ランダムは各問題の表示時にNova・Ashを等確率で選ぶ。同じ問題の再生ボタンを押し直しても声を変えない。連続して同じ声になることはある。問題を再出題した場合は再抽選する。
- 選択設定は同じ端末の生徒IDごとに保存する。未ログインは別の設定領域。端末をまたぐ設定同期は含めない。
- 元の `study-app/script.js` とHTMLは維持し、Cloudflare用ビルドで専用の再生モジュールを接続する。採点・解答記録の処理は既存のまま。
- iPhoneでも保存MP3の処理を先に呼ぶ。手動再生は `play()` より前に非同期処理を挟まない。
- 保存音声の準備中の手動操作は再タップを案内する。未公開なら端末音声を明示して使う。再生制限では再タップを案内し、ネットワーク障害では次のタップで端末音声を利用できる。
- 問題切替・声切替・ログインユーザー変更で再生と古い処理を無効にする。
- R2の読み取り専用APIを追加する。音声未設定時は404を返し、学習を継続できる。
- 全問の2声生成予定表と試作30問・60本の予定表を、API通信なしで作成できる。

第一段階には **有料生成、音量調整、R2へのアップロード、公開操作の実装・実行は含まれない**。予定表を作っただけの問題を「生成済み」と扱わない。

## 課金なしの準備

```sh
python tools/prepare_study_audio.py input.xlsx --output audio-preparation
```

必要なPython依存は既存の `tools/requirements.txt` と同じ。出力：

- `generation-plan.json`：全問題×Nova・Ash。すべて `status: planned`。
- `sample-plan.json`：英単語12問、チャンク6問、文節6問、英文6問×2声。
- `sample-review.csv`：試聴用の対象一覧。

今回の添付教材で、9,185問／18,370ジョブ、1声分146,074文字、試作60ジョブを確認。ファイル自体と予定表はリポジトリに含めない。

1回のストリーミング読み込みで処理する。欠落・不正キー・重複キー・不正レベルは処理を止めて報告する。行番号ではなく `question_key` で紐付ける。

発音指定を付ける場合：

```sh
python tools/prepare_study_audio.py input.xlsx --output audio-preparation --pronunciations pronunciation-overrides.json
```

指定ファイルは `{ "w005122": "Use the present-tense pronunciation /riːd/." }` のような問題キーと英文指示の対応表。問題の英語自体や日本語訳を読み上げ入力に付け足さない。live、minute、read、record等は発音確認候補として印を付ける。これは全ての発音曖昧語を検出する辞書ではない。

## 音声の識別

英文は前後の空白除去とUnicode NFCのみ正規化し、大小文字・句読点・内部空白を保持する。`text_sha256` をブラウザ側でも照合する。同じキーでも英文が変われば古い音声を使わない。

`asset_id` はモード、問題キー、英文ハッシュ、声、モデル、指示、音声処理版から作るSHA-256。英文・発音指定・声・処理条件が変われば別のオブジェクトになる。

```text
audio/junior/nova/word/w000001/<asset_id>.mp3
audio/junior/ash/word/w000001/<asset_id>.mp3
```

## 次段階のR2公開契約

R2バインディング名は `JUNIOR_AUDIO`。既存 `JUNIOR_DATA`、D1、教材公開設定に書き込まない。新規バケットは非公開とする。今回バインディングの追加は行わない。

`audio/junior/current.json`：

```json
{ "release_id": "<64桁の小文字16進数>" }
```

`audio/junior/releases/<release_id>/word.json`（他3モードも同様）：

```json
{
  "schema_version": 1,
  "kind": "published_audio",
  "mode": "word",
  "release_id": "<64桁の小文字16進数>",
  "entries": {
    "w000001": {
      "text_sha256": "<正規化した英文のSHA-256>",
      "voices": {
        "nova": {
          "asset_id": "<生成条件から作るSHA-256>",
          "file_sha256": "<最終MP3バイト列のSHA-256>",
          "bytes": 12345,
          "duration_ms": 1234,
          "status": "verified"
        }
      }
    }
  }
}
```

各MP3のR2 `customMetadata.sha256` に最終ファイルのハッシュを保存する。生成・デコード検査・容量・チェックサム照合が成功した音声だけを公開用manifestに入れる。全生成対象が9,185問であっても、公開manifestには現在の教材公開対象と英文が一致するものだけを収載し、出題範囲を勝手に広げない。

全ファイルと4モードのmanifestを先に保存・確認し、最後に `current.json` だけを切り替える。旧ファイル・旧manifestを保持する。読み取りAPIは `generation_plan` を拒否する。公開ツールと完全性チェックは次段階で実装する。

- `GET /api/audio/manifest?mode=word`：公開中の対応表。音声本文・秘密値・生徒情報を含まない。
- `GET /api/audio/file?mode=word&key=w000001&voice=nova&asset=<asset_id>`：公開表に一致する音声だけ取得。
- 同じURLへのHEAD、単一Range、ETagをサポート。任意のR2パスを受け付けない。

音声APIは現在の公開教材と同様に匿名閲覧可能。管理者サイトでは既存のAccess認証を経由する。会員限定教材へ変更する場合は、その教材と同じ認可を音声APIにも導入し、publicキャッシュ設定も見直す。

## 生成前に確定する事項

1. APIの利用可能モデル、Nova・Ashの提供、料金、利用上限を再確認する。
2. 仮モデルは `gpt-4o-mini-tts-2025-12-15`。2027-01-06の提供終了予定があるので、将来も使える前提で自動実行しない。
3. 有料生成処理には再開用台帳、成功した原音の永続化、再試行上限、予算管理を実装する。
4. 原音からMP3へ音量調整し、短い単語の過剰増幅と語頭・語尾の切れを検査する。
5. 試作60本の実費と実機の聞こえ方を確認し、合格分を全件に再利用する。
6. 原音・MP3・manifest・生成条件を別保管先にもバックアップする。

公式資料：
- https://developers.openai.com/api/docs/deprecations
- https://developers.openai.com/api/docs/models/gpt-4o-mini-tts
- https://developers.cloudflare.com/r2/api/workers/workers-api-reference/

## 検証範囲

```sh
npm run test:junior
python -m unittest discover -s tests -p test_prepare_study_audio.py
npm test
```

音声選択・固定されたランダム再生・英文不一致・取得失敗・古い非同期処理の中止・生徒別設定、ビルド後のiPhone分岐と採点、Cloudflare実行環境でのR2／Range配信をテストする。モックの成功はiPhone/iPad/Windowsでの実音声試験の完了を意味しない。
