# Production Operations Handbook

MERKEN を公開したあと、運用者が何を見て、どう判断し、どこから触ってはいけないかをまとめた運用教科書です。

## まず覚えること

運用で見るべき情報は大きく 5 つです。

| 観点 | 何を見るか | 主な場所 |
|---|---|---|
| ユーザー体験 | ログイン、スキャン、クイズ、共有が動くか | `https://www.merken.jp`、Vercel Deployments、手動 smoke test |
| エラー | 500、401/403 急増、timeout、AI provider error | Vercel Runtime Logs、Cloud Run Logs、Supabase Logs |
| コスト | AI call、token、Cloud Run gateway/fallback、Vercel usage | `/ops/api-costs`、OpenAI/Gemini/GCP/Vercel Billing |
| データ | DB migration、RLS、scan_jobs、webhook_events、subscriptions | Supabase Dashboard / SQL Editor |
| 課金 | v1.0 では公開しない。将来公開時だけ Checkout / webhook / reconcile を見る | Stripe Dashboard、Supabase `subscriptions` / `webhook_events` |

運用の目的は「問題をゼロにする」ことではなく、**異常に早く気づき、影響を小さくし、戻せる状態を保つ**ことです。

## 毎日 5 分の確認

毎日 1 回、できれば利用が増える時間帯の前に確認します。

1. Vercel Deployments
   - Production が意図した commit か。
   - 直近 deployment が `READY` か。
   - Build logs に env / migration / route 失敗がないか。

2. Vercel Runtime Logs
   - 直近 1 時間または 24 時間で `error` を検索。
   - `Extract API error`, `Processing error`, `Auth failed`, `api_cost_events table not found` を見る。
   - 同じ error が繰り返されていれば P1 以上で扱う。

3. `/api/health`
   - `{"status":"ok"}` なら最低限 DB に到達できています。
   - `degraded` なら Supabase env または DB 接続を確認します。

4. `/ops/api-costs`
   - `ADMIN_SECRET` を入力して 7 日 / 30 日を見る。
   - 日次 cost、calls、failed calls、unpriced calls、モデル別コストを確認。
   - 前日比 2 倍以上、または failed が急増なら `ai-cost-spike-runbook.md` を読む。

5. Supabase
   - `scan_jobs` の stuck / failed が増えていないか。
   - `webhook_events.status='failed'` がないか。
   - `subscriptions` は v1.0 では異常な billing 反映がないかだけを見る。

6. Cloud Run / GCP
   - 5xx、429、fallback、breaker open が増えていないか。
   - Gemini quota、gateway cap、fallback OpenAI cost cap、GCP budget alert を見る。
   - Firestore `ops/aiGatewayGuard.disabled` が `false` か、`daily/<UTC_DATE>` の `calls` / `yen` が上限に近くないかを見る。

7. Stripe
   - v1.0 では課金導線を公開しないため、日次確認の必須項目ではありません。
   - 将来 `NEXT_PUBLIC_BILLING_ENABLED=true` にする時だけ、webhook failed delivery と checkout/subscription failure を毎日見る対象に戻します。

## 週 1 回の確認

1. `npm run verify` を main 最新で実行する。
2. `npm audit --omit=dev --audit-level=high` を確認する。
3. `npm audit --prefix cloud-run-scan --omit=dev --audit-level=high` を確認する。
4. Vercel / GCP / OpenAI / Gemini の請求見込みを確認する。GCP は月 5,000 円 budget の threshold alert と `merken-budget-guard` の実行ログも確認する。
5. Supabase migration が本番へ適用済みか確認する。
6. 課金公開前だけ Stripe live 設定と webhook を確認する。
7. docs と実装のズレを 1 つでも見つけたら、その場で docs に追記する。

## リリース手順

### 1. ローカル確認

```bash
git status --short --branch
git diff --check
npm run verify
npm test --prefix cloud-run-scan
npm run build --prefix cloud-run-scan
npm audit --prefix cloud-run-scan --omit=dev --audit-level=high
```

2026-06-13 時点では、`npm test` が通常 test 98 ファイルをすべて実行します。別途、固定リスト漏れテストを手動実行する必要はありません。

