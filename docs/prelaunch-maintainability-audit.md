# 公開前 保守性監査メモ

> 履歴監査スナップショット: この文書は2026-05-06のdocs同期前に見つかった状態を記録しています。下記のKOMOJU/Sentry/migration数/grammar route関連の指摘の一部は、現行docsと設定では修正済みです。最新状況は `docs/maintenance/TASKS.md` を確認してください。

作成日: 2026-05-06

## 結論

現状は「本番ビルドは通るが、公開後の変更・障害対応はかなり難しい」状態です。

アプリ本体にはテストや設計メモが一定量あり、完全に無秩序ではありません。一方で、検証コマンド、依存関係、ドキュメント、運用境界が揃っていません。公開後に小さな修正を入れるたびに「何を信じてよいか」を確認し直す必要があり、これが保守困難さの中心です。

現時点の体感評価:

- 実装の複雑さ: 高い
- 公開直前の危険度: 中から高
- すぐ公開不能な致命傷: なし。ただし依存関係と検証コマンドは公開前に直すべき
- 公開後にエージェントで改修し続ける難度: 高い。境界整理なしで機能追加を続けるのは危険

## 確認した事実

実行した主な確認:

- `npm run build`: 成功
- `npm test`: 成功。132 tests pass
- `npm run lint`: 失敗。58 errors / 149 warnings
- `npx tsc --noEmit`: 失敗
- `npm run security:all`: 失敗
- `npm run security:deps`: 失敗。high=3 / critical=2

規模:

- TypeScript/TSX: 約357ファイル、約65,433行
- API Route: 52本
- Supabase migrations: 76本
- docs配下のMarkdown: 41本
- tracked files: 866件

特に大きいファイル:

- `src/app/page.tsx`: 1,930行
- `src/app/api/scan-jobs/process/route.ts`: 1,589行
- `src/app/project/[id]/page.tsx`: 1,566行
- `src/app/quiz/[projectId]/page.tsx`: 1,227行
- `src/lib/ai/prompts.ts`: 926行

## 良い点

- `npm run build` は成功しており、現時点のWebアプリはNext.js本番ビルド可能。
- `npm test` は132件通っている。特にサブスクリプション、App Store通知、AI抽出、Lexicon、DB repositoryの重要部分にテストがある。
- `docs/architecture.md`、`docs/boundaries.md`、`docs/invariants.md`、`docs/runbooks.md` が存在し、設計意図の記録は始まっている。
- SQL injection guard は通っている。最低限のセキュリティゲートは存在する。
- 危険箇所を `docs/boundaries.md` にまとめようとしている点は有効。

## 問題点

### P0: 依存関係のlockfileが危険

ローカルの `node_modules` と `package-lock.json` が一致していません。

例:

| package | local node_modules | package-lock |
|---|---:|---:|
| next | 16.2.4 | 16.1.6 |
| uuid | 13.0.2 | 13.0.0 |
| protobufjs | 7.5.6 | 7.5.4 |
| fast-jwt | 6.2.4 | 6.1.0 |
| undici | 7.25.0 | 7.22.0 |

`npm audit --omit=dev` は `package-lock.json` を基準に critical 2件 / high 3件を報告しています。VercelやCIがlockfile通りにinstallすると、ローカルで成功したビルドと違う依存バージョンで動く可能性があります。

公開前に必ずやること:

1. lockfileを更新する
2. clean installで再現確認する
3. `npm run build`, `npm test`, `npm run security:deps` を通す

### P0: 検証コマンドが信頼できない

`npm run lint` が失敗します。Web本体だけでなく、`mobile/`、`cloud-run-scan/dist/`、動画素材配下までESLint対象に入っているためです。

加えて、Web本体側にも React hooks rules、`any`、未使用変数などのエラーがあります。

この状態だと「公開前にlintを通した」と言えません。最低限、次のように分離するべきです。

- `lint:web`
- `lint:cloud-run`
- `lint:mobile`
- `lint:all`

公開前ゲートはまず `lint:web` を確実に通すのが現実的です。

