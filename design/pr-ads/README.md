# MERKEN PR 広告画像

MERKEN の SNS 向け PR 広告画像。Merken Solid デザインシステム（黒い太枠 +
ハードシャドウ、森グリーン `#15803d` アクセント、ノート紙 `#fffdf7` 背景、
Lexend / Noto Sans JP）に準拠。

## 成果物

| ファイル | サイズ | 用途 |
|---------|--------|------|
| `merken-pr-story-1080x1920.png` | 1080×1920（2x = 2160×3840 で書き出し） | Instagram / TikTok ストーリー、フルスクリーン広告 |
| `story-1080x1920.html` | — | 自己完結 HTML（フォント base64 埋め込み）。ブラウザで直接確認可 |

訴求メッセージ: **「写真を撮るだけで、単語帳が完成。」**

## 再生成

```bash
node design/pr-ads/generate.mjs
```

`generate.mjs` が行うこと:

1. Google Fonts から Lexend / Noto Sans JP を取得し、必要グリフだけをサブセット
   化して base64 で埋め込む（`story-1080x1920.html` は完全に自己完結）
2. ブランドアイコン (`public/icon-512.png`) と実アプリのスクショ
   (`public/lp/home.png`) を base64 で読み込む — コピーを持たず常に実アセットを参照
3. Chromium (Playwright) で `deviceScaleFactor: 2` の 1080×1920 として撮影し PNG 出力

## コピー・レイアウトの編集

広告コピーは `generate.mjs` 先頭の `COPY` オブジェクトが単一の情報源。
文言を変えて再実行すればフォントのサブセットも自動で追従する。
サイズ違い（正方形 1080×1080 / OGP 1200×630 など）が必要な場合は
`viewport` と `.stage` のレイアウトを調整して派生させる。