### 2. Preview 確認

Preview URL で最低限これを確認します。

- `/`
- `/login`
- `/signup`
- メール OTP 送信
- Google / Apple OAuth を使うなら callback
- 代表画像 1 枚の scan
- scan 後の project 作成
- quiz 開始
- `/shared` と `/share/[shareId]`
- `/api/health`
- `/ops/api-costs`
- v1.0 では `/pricing`、`/subscription`、`/correction`、`/parser` が公開導線にならないこと

### 3. Production 反映

Vercel Git deploy の場合:

- main へ merge / push する。
- Vercel Production deployment が `READY` になるまで待つ。
- `https://www.merken.jp` で smoke test を再実行する。
- 反映後 60 分は logs を見る。

Vercel promote を使う場合:

- Preview を検証する。
- Promote する。
- Production URL で smoke test を再実行する。

### 4. Post-deploy 監視

公開直後は次を確認します。

- 0-10 分: Vercel Runtime Logs の 500 / timeout
- 10-30 分: signup/login/scan の代表導線
- 30-60 分: `/ops/api-costs`、Cloud Run Logs
- 24 時間後: AI cost、scan failure、問い合わせ

## 障害時の基本手順

### 1. 影響を分類する

| 重大度 | 条件 | 初動 |
|---|---|---|
| P0 | サイト全体停止、ログイン不能、データ破壊、AI cost 暴走、課金公開後の課金事故 | すぐ rollback / 機能停止 / secret rotation を検討 |
| P1 | scan 失敗多数、特定主要機能の 500、課金公開後の Pro 反映失敗 | 影響 route を特定し、runbook に沿って復旧 |
| P2 | 一部 UI 崩れ、少数ユーザーの失敗、遅延 | ログと再現条件を集めて通常修正 |

### 2. 証拠を残す

最低限これをメモします。

- 発生時刻と timezone
- 本番 deployment URL / commit SHA
- route / page
- 影響ユーザー数の推定
- request id / `x-vercel-id` があれば記録
- Vercel / Cloud Run / Supabase の該当ログ
- 課金公開後だけ Stripe の該当ログ
- 直前の env 変更、migration、deploy

### 3. 戻すか、止めるか、直すかを決める

- deploy が原因なら Vercel rollback。
- AI cost が原因なら AI usage limit を下げる、該当機能を env で止める、Cloud Run gateway cap / fallback cap を下げる。
- GCP cost が原因なら [`gcp-budget-guard-runbook.md`](gcp-budget-guard-runbook.md) で `ops/aiGatewayGuard.disabled=true` にし、AI gateway を先に止める。
- Supabase migration が原因なら `supabase-incident-runbook.md` を読む。場当たり SQL を打たない。
- Stripe webhook が原因なら webhook 再送と `webhook_events` を確認する。DB 行を削除して再処理を誘発しない。ただし v1.0 無料公開中は Stripe を通常の初動対象にしない。

## 主要 Runbook への道案内

| 症状 | 最初に読む |
|---|---|
| スキャンが失敗する / 遅い | `docs/ops/scan-failure-runbook.md` |
| Gemini / Cloud Run 経由スキャンがおかしい | `docs/ops/scan-gemini-cloudrun-runbook.md` |
| 例文生成が失敗する | `docs/ops/scan-example-sentences-runbook.md` |
| AI コストが急増 | `docs/ops/ai-cost-spike-runbook.md` |
| GCP Budget guard が止めた / 手動で止めたい | `docs/ops/gcp-budget-guard-runbook.md` |
| GCP 請求 guardrail を確認する | `docs/ops/gcp-billing-safety-audit-2026-06-13.md` |
| ログイン / OTP / OAuth がおかしい | `docs/ops/login-auth-failure-runbook.md` |
| Supabase 接続 / migration / RLS が怪しい | `docs/ops/supabase-incident-runbook.md` |
| Nightly lexicon cron が動かない | `docs/ops/nightly-lexicon-cron-runbook.md` |
| env が怪しい | `docs/ops/production-env-checklist.md` |
| 課金公開後に Stripe 課金が反映されない | `docs/ops/billing-stripe-failure-runbook.md` |

