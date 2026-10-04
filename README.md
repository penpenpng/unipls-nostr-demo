# unipls-nostr-demo

`unipls@0.2.0`（npm）で browser lifecycle dropdetector を比較するシンプルな Web アプリです。

- A: 定期 heartbeat + `BrowserLifecycleDropDetector`
- B: 定期 heartbeat のみ
- 接続先: `wss://yabu.me`
- heartbeat: 10秒間隔で署名済み kind `20000` ephemeral event を送信し、その event ID に一致する `OK` を待機（timeout 5秒）
- A の lifecycle probe も同じ ephemeral event / `OK` を使用
- heartbeat / probe の送受信、接続成功、切断検出を発生ごとに1行表示
- drop ボタン: A/B の `Unipls.drop()` を呼び、両方とも同じ指数 backoff で再接続

Nostr の ephemeral event と `OK` 応答は [NIP-01](https://github.com/nostr-protocol/nips/blob/master/01.md) に基づきます。`OK` の accepted / rejected は両方とも疎通成功として扱い、拒否理由はログに表示します。鍵はページ読み込みごとに A/B 別に生成し、保存しません。

## 開発

```sh
pnpm install
pnpm dev
```

http://localhost:5173/unipls-nostr-demo/ を開いてください。

```sh
pnpm build
pnpm exec playwright install chromium
pnpm test
```

ブラウザテストは relay を模擬し、署名・10秒間隔・送受信ログ・A だけの lifecycle probe・応答がないときの切断理由・drop 後の再接続を確認します。

## 確認手順

1. A/B の接続成功と10秒ごとの heartbeat 送受信を確認。
2. 別タブに切り替えて戻り、A の lifecycle probe 送受信を確認。
3. drop ボタンを押し、A/B の切断検出と再接続を確認。
4. 実際の回線切断やブラウザ休止からの復帰でも切断理由を比較。

手動 drop は即座に切断を報告します。lifecycle probe 自体の検出動作は回線断などで応答が届かないときに確認できます。10秒間隔はブラウザが動作中の場合です。バックグラウンドでのタイマー制限や休止はブラウザの動作に従います。

## GitHub Pages

main に push すると GitHub Actions がテスト・ビルドを行い GitHub Pages にデプロイします。

https://penpenpng.github.io/unipls-nostr-demo/
