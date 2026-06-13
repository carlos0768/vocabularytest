# Production Readiness Audit - 2026-06-13

MERKEN を不特定多数のユーザーへ公開する前の本番運用準備状況を、コード、設定、既存 docs、ローカル検証コマンド、Vercel Production env から確認した記録です。

## 結論

2026-06-13 時点の公開方針は **無料公開 v1.0** です。課金導線は `NEXT_PUBLIC_BILLING_ENABLED=false` で隠し、Stripe live 課金は今回の公開 scope から外します。

リポジトリ側の P0 は解消済みです。公開可否の最終判断は、現在の commit を Production に反映した後、`https://www.merken.jp` で本番 smoke test が通るかで決めます。

目安としては次の評価です。

| 項目 | 評価 | コメント |
|---|---:|---|
| Web 本体のビルド・テスト | 9/10 | `npm run verify` が公開前 gate。`npm test` は通常 test 98 ファイルをすべて実行する構成へ更新済み。 |
| API 認証・権限境界 | 8/10 | 主要 AI/管理 route は認証、admin secret、worker token、usage limit を持つ。 |
| 依存関係 | 9/10 | Web 本体と Cloud Run service の production dependency は high/critical 0。 |
| 本番 env 準備 | 8/10 | Vercel Production に無料公開 v1.0 の必須 env を追加済み。`NEXT_PUBLIC_APP_URL` は `https://www.merken.jp`。 |
| 監視・検知 | 6/10 | `/health`、API cost dashboard、各 runbook はある。Sentry / Analytics / Log Drains は公開後強化でよい。 |
| コスト・abuse 対策 | 7/10 | 認証必須化、日次 AI usage limit、API cost event がある。GCP 高額請求リスクは別フェーズで公式 docs と照合して監査する。 |
| 運用 docs | 8/10 | release criteria、operations handbook、runbook 入口を整備済み。 |
| CI/CD | 6/10 | ローカル gate は実用的。GitHub Actions の full verify 必須化は公開後改善。 |

総合評価: **本番 smoke 前 82/100**。

本番 smoke が通れば、初回一般公開 v1.0 は「ユーザーを増やし始められる状態」と判断します。ただし、GCP 高額請求リスクについてはユーザーの懸念が最大なので、公開条件達成後に公式ドキュメントを読み、Cloud Run / Gemini / fallback / budget / quota / alert を厳重に監査します。

## 実行した確認

| 確認 | 結果 |
|---|---|
| `git diff --check` | 成功 |
| `npm run verify` | 成功 |
| `npm audit --omit=dev --audit-level=high` | Web 本体は high/critical 0。moderate は既知残。 |
| `npm run security:all` | 成功。SQL guard 534 files、secrets guard 987 files、dependency high=0 / critical=0。 |
| `npm test` | 成功。通常 test 98 ファイル、538 tests pass。 |
| `npm run test:security` | 成功。SQL guard test 6 件、secrets guard test 7 件、route security test 8 件。 |
| `npm run build` | 成功。 |
| `npm test --prefix cloud-run-scan` | 成功。22 tests pass。 |
| `npm run build --prefix cloud-run-scan` | 成功。 |
| `npm audit --prefix cloud-run-scan --omit=dev --audit-level=high` | 成功。0 vulnerabilities。 |
| Vercel Production env | 無料公開 v1.0 の必須 env を追加済み。 |
| Vercel production alias | `merken.jp` と `www.merken.jp` が production deployment alias。`merken.jp` は `www.merken.jp` へ 307。 |

ビルド中に捕捉された既知の注意:

- `src/middleware.ts` convention が deprecated。Next.js 16 では `proxy.ts` への移行が案内されています。
- `/shared` の prerender で `Legacy API keys are disabled` が捕捉されます。ビルド自体は成功しますが、build-time の公開共有一覧取得が空になる可能性があります。runtime 表示を本番 smoke で確認します。

## 解消済み P0