`npx tsc --noEmit` も失敗します。主な原因は `.next/dev/types` に残った古いroute型と、一部テストコードの型不一致です。`npm run build` は通るため本番ビルドとは別問題ですが、素のTypeScript検査コマンドとしては信頼できない状態です。

### P0: ドキュメントと実装が一致していない

確認できたズレ:

- READMEはKOMOJU決済中心だが、実装と `.env.example` はStripe中心。
- `docs/architecture.md` はStripeと書いているが、READMEや `CLAUDE.md` の一部はKOMOJUのまま。
- `.env.example` にSentry設定があるが、`src/instrumentation.ts` は「Sentry removed」のno-op。
- `vercel.json` に存在しない `src/app/api/grammar/route.ts` の設定が残っている。
- `docs/commands.md` のプロジェクトルートがWindowsパス `C:\Users\carlo\working\englishvo` のまま。
- docs内のmigration数が古い。実際は76本。
- `docs/commands.md` のテスト一覧が `package.json` の現在の `test` scriptと一致していない。

このズレは、障害対応時にかなり危険です。運用者がREADMEを信じてKOMOJUを確認するのに、実際の障害はStripe webhookだった、という事故が起きます。

### P0: セキュリティチェックが落ちている

`npm run security:all` は secrets guard で失敗します。

検出対象:

- `CLAUDE.md`
- `src/lib/api/internal-worker.ts`
- `src/lib/api/internal-worker.test.ts`

本物の漏洩ではなく、プレースホルダーやテスト用文字列の誤検知に見えます。ただし、公開前ゲートとしては失敗です。allowlist方針を決めるか、テスト用トークン表現を検出されない形に直す必要があります。

### P1: 重要処理が巨大ファイルに集中している

`src/app/api/scan-jobs/process/route.ts` は、認証、画像取得、AI抽出、Lexicon解決、例文生成、DB保存、push通知、計測ログまで1ファイルに集まっています。

この構造では、障害時に「どの段階が失敗したか」はログを追えば分かる可能性がありますが、修正時の影響範囲が大きいです。

同様に、`src/app/page.tsx` と `src/app/project/[id]/page.tsx` はUI、IndexedDB、Supabase、スキャン、キャッシュ、共有、モーダル制御が同居しています。公開後すぐに全面分割する必要はありませんが、今後の機能追加前に分割対象です。

### P1: テストの発見方式が固定リスト

`package.json` の `test` script はテストファイルの固定リストです。新しいテストを追加しても、scriptに手で追記しない限り実行されません。

実際、リポジトリ内には `src/app/api/shared-projects/public/route.test.ts` など、固定リストに入っていないテストが複数あります。これは「テストがあるのにCIで守られていない」状態を作ります。

### P1: リポジトリルートが混みすぎている

Web本体、iOS、Cloud Run、古い試作物、動画素材、AIエージェント設定が同じルートにあります。

トップレベルには以下が混在しています。

- `src/`: Web本体
- `cloud-run-scan/`: Cloud Runサービス
- `mobile/`
- `ios-native/`
- `stitch/`, `uisu/`, `vocabularytest/`, `vocabularytest-clone/`: legacy / experimental
- `.adal`, `.agent`, `.codex`, `.worktrees` など多数のAIエージェント関連ディレクトリ

`.gitignore` には多くのAIエージェントディレクトリが追加されていますが、ESLintやドキュメント上の境界はまだ十分ではありません。

## 公開前に最低限やること

### 1. lockfileと依存関係を直す

目標:

- `package-lock.json` と実際のinstall結果を一致させる
- `npm audit --omit=dev --audit-level=high` を通す
- Vercelでinstallされる依存バージョンをローカルと同じにする

成功条件:

- clean install後に `npm run build` が通る
- clean install後に `npm test` が通る
- `npm run security:deps` が通る

### 2. 公開前チェックコマンドを一本化する

現実的な公開前コマンド:

```bash
npm run build
npm test
npm run security:deps
npm run security:secrets
```

ただし、最終的には以下を目標にする:

```bash
npm run verify
```

中身:

