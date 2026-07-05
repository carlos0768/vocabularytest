# AIコスト急増 Runbook

## 目的

公開後にOpenAI、Gemini、Cloud Run fallback、AI利用制限の不具合によってAPIコストが急増した時、運用者が初動で増加源を切り分け、一時停止や制限の判断材料を揃えるための手順です。

対象:

- スキャン抽出: `/api/extract`, `/api/scan-jobs/*`
- 例文生成: `/api/generate-examples`
- embeddings: `/api/embeddings/rebuild`, `src/lib/embeddings/`
- sentence quiz: `/api/sentence-quiz`, `/api/sentence-quiz/lite`
- Cloud Run fallback: Next.js -> Cloud Run -> Gemini、Gemini失敗時のOpenAI fallback
- AIコスト記録: `api_cost_events`

## まず見る場所

- `/ops/api-costs`
  - `ADMIN_SECRET` を入力して対象日数を指定する
  - 日次コスト、モデル別、直近イベントを見る
- `/api/ops/api-costs`
  - `x-admin-secret` headerが必要
  - `api_cost_events` migration未適用時は503を返す
- Vercel Runtime Logs
  - AI系API route
  - API cost recorder / dashboardのエラー
- Cloud Run Logs
  - `scanvocab-ai-gateway`
  - `/generate`
  - gateway cap / fallback / breaker / cap / auth失敗
- OpenAI / Gemini / Google Cloud billing
  - OpenAI usage / billing
  - Gemini / Vertex AI quota, billing
  - Google Cloud Billing、Cloud Run request / CPU / network
- Supabase `api_cost_events` 関連
  - `api_cost_events`
  - `feature_usage_daily`
  - `scan_jobs`
  - `daily_scan_usage`

## よくある症状

- OpenAIまたはGoogle Cloudの請求額が通常より急に増える。
- `/ops/api-costs` の日次コストまたはcallsが急増している。
- `cloud-run-openai` の行が急増し、Gemini fallbackが多発している。
- `status='failed'` のAI cost eventが増えている。
- sentence quizや例文生成の呼び出し数が短時間に増えている。
- `api_cost_events` が記録されず、provider側請求だけ増えている。
- `feature_usage_daily` が増えていないのにAI provider usageが増えている。
- Cloud Run Logsで `QUOTA_EXHAUSTED`、`BREAKER_OPEN`、`FALLBACK_RATE_HIGH` が続く。
- Cloud Run Logsで `gateway-cap-reached` が出る。

## 初動確認手順

1. 影響範囲を確認する。
   - OpenAIだけか、Gemini / Google Cloudも増えているか。
   - Web全体か、スキャン、例文、embeddings、sentence quizのどれか。
   - 直近1時間、24時間、7日で増え方を比較する。
2. `/ops/api-costs` で日次コスト、モデル別、直近イベントを確認する。
3. `/api/ops/api-costs` が401 / 503 / 500を返していないか確認する。
4. Supabase `api_cost_events` で直近のprovider、model、operation、status、tokens、estimated costを確認する。
5. Vercel Runtime LogsでAI routeのエラー、認証skip、rate limit、繰り返し実行のログを確認する。
6. Cloud Run利用中はCloud Run Logsでfallback理由とcap到達を確認する。
7. OpenAI / Gemini / Google Cloud billingで、アプリ内推定値と実請求のズレを確認する。
8. 一時停止や制限が必要な場合、feature flag / envで止められる経路を確認してからエスカレーションする。

## 探すべきログ文字列

Vercel:

- `[ApiCost] failed to insert api_cost_events row:`
- `[ApiCost] recorder unexpected error:`
- `[ApiCostDashboard] failed to load summary:`
- `api_cost_events table not found. Apply latest Supabase migrations first.`
- `Cloud Run provider error:`
- `Gemini API error:`
- `OpenAI API error:`
- `API制限に達しました`
- `Generate examples error:`
- `Sentence quiz API error:`
- `Dictation grade error:`

