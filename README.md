<p align="center">
  <img src="public/icon-512.png" width="120" height="120" alt="MERKEN logo" />
</p>

<h1 align="center">MERKEN</h1>

<p align="center">
  <strong>手入力ゼロで単語帳を作成</strong><br />
  ノートやプリントを撮影するだけで、AIが英単語を抽出・翻訳・クイズ化
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Next.js-16-black?logo=next.js" alt="Next.js 16" />
  <img src="https://img.shields.io/badge/TypeScript-5-blue?logo=typescript" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Tailwind_CSS-4-38bdf8?logo=tailwindcss" alt="Tailwind CSS" />
  <img src="https://img.shields.io/badge/Supabase-PostgreSQL-3ecf8e?logo=supabase" alt="Supabase" />
  <img src="https://img.shields.io/badge/OpenAI-GPT--4o-412991?logo=openai" alt="OpenAI" />
</p>

---

## 概要

MERKENは、英語を学ぶ日本の学生向けに設計された単語学習PWAです。手書きノートやプリントを撮影すると、Gemini 2.5 Flash（Cloud Run経由）が英単語を自動抽出し、日本語訳とクイズ用の誤答選択肢を生成します。

### 主な機能

| 機能 | 説明 |
|------|------|
| **OCRスキャン** | ノートや教科書を撮影 → AIが単語と翻訳を抽出 |
| **4択クイズ** | 間隔反復法に基づくクイズ（誤答選択肢は自動生成） |
| **フラッシュカード** | スワイプ式カードレビュー（Pro） |
| **例文クイズ** | AI生成の例文 + ベクトル類似検索による出題（Pro） |
| **ディクテーション** | 音声を聞いて入力する練習（Pro） |
| **スマートスキャン** | 丸をつけた単語のみ、マーカー箇所、英検級フィルター、熟語抽出 |
| **バックグラウンド処理** | スキャン中も学習を続行可能（Pro） |
| **オフライン対応** | Service Worker + IndexedDBでオフラインでも利用可能 |
| **クロスデバイス同期** | Supabase経由でリアルタイム同期（Pro） |
| **共有・インポート** | リンクで単語帳を共有（Pro） |

## アーキテクチャ

```
src/
├── app/                    # Next.js 16 App Router
│   ├── api/
│   │   ├── extract/        # Gemini 2.5 Flash OCR + 翻訳
│   │   ├── sentence-quiz/  # 例文生成（pgvectorベクトル検索）
│   │   ├── scan-jobs/      # バックグラウンドスキャン管理
│   │   └── subscription/   # KOMOJU決済連携
│   ├── quiz/[projectId]/   # 4択クイズ（間隔反復）
│   ├── flashcard/          # スワイプ式カードレビュー
│   ├── dictation/          # ディクテーション練習
│   └── project/[id]/       # 単語帳詳細（学習・単語一覧・統計）
├── components/
│   ├── ui/                 # デザインシステム（AppShell, Icon, Button等）
│   ├── home/               # ダッシュボードウィジェット
│   ├── project/            # ProjectBookTile, ProjectCard
│   └── quiz/               # QuizOption
├── hooks/                  # カスタムReactフック（use-auth, use-projects等）
├── lib/
│   ├── ai/                 # AIプロンプト・レスポンス解析（Gemini/OpenAI）
│   ├── db/                 # リポジトリパターン（Local/Remote/Hybrid）
│   ├── supabase/           # Supabaseクライアント（ブラウザ + サーバー）
│   ├── komoju/             # KOMOJU決済クライアント
│   └── spaced-repetition/  # SM-2アルゴリズム実装
└── types/                  # TypeScript型定義
```

### データ層

**リポジトリパターン**でストレージを抽象化しています：

```
無料ユーザー  →  LocalWordRepository   （Dexie.js経由のIndexedDB）
Proユーザー   →  HybridWordRepository  （IndexedDB + Supabase同期）
```

どちらの実装も同じ `WordRepository` インターフェースを共有しているため、UI層はストレージの種類を意識しません。

### デザインシステム

