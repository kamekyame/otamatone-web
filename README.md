# オタマトーン練習サイト

MusicXML の楽譜を表示し、マイクやライン入力でオタマトーンの音程を確認する Web アプリです。

## ローカル開発

[mise.toml](./mise.toml) の Node.js と pnpm を使います。

```sh
pnpm install --frozen-lockfile
pnpm dev
```

開発サーバーは既定で [http://localhost:5173](http://localhost:5173) です。

- `pnpm fmt`：整形
- `pnpm fmt:check`：整形チェック
- `pnpm typecheck`：型チェック
- `pnpm test`：単体テスト
- `pnpm build`：`dist/` に本番ビルド（依存ライセンスの通知 `THIRD_PARTY_NOTICES.md` も出力）
- `pnpm preview`：ビルド結果をローカルで確認

[MIT ライセンス](./LICENCE)（依存ライブラリには各自のライセンスが適用されます）