- `lint:web`
- `test`
- `security:all`
- `build`

### 3. docsの入口を作る

`docs/README.md` を作り、次の分類に整理するべきです。

- はじめに読む
- アーキテクチャ
- 公開前チェック
- 運用Runbook
- セキュリティ
- 課金
- AI/Cloud Run
- DB/Supabase
- 古い資料・調査メモ

今のdocsは量はありますが、入口がないため、障害時にどれを読めばいいか分かりません。

### 4. README / CLAUDE / docsを実装に合わせる

公開前に最低限直すべき文書:

- `README.md`
- `CLAUDE.md`
- `docs/architecture.md`
- `docs/commands.md`
- `docs/runbooks.md`
- `.env.example`
- `vercel.json`

特に「KOMOJUなのかStripeなのか」「Sentryがあるのかないのか」「Cloud Runが必須なのか任意なのか」は明確にする必要があります。

### 5. 障害対応Runbookを日本語で作る

最低限、以下の5本が必要です。

- ログインできない
- スキャンが失敗する / 遅い
- Pro課金が反映されない
- Supabase接続障害 / DB migration事故
- AIコストが急増した

それぞれに必要なのは、思想ではなく手順です。

- どのダッシュボードを見るか
- どのログ文字列を探すか
- どのSQLを実行するか
- どこから先は触ってはいけないか
- ユーザーに何と説明するか

## 公開後に機能追加を続ける前にやること

### 1. 巨大ファイルを段階的に分割する

優先順:

1. `src/app/api/scan-jobs/process/route.ts`
2. `src/app/page.tsx`
3. `src/app/project/[id]/page.tsx`
4. `src/app/quiz/[projectId]/page.tsx`
5. `src/lib/ai/prompts.ts`

ただし、公開直前に大改修するのは危険です。まずはテストとドキュメントで囲い、公開後に小さく分割します。

### 2. テストを自動発見に変える

固定リストではなく、少なくとも `src/**/*.test.ts` を拾う形式にするべきです。

ただし、一気に変えると現在隠れている失敗テストが表に出る可能性があります。まずは「未実行テスト一覧」を出し、公開前に必要なものだけ追加します。

### 3. 監視を明確にする

`.env.example` にSentryが残っていますが、実装上はno-opです。Sentryを使うなら復活、使わないなら削除して、Vercel logs / Supabase logs / Cloud Run logs を一次監視にする、という方針を明文化する必要があります。

## 運用者が最低限勉強すべきこと

TypeScript全体を読めなくても、公開後に運用するなら以下は必要です。

### 必須

- VercelのDeploymentsとRuntime Logsの見方
- SupabaseのTable Editor、SQL Editor、Auth users、Logsの見方
- 環境変数の意味。特に `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_WEBHOOK_SECRET`, `CLOUD_RUN_AUTH_TOKEN`
- Stripe webhookの基本。イベントが来る、署名検証する、DBに反映する、という流れ
- `npm run build`, `npm test`, `npm run security:all` の意味
- DB migrationは「過去ファイルを編集せず、新しいmigrationを足す」というルール

### できれば

- HTTP status codeの基本。400, 401, 403, 404, 500
- RLSの基本。Supabaseで「ユーザーは自分のデータだけ見える」仕組み
- Webhookの冪等性。同じ通知が複数回来ても二重処理しない考え方
- AI APIの失敗パターン。timeout, rate limit, invalid JSON, empty response

### 今は不要

- Next.jsの内部最適化
- Reactの細かいレンダリング理論
- TypeScript型システム全体
- PostgreSQLチューニング全般

## 次の作業案

1. 依存関係とlockfileを修正して、clean install基準で検証を通す
2. ESLintの対象範囲を整理し、Web本体のlintを通す
3. `docs/README.md` を作り、ドキュメントの入口を固定する
4. README / CLAUDE / architecture / commands の古い記述を実装に合わせる
5. 日本語の運用Runbookを作る

この順番が妥当です。巨大ファイル分割は重要ですが、公開直前の最優先ではありません。まず「何を信じてデプロイするか」を固定する方が先です。