- **基調色**: `#137fec`
- **フォント**: [Lexend](https://fonts.google.com/specimen/Lexend)（Google Fonts）
- **アイコン**: [Material Symbols Outlined](https://fonts.google.com/icons)（CDN経由）
- **レイアウト**: `AppShell`（デスクトップ: サイドバー / モバイル: ボトムナビ）
- **ボタン**: Duolingo風3Dエフェクト（`border-b-4` + `active:border-b-2`）

## 技術スタック

| レイヤー | 技術 |
|----------|------|
| フレームワーク | Next.js 16（App Router, Turbopack） |
| 言語 | TypeScript 5 |
| スタイリング | Tailwind CSS 4 |
| ローカルDB | Dexie.js（IndexedDBラッパー） |
| クラウドDB | Supabase（PostgreSQL + pgvector） |
| 認証 | Supabase Auth（メール/パスワード） |
| AI | Gemini 2.5 Flash（スキャン抽出） + OpenAI GPT系（クイズ生成・埋め込みなど） |
| 決済 | KOMOJU（PayPay、クレジットカード、コンビニ決済） |
| バリデーション | Zod |
| PWA | Service Worker + Web App Manifest |

## セットアップ

### 前提条件

- Node.js 20以上
- npm 10以上
- Supabaseプロジェクト（Pro機能用）
- OpenAI APIキー（クイズ生成/埋め込み用）
- Gemini APIキー（ローカル直接呼び出し時）または Cloud Run Scan Gateway

### インストール

```bash
git clone https://github.com/carlos0768/vocabularytest.git
cd vocabularytest
npm install
```

### 環境変数

`.env.example` を `.env.local` にコピーして設定：

```bash
cp .env.example .env.local
```

必要な環境変数：

```env
# OpenAI
OPENAI_API_KEY=sk-...

# Gemini direct call (optional when Cloud Run is configured)
GOOGLE_AI_API_KEY=...

# Cloud Run scan gateway (recommended for production)
CLOUD_RUN_URL=https://your-cloud-run-service-url
CLOUD_RUN_AUTH_TOKEN=your-cloud-run-shared-token

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
ADMIN_SECRET=your-admin-secret

# KOMOJU決済
KOMOJU_SECRET_KEY=your-secret
KOMOJU_WEBHOOK_SECRET=your-webhook-secret

# Apple IAP（iOS向け / Phase 2-3で使用）
APPLE_IAP_ISSUER_ID=99b16628-15e4-4668-972b-eeff55eeff55
APPLE_IAP_KEY_ID=ABCDEFGHIJ
APPLE_IAP_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
APPLE_IAP_BUNDLE_ID=com.example.app
APPLE_IAP_ENV=production
APPLE_IAP_APP_APPLE_ID=1234567890
IAP_PRO_PRODUCT_IDS=com.example.merken.pro.monthly

# アプリURL
NEXT_PUBLIC_APP_URL=http://localhost:3000

# APIコスト推定レート（任意）
API_COST_USD_TO_JPY=150

# AI認証/利用上限
REQUIRE_AUTH_TRANSLATE=true
REQUIRE_AUTH_GENERATE_EXAMPLES=true
REQUIRE_AUTH_DICTATION_GRADE=true
ENABLE_AI_USAGE_LIMITS=true
```

iOS側の将来用キー枠（Phase 2で利用）:
- `ios-native/MerkenIOS/Resources/Info.plist` に `IAP_PRO_PRODUCT_IDS`（CSV）を配置

### データベースセットアップ

Supabaseマイグレーションを実行：

```bash
npx supabase db push
```

### 開発

```bash
npm run dev      # 開発サーバー起動（localhost:3000）
npm run build    # 本番ビルド
npm run lint     # ESLint実行
```

## プラン比較

| | 無料 | Pro（月額500円） |
|---|---|---|
| スキャン | 無制限* | 無制限 |
| 単語数上限 | 200語 | 無制限 |
| ストレージ | ローカル（IndexedDB） | クラウド（Supabase） |
| クロスデバイス同期 | - | ○ |
| フラッシュカード | - | ○ |
| 例文クイズ | - | ○ |
| ディクテーション | - | ○ |
| スマートスキャン | - | ○ |
| バックグラウンドスキャン | - | ○ |
| 単語帳の共有 | - | ○ |

## デプロイ

**Vercel**にデプロイ。すべての環境変数を設定し、Supabaseマイグレーションを適用してください。

スキャン抽出のCloud Run運用手順: [`docs/ops/scan-gemini-cloudrun-runbook.md`](docs/ops/scan-gemini-cloudrun-runbook.md)

```bash
npm run build   # まずローカルでビルド成功を確認
```

APIコストダッシュボード（内部運用）:
- `GET /api/ops/api-costs?days=30` (`x-admin-secret` ヘッダー必須)
- UI: `/ops/api-costs`（ADMIN_SECRET入力後に表示）

KOMOJUのWebhook URLを本番ドメインに設定：
```
https://your-domain.com/api/subscription/webhook
```

App Store Server Notifications V2（Phase 3）:
- エンドポイント: `https://www.your-domain.com/api/subscription/appstore/notifications`
- App Store ConnectでまずSandbox通知を有効化して到達確認
- `TEST` 通知はDB更新せず監査ログのみ処理
- 重複通知は `webhook_events` の `appstore:{notificationUUID}` で冪等化

運用監視クエリ例（Supabase SQL）:
```sql
-- 失敗イベント
select id, type, status, attempt_count, last_error, updated_at
from webhook_events
where id like 'appstore:%'
  and status = 'failed'
order by updated_at desc
limit 100;

-- 直近24時間の失敗率
select
  count(*) filter (where status = 'failed') as failed_count,
  count(*) as total_count
from webhook_events
where id like 'appstore:%'
  and received_at >= now() - interval '24 hours';
```

## ライセンス

プライベートリポジトリ。All rights reserved.
