# AI関連API ゲート一覧

調査日: 2026-05-03
ブランチ: `claude/check-api-rate-limits-9Zrlv`

ユーザごとのAPI使用量制限（ゲート）の有無と、各ルートの実利用状況をまとめたインベントリ。

## ゲートの種類

| 種別 | RPC | 対象テーブル | 用途 |
|---|---|---|---|
| 🔵 scan系 | `check_and_increment_scan` / `_batch` | `daily_scan_usage` | スキャン回数制限（Free 3/日、Pro 無制限） |
| 🟢 feature系 | `check_and_increment_feature_usage` | `feature_usage_daily` | 機能別使用量制限（feature単位で独立カウンタ） |
| 🔴 ゲート無し | — | — | 認証はあるが使用量カウンタなし |

## 🔵 scan系ゲート

| ルート | 用途 | 使用状況 |
|---|---|---|
| `/api/extract` | 画像から単語抽出（all/circled/eiken/idiom 全モード共通） | ✅ 現役（Web Free） |
| `/api/scan-jobs/create` | スキャンジョブ作成（複数枚バッチ消費） | ✅ 現役（Web Pro / iOS / Android） |

**Web の使い分け:**
- Free → `/api/extract`（同期処理、1枚ずつ）
- Pro → `/api/scan-jobs/create`（非同期処理、最大20枚バッチ）

## 🟢 feature系ゲート

| ルート | feature名 | 用途 | 使用状況 |
|---|---|---|---|
| `/api/translate` | `translate` | 翻訳 | ❌ デッド |
| `/api/share-import/preview` | `translate` | 共有インポート翻訳プレビュー | ❌ デッド（テストのみ） |
| `/api/generate-examples` | `generate_examples` | 例文生成 | ❌ デッド（HTTP経由は未使用、内部ライブラリ経由で動作） |
| `/api/passage-word-matches` | `passage_match` | 長文内の語彙マッチング | ✅ 現役（`RichTextBlock.tsx:173`） |
| `/api/dictation/grade` | `dictation_grade` | ディクテーション採点 | ❌ デッド |

**実際に動いているのは `passage_match` のみ。** 残り4つの feature ゲートは事実上空回り。

## 🔴 ゲート無し（その他のAI系）

| ルート | 用途 | 使用状況 |
|---|---|---|
| `/api/generate-quiz-distractors` | クイズ誤答選択肢生成 | ✅ 現役（`/scan/confirm`、`/quiz`、`/share-target`） |
| `/api/words/enrich-manual` | 手動追加単語の補完（発音・品詞・例文） | ✅ 現役（`/project/[id]` 手動追加モーダル） |
| `/api/regenerate-distractors` | 誤答再生成 | ❌ デッド（呼び出しコードはあるがUI未配線） |
| `/api/generate-word-insights` | 単語インサイト生成 | ❌ デッド（403で無効化済み） |
| `/api/sentence-quiz` | 例文クイズ生成 | ❌ デッド（UI未実装） |
| `/api/sentence-quiz/lite` | 例文クイズ生成（軽量版） | ❌ デッド（UI未実装） |
| `/api/quiz2/similar` | 類似語抽出（埋め込み） | ❌ デッド（`EMBEDDINGS_ENABLED=false`） |
| `/api/quiz2/similar/batch` | 類似語抽出バッチ | ❌ デッド（同上） |
| `/api/embeddings/sync` | 埋め込みベクトル同期生成 | ❌ デッド（実装未完成） |
| `/api/embeddings/rebuild` | 埋め込み再構築 | 🛠 管理者専用（`x-admin-secret` 必須） |
| `/api/search/semantic` | セマンティック検索 | ❌ デッド（`EMBEDDINGS_ENABLED=false` で全停止） |
| `/api/lexicon-enrichment/process` | 語彙エンリッチ処理 | ❌ デッド |
| `/api/word-lexicon-resolution/process` | 語彙解決処理 | 🛠 内部ワーカー専用（`words/create` から） |
| `/api/similar-cache/rebuild` | 類似キャッシュ再構築 | ❌ デッド |
| `/api/scan-jobs/process` | iOS用スキャンジョブ処理 | 🛠 内部ワーカー専用（`scan-jobs/create` から `after()`） |

### 凡例

- ✅ 現役：UIから到達可能で実際に呼び出される
- ❌ デッド：呼び出し元なし / UI未実装 / フラグで無効
- 🛠 内部/管理者専用：ユーザは直接叩けない（サーバ間通信のみ）

## 現役AI系の総まとめ（実質的にコストが発生する経路）

| ルート | ゲート | 制限 |
|---|---|---|
| `/api/extract` | 🔵 scan | Free 3/日、Pro 無制限 |
| `/api/scan-jobs/create` | 🔵 scan（batch） | 同上 |
| `/api/passage-word-matches` | 🟢 `passage_match` | Free 200/日、Pro 500/日 |
| `/api/generate-quiz-distractors` | 🔴 無し | 上流scanで間接抑制 |
| `/api/words/enrich-manual` | 🔴 無し | **手動追加のたびにGemini、ゲート追加候補** |

## 補足メモ

### `/api/extract` の例文・品詞生成について

`/api/extract` は内部で `generateExampleSentences()` を呼び、**例文と品詞タグを同期生成する**。
ただしこの内部呼び出しは feature ゲート `generate_examples` を経由しないため、feature ゲートとしては「死んでいる feature」になっている。
コスト的には scan ゲートで一括抑制されている。

### `/api/scan-jobs/process` の AI 処理

iOS 経由のスキャンジョブ処理では、サーバ内部で `generateQuizContentForWords()` を直接呼び（HTTPは経由せず）、distractors も含めて一括生成している。

### 対策候補（優先度順）

1. **`/api/words/enrich-manual` に feature ゲート追加** — 手動追加でユーザが連打できる経路で現状無防備
2. **デッドコードの削除** — `translate`, `generate-examples`, `dictation/grade`, `sentence-quiz` 系, `quiz2/similar` 系, `embeddings/*`, `lexicon-enrichment` など
3. **`EMBEDDINGS_ENABLED` を true に戻す前に**、`/api/search/semantic` にサーバ側 Pro チェック + feature ゲートを追加する

## 調査の根拠

- `git grep "check_and_increment_scan\|check_and_increment_feature_usage"` で全ゲート利用箇所を網羅
- `find src/app/api -name route.ts` で全AIルートを列挙
- 各ルートについて `fetch('/api/...')` の呼び出し元を grep で確認
- フィーチャーフラグ（`EMBEDDINGS_ENABLED` など）と認証要件（`INTERNAL_WORKER_TOKEN` など）を route.ts で確認