### 1. Cloud Run service の依存脆弱性

`cloud-run-scan/package-lock.json` を更新し、production dependency audit は high / critical 0 になりました。

確認:

```bash
npm test --prefix cloud-run-scan
npm run build --prefix cloud-run-scan
npm audit --prefix cloud-run-scan --omit=dev --audit-level=high
```

### 2. 本番 env の不足

Vercel Production に無料公開 v1.0 の必須 env を追加しました。

追加・確認済み:

- `NEXT_PUBLIC_APP_URL=https://www.merken.jp`
- `NEXT_PUBLIC_BILLING_ENABLED=false`
- `REQUIRE_AUTH_TRANSLATE=true`
- `REQUIRE_AUTH_GENERATE_EXAMPLES=true`
- `REQUIRE_AUTH_DICTATION_GRADE=true`
- `ENABLE_AI_USAGE_LIMITS=true`
- `AI_LIMIT_TRANSLATE_FREE_DAILY`
- `AI_LIMIT_TRANSLATE_PRO_DAILY`
- `AI_LIMIT_EXAMPLES_FREE_DAILY`
- `AI_LIMIT_EXAMPLES_PRO_DAILY`
- `AI_LIMIT_DICTATION_FREE_DAILY`
- `AI_LIMIT_DICTATION_PRO_DAILY`
- `API_COST_USD_TO_JPY`
- `ADMIN_SECRET`
- `RESEND_API_KEY`

既存確認済み:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `CLOUD_RUN_URL`
- `CLOUD_RUN_AUTH_TOKEN`
- `INTERNAL_WORKER_TOKEN`

Stripe env は v1.0 では未設定でよいです。Production に test Stripe key を入れず、課金導線をコードと middleware で隠します。

### 3. `/api/generate-examples` の provider/env mismatch

`src/app/api/generate-examples/route.ts` を、スキャン後例文生成と同じ `generateExampleSentences` 経由へ寄せました。古い direct OpenAI key 判定に依存しません。

### 4. `npm test` の固定リスト漏れ

`package.json` の `test:web` を通常 test 98 ファイルすべてに更新しました。固定リスト漏れテストの追加手動実行は不要です。

### 5. 課金導線の v1.0 scope 外化

`src/lib/billing/feature.ts` を追加し、`NEXT_PUBLIC_BILLING_ENABLED !== 'true'` の時に課金導線を非公開にしました。

主な制御:

- `/pricing`, `/subscription`, `/correction`, `/parser` は middleware で `/` へ redirect。
- `/api/subscription/create` は billing disabled の時に 404。
- LP、features、settings、desktop account、limit modal、share、favorites、quiz の Pro CTA / subscription 遷移を非表示または無料公開向け挙動に変更。

## 残っている公開前 gate

### 1. 自動検証の再実行

最後のコード・docs 更新後に次を再実行し、成功済みです。

```bash
git diff --check
npm run verify
npm audit --omit=dev --audit-level=high
npm run security:secrets
npm test --prefix cloud-run-scan
npm run build --prefix cloud-run-scan
npm audit --prefix cloud-run-scan --omit=dev --audit-level=high
```

### 2. Production deploy

Production env は新しく追加したため、現在の code と env を反映した新しい Production deployment が必要です。main push または `vercel deploy --prod` で反映し、Vercel の deployment URL と commit SHA を記録します。

### 3. 本番 smoke

対象:

- `https://www.merken.jp`
- `https://merken.jp` は `https://www.merken.jp` へ redirect すること

必須確認:

- `/`
- `/signup`
- OTP
- `/login`
- 代表 scan
- scan 後の project / wordbook
- quiz 1 問
- `/shared`
- share URL
- `/api/health`
- `/ops/api-costs`
- `/pricing`, `/subscription`, `/correction`, `/parser` が公開導線にならないこと

## P1: 公開後に直したいもの

### 1. CI が Web の full verify を守っていない