## よく見る SQL

本番 SQL は読み取りから始めます。更新系は runbook と backup 方針を確認してから実行してください。

### Scan job の stuck / failed

```sql
select id, user_id, status, error_message, created_at, updated_at
from scan_jobs
where status in ('pending', 'processing', 'failed')
order by updated_at desc
limit 100;
```

### 直近の AI cost

```sql
select
  date_trunc('day', created_at) as day,
  provider,
  model,
  operation,
  status,
  count(*) as calls,
  sum(coalesce(total_tokens, 0)) as total_tokens,
  sum(coalesce(estimated_cost_jpy, 0)) as estimated_cost_jpy
from api_cost_events
where created_at >= now() - interval '7 days'
group by 1, 2, 3, 4, 5
order by day desc, estimated_cost_jpy desc;
```

### Feature usage の多いユーザー

```sql
select user_id, feature_key, usage_date, count
from feature_usage_daily
where usage_date >= current_date - interval '7 days'
order by count desc
limit 100;
```

### 課金公開後の webhook failure

```sql
select id, type, status, attempt_count, last_error, received_at, updated_at
from webhook_events
where status = 'failed'
order by updated_at desc
limit 50;
```

### 課金公開後の subscription 状態

```sql
select user_id, status, plan, pro_source, current_period_end, cancel_at_period_end, updated_at
from subscriptions
order by updated_at desc
limit 100;
```

## 見てはいけない、やってはいけないこと

- `SUPABASE_SERVICE_ROLE_KEY`、Stripe secret、OpenAI key、Cloud Run token、`ADMIN_SECRET` をチャット、issue、スクリーンショットへ貼らない。
- `NEXT_PUBLIC_` に secret を入れない。
- 本番 DB で `delete from webhook_events` をしない。
- `subscriptions` を手動更新する前に Stripe / App Store の実状態を確認しないまま変更しない。
- `git reset --hard` や main force push で戻さない。Vercel rollback か revert commit を使う。
- エラーが出た route の `console.error` を消して黙らせない。
- 原因不明のまま AI usage limit を上げない。

## 最初に入れたい監視

優先順はこの通りです。

1. Vercel Runtime Logs の daily check
2. `/ops/api-costs` の daily check
3. Cloud Run 5xx / 429 / gateway cap / fallback cap reached の通知
4. Sentry または同等の error tracking
5. Vercel Speed Insights
6. Vercel Web Analytics
7. Log Drains または外部ログ保存
8. 課金公開後だけ Stripe webhook failure の通知

Vercel Runtime Logs は短期確認には十分ですが、長期の傾向分析には Log Drains や外部監視が必要です。

## ユーザー向け一次返信テンプレート

### スキャン失敗

> ご報告ありがとうございます。現在、画像スキャン処理の失敗状況を確認しています。可能であれば、発生時刻、使った端末、画像が 1 枚か複数枚か、表示されたエラー文を教えてください。画像そのものは個人情報が含まれる可能性があるため、こちらから依頼するまでは送らないでください。

### 課金公開後の課金反映失敗

> ご不便をおかけしています。決済状態とアプリ側の Pro 反映状況を確認します。決済完了時刻、登録メールアドレス、表示されているプラン状態を教えてください。カード番号や決済の秘密情報は送らないでください。

### ログイン失敗

> ログインまわりを確認します。発生時刻、ログイン方法、表示されたエラー、メール OTP が届いたかどうかを教えてください。認証コードそのものは送らないでください。

## 参考リンク

- [Vercel Observability](https://vercel.com/docs/observability)
- [Vercel Runtime Logs](https://vercel.com/docs/logs/runtime)
- [Vercel Drains](https://vercel.com/docs/drains)
- [Promoting Deployments - Vercel](https://vercel.com/docs/deployments/promoting-a-deployment)
- [Instant Rollback - Vercel](https://vercel.com/docs/instant-rollback)
- [Next.js middleware-to-proxy](https://nextjs.org/docs/messages/middleware-to-proxy)