Cloud Run:

- `[generate]`
- `[generate] id=`
- `[gateway-cap-reached]`
- `[gemini-empty-content]`
- `[fallback] OpenAI fallback failed:`
- `[fallback-notify]`
- `QUOTA_EXHAUSTED`
- `BREAKER_OPEN`
- `FALLBACK_CAP_REACHED`
- `FALLBACK_RATE_HIGH`
- `AUTH_OR_PERMISSION`
- `Fallback disabled: cap reached`
- `OpenAI fallback failed`

Provider / billing:

- OpenAI rate limit / quota
- Gemini `RESOURCE_EXHAUSTED`
- Vertex AI quota / billing alerts
- Cloud Run request spike / instance spike

## 確認する環境変数

Vercel:

- `OPENAI_API_KEY`
- `GOOGLE_AI_API_KEY`
- `CLOUD_RUN_URL`
- `CLOUD_RUN_AUTH_TOKEN`
- `ADMIN_SECRET`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `API_COST_USD_TO_JPY`
- `REQUIRE_AUTH_TRANSLATE`
- `REQUIRE_AUTH_GENERATE_EXAMPLES`
- `REQUIRE_AUTH_DICTATION_GRADE`
- `ENABLE_AI_USAGE_LIMITS`
- `AI_LIMIT_TRANSLATE_FREE_DAILY`
- `AI_LIMIT_TRANSLATE_PRO_DAILY`
- `AI_LIMIT_EXAMPLES_FREE_DAILY`
- `AI_LIMIT_EXAMPLES_PRO_DAILY`
- `AI_LIMIT_DICTATION_FREE_DAILY`
- `AI_LIMIT_DICTATION_PRO_DAILY`
- `SENTENCE_QUIZ_MAX_CONCURRENCY`
- `SENTENCE_QUIZ_USE_LEGACY`

Cloud Run:

- `AUTH_TOKEN`
- `OPENAI_API_KEY`
- `GCP_PROJECT_ID`
- `GCP_LOCATION`
- `APP_ENV`
- `FALLBACK_OPENAI_MODEL`
- `FALLBACK_CALLS_DAILY_CAP`
- `FALLBACK_COST_DAILY_CAP_YEN`
- `FALLBACK_ESTIMATED_YEN_PER_CALL`
- `FALLBACK_BREAKER_OPEN_MS`
- `GATEWAY_CALLS_DAILY_CAP`
- `GATEWAY_COST_DAILY_CAP_YEN`
- `GATEWAY_ESTIMATED_YEN_PER_CALL`
- `FALLBACK_SLACK_WEBHOOK_URL`

確認観点:

- `CLOUD_RUN_URL` と `CLOUD_RUN_AUTH_TOKEN` が両方ある場合、AI provider呼び出しはCloud Run経由になる。
- `ADMIN_SECRET` が未設定または不一致だと `/ops/api-costs` で集計できない。
- `SUPABASE_SERVICE_ROLE_KEY` がないと `api_cost_events` への記録とdashboard集計ができない。
- `ENABLE_AI_USAGE_LIMITS=true` でも、対象routeが制限対象でない場合は別途切り分ける。
- `REQUIRE_AUTH_*` がfalseの場合、未認証呼び出しでコストが増える余地がある。
- `SENTENCE_QUIZ_USE_LEGACY=true` はsentence quizの緊急切戻しに使う。

## コスト増加源の切り分け

### scan extraction

- 関連API: `/api/extract`, `/api/scan-jobs`, `/api/scan-jobs/create`, `/api/scan-jobs/process`
- 関連docs: [`scan-failure-runbook.md`](scan-failure-runbook.md), [`scan-gemini-cloudrun-runbook.md`](scan-gemini-cloudrun-runbook.md)
- 確認するもの:
  - `scan_jobs` の作成数、失敗数、同一ユーザーの連続実行
  - `daily_scan_usage` の増加
  - Cloud Run Logsのfallback理由
  - `api_cost_events.provider` が `gemini` / `cloud-run-gemini` / `cloud-run-openai` のどれか