`.github/workflows/security.yml` は security checks と security tests を実行しています。一方、Web 本体の `npm run verify`、`npm test`、`npm run build` が PR / main push の必須 GitHub Actions になっていることは確認できませんでした。

公開後に、少なくとも次を PR / main gate に入れます。

- `npm ci`
- `npm run verify`
- Vercel preview smoke test

### 2. `/shared` の build-time DB 依存

`src/app/shared/page.tsx` は build/prerender 時に service role key で public shared projects を取得します。build では失敗を catch して続行するため、deploy は成功しますが初期表示の問題に気づきにくいです。

公開後、共有一覧を重要機能にするなら build-time fetch をやめ、runtime 取得へ寄せます。

### 3. docs/env の不一致

`docs/ops/README.md` では Sentry は未使用と明記されています。一方、現在の `.env.example` には Sentry env が残っています。

公開後に、Sentry を使わないなら `.env.example` から Sentry 関連を削るか、導入するなら `src/instrumentation.ts` を no-op から実装へ戻します。

### 4. lint warning の蓄積

`lint:web` は通っていますが warning が残っています。即ブロッカーではありませんが、公開後に warning を増やさない方針にします。

## 良い点

- `npm run verify` が存在し、Web 本体の公開前 gate として実用的です。
- SQL injection guard、secrets guard、dependency audit が script 化されています。
- API route は Zod validation が多く、入力サイズ上限も複数箇所で設定されています。
- `/api/extract` は認証必須で server-side scan limit と Pro-only mode 判定を持っています。
- AI route に `ENABLE_AI_USAGE_LIMITS` と feature usage RPC があり、コスト爆発対策の土台があります。
- 管理系 route は `x-admin-secret`、worker route は `INTERNAL_WORKER_TOKEN` / service role fallback で守られています。
- `docs/ops/*` に障害 runbook が複数あります。
- v1.0 では課金導線を隠すため、Stripe live 未設定による課金事故を公開条件から外せます。

## リリース判断

### 公開してよい条件

- `docs/ops/release-acceptance-criteria.md` の 7 項目がすべて yes。
- 現在の commit が Production に反映済み。
- `https://www.merken.jp` で smoke test が通っている。
- ロールバック方法を運用者が実際に説明できる。

### まだ公開しない条件

- `npm run verify` が失敗。
- Web 本体または Cloud Run service の production dependency に high/critical がある。
- Production env が未確認。
- 代表 scan が production で通らない。
- 課金導線が表示されている、または billing disabled 時に subscription API が使える。
- AI usage limit が無効。

## 次フェーズ: GCP 高額請求リスク監査

リリース条件を満たした後、ユーザーの最大懸念である GCP 高額請求リスクを別フェーズで監査します。必ず Google Cloud の公式ドキュメントを読み、現在の Cloud Run / Gemini / fallback 実装と照合します。

監査対象:

- Cloud Run service の min/max instances、concurrency、timeout、CPU allocation
- Cloud Run の request / CPU / memory 課金モデル
- Gemini / Vertex AI / Google AI の quota と予算管理
- GCP Budget alert と通知先
- fallback OpenAI cap と breaker
- `CLOUD_RUN_AUTH_TOKEN` による未認証 abuse 防止
- `/api/extract`、`/api/generate-examples`、`/api/dictation/grade` の認証・usage limit
- `/ops/api-costs` と実請求の差分

この監査が終わるまでは、「GCP 高額請求について完全に安心」とは言いません。

## 参考にした外部一次情報

- [Vercel Observability](https://vercel.com/docs/observability)
- [Vercel Runtime Logs](https://vercel.com/docs/logs/runtime)
- [Vercel Drains](https://vercel.com/docs/drains)
- [Promoting Deployments - Vercel](https://vercel.com/docs/deployments/promoting-a-deployment)
- [Instant Rollback - Vercel](https://vercel.com/docs/instant-rollback)
- [Next.js middleware-to-proxy](https://nextjs.org/docs/messages/middleware-to-proxy)