### example generation

- 関連API: `/api/generate-examples`
- 一時制限候補:
  - `REQUIRE_AUTH_GENERATE_EXAMPLES=true`
  - `ENABLE_AI_USAGE_LIMITS=true`
  - `AI_LIMIT_EXAMPLES_FREE_DAILY`
  - `AI_LIMIT_EXAMPLES_PRO_DAILY`
- 確認するもの:
  - Vercel Logsの `Generate examples error:`
  - `feature_usage_daily.feature_key` の該当行
  - `api_cost_events` のOpenAI / Gemini呼び出し増加

### embeddings

- 関連API: `/api/embeddings/rebuild`
- 関連実装: `src/lib/embeddings/`
- 確認するもの:
  - `/api/embeddings/rebuild` へのアクセスが管理者操作か
  - `ADMIN_SECRET` による保護が通っているか
  - OpenAI embeddings usageがprovider側billingで増えていないか

### sentence quiz

- 関連API: `/api/sentence-quiz`, `/api/sentence-quiz/lite`
- 一時制限候補:
  - `SENTENCE_QUIZ_MAX_CONCURRENCY`
  - `SENTENCE_QUIZ_USE_LEGACY=true`
- 確認するもの:
  - Vercel Logsのsentence quiz失敗、retry、OpenAI error
  - OpenAI `gpt-4o` / `gpt-4o-mini` のusage
  - 同一ユーザーまたはbot的アクセスの連続呼び出し

### Cloud Run fallback

- 関連docs: [`scan-gemini-cloudrun-runbook.md`](scan-gemini-cloudrun-runbook.md)
- 確認するもの:
  - `provider=cloud-run-openai` の増加
  - Cloud Run Logsの `QUOTA_EXHAUSTED`, `BREAKER_OPEN`, `FALLBACK_RATE_HIGH`
  - `FALLBACK_CALLS_DAILY_CAP`, `FALLBACK_COST_DAILY_CAP_YEN`
  - fallback Slack通知が出ているか
  - `gateway-cap-reached` が出ている場合、Cloud Run gateway全体の日次capに達している

## 実行してよい読み取りSQL例

直近のAIコストイベント:

```sql
select
  provider,
  model,
  operation,
  endpoint,
  status,
  total_tokens,
  estimated_cost_jpy,
  created_at
from api_cost_events
where created_at >= now() - interval '24 hours'
order by created_at desc
limit 100;
```

provider / model別の集計:

```sql
select
  provider,
  model,
  count(*) as calls,
  sum(coalesce(total_tokens, 0)) as total_tokens,
  sum(coalesce(estimated_cost_jpy, 0)) as estimated_cost_jpy
from api_cost_events
where created_at >= now() - interval '24 hours'
group by provider, model
order by estimated_cost_jpy desc;
```

失敗イベント:

```sql
select
  provider,
  model,
  operation,
  status,
  metadata,
  created_at
from api_cost_events
where status = 'failed'
  and created_at >= now() - interval '24 hours'
order by created_at desc
limit 50;
```

スキャン別の集計（1スキャン = `/api/extract` の1リクエスト、または `scan_jobs` の1ジョブ。`metadata->>'scan_id'` で紐づく）:

```sql
select
  metadata->>'scan_id' as scan_id,
  metadata->>'scan_source' as scan_source,
  max(user_id::text) as user_id,
  count(*) as calls,
  sum(coalesce(total_tokens, 0)) as total_tokens,
  sum(coalesce(estimated_cost_jpy, 0)) as estimated_cost_jpy,
  min(created_at) as started_at
from api_cost_events
where created_at >= now() - interval '24 hours'
  and metadata->>'scan_id' is not null
group by 1, 2
order by estimated_cost_jpy desc
limit 100;
```

`/ops/api-costs` の「スキャン別コスト」セクションでも同じ内容（件数・平均コスト・直近スキャン一覧）を確認できる。

feature usage:

```sql
select
  feature_key,
  usage_date,
  count(*) as users,
  sum(usage_count) as total_usage
from feature_usage_daily
where usage_date >= current_date - 7
group by feature_key, usage_date
order by usage_date desc, total_usage desc;
```

直近スキャン量:

```sql
select
  status,
  scan_mode,
  count(*) as jobs
from scan_jobs
where created_at >= now() - interval '24 hours'
group by status, scan_mode
order by jobs desc;
```

## 一時停止や制限に使えるfeature flag / envの確認

- 未認証AI利用を止める:
  - `REQUIRE_AUTH_TRANSLATE=true`
  - `REQUIRE_AUTH_GENERATE_EXAMPLES=true`
  - `REQUIRE_AUTH_DICTATION_GRADE=true`
- 対象AI機能の日次上限を有効化する:
  - `ENABLE_AI_USAGE_LIMITS=true`
  - `AI_LIMIT_TRANSLATE_*`
  - `AI_LIMIT_EXAMPLES_*`
  - `AI_LIMIT_DICTATION_*`
- sentence quizを切り戻す:
  - `SENTENCE_QUIZ_USE_LEGACY=true`
  - 必要なら `SENTENCE_QUIZ_MAX_CONCURRENCY` を下げる
- Cloud Run fallbackを抑える:
  - 最初に [`gcp-budget-guard-runbook.md`](gcp-budget-guard-runbook.md) で Firestore `ops/aiGatewayGuard.disabled=true` にする。
  - Cloud Run側 `FALLBACK_CALLS_DAILY_CAP`
  - Cloud Run側 `FALLBACK_COST_DAILY_CAP_YEN`
  - Cloud Run側 `GATEWAY_CALLS_DAILY_CAP`
  - Cloud Run側 `GATEWAY_COST_DAILY_CAP_YEN`
  - 緊急迂回は [`scan-gemini-cloudrun-runbook.md`](scan-gemini-cloudrun-runbook.md) のCloud Run迂回手順を確認してから行う

環境変数変更は本番挙動を変えるため、影響範囲と戻し方を確認してからエスカレーション後に実施します。

## ユーザーへ説明する時の文面例

一部AI機能を制限する場合:

> 現在、AI処理の利用量が通常より増えているため、一部の生成機能に一時的な制限をかけています。保存済みデータには影響がないか確認中です。復旧まで時間をおいて再度お試しください。

スキャンfallbackが増えている場合:

> 画像解析サービス側の応答状況により、一部スキャン処理が代替経路で実行されています。処理が遅くなる、または一時的に失敗する可能性があるため、状況を確認しています。

特定機能だけの場合:

> 対象機能のAI生成処理で利用量が増えているため、該当機能の呼び出し状況を確認しています。他の保存済みデータやログイン状態への影響は切り分け中です。

## エスカレーション条件

- provider側billingで想定外の急増が確認できる。
- `/ops/api-costs` とprovider側billingが大きく食い違う。
- `cloud-run-openai` が急増し、fallback capやbreaker通知が継続している。
- 未認証アクセスまたはbot的アクセスでAI routeが連続実行されている。
- `api_cost_events` が記録されておらず、実請求だけ増えている。
- production env変更、Cloud Run env変更、API key rotation、feature flag切替が必要。
- OpenAI / Gemini / Google Cloudのquota、billing、project設定に触る必要がある。

## 復旧後にdocsへ追記すべきこと

- 発生日時、影響範囲、対象provider、対象route。
- `/ops/api-costs`、provider billing、Cloud Run Logsの確認結果。
- 増加源がscan extraction、example generation、embeddings、sentence quiz、Cloud Run fallbackのどれだったか。
- 実施した一時制限、env変更、戻し手順。
- `api_cost_events` に不足していたmetadataや集計観点。
- このRunbookで不足していた確認手順。
