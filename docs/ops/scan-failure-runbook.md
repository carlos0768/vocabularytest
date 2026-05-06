# スキャン失敗 / 遅延 Runbook

## 目的

公開後に `/api/extract` または `/api/scan-jobs/*` のスキャンが失敗・遅延した時、運用者が初動で原因を切り分けるための手順です。

対象:

- 即時スキャン: `/api/extract`
- バックグラウンドスキャン: `/api/scan-jobs`, `/api/scan-jobs/create`, `/api/scan-jobs/process`
- AI経路: Next.js -> Cloud Run -> Gemini/OpenAI、または Next.js -> Gemini/OpenAI 直接呼び出し

詳細なCloud Run運用は [`scan-gemini-cloudrun-runbook.md`](scan-gemini-cloudrun-runbook.md)、例文生成だけの問題は [`scan-example-sentences-runbook.md`](scan-example-sentences-runbook.md) も確認してください。

## まず見る場所

- Vercel Runtime Logs
  - `/api/extract`
  - `/api/scan-jobs`
  - `/api/scan-jobs/create`
  - `/api/scan-jobs/process`
- Supabase Table / Logs
  - `scan_jobs`
  - `daily_scan_usage`
  - Storage bucket: `scan-images`
  - Auth logs（401が多い場合）
- Cloud Run / GCP Logs
  - `scanvocab-ai-gateway`
  - `/health`
  - `/generate`
- AI Provider側
  - Google AI / Vertex AI Gemini quota, rate limit, API key状態
  - OpenAI API key, rate limit, fallback状況

## よくある症状

- スキャン開始後に結果が返らない、または10分程度で失敗になる。
- `scan_jobs.status` が `pending` または `processing` のまま進まない。
- `scan_jobs.status='failed'` で `error_message` にAI、Storage、timeout系の文言が入る。
- `/api/extract` が 401 / 400 / 500 を返す。
- 画像アップロード後に `scan-images` からファイルを取得できない。
- 無料ユーザーだけスキャンできず、Proユーザーは通る。
- Cloud Run設定後だけ失敗する。

## 初動確認手順

1. 影響範囲を確認する。
   - 全ユーザーか、特定ユーザーか。
   - 即時スキャン `/api/extract` だけか、バックグラウンド `/api/scan-jobs/*` も失敗するか。
   - 全モードか、`all` / `eiken` / `circled` / `idioms` など特定モードだけか。
2. Vercel Runtime Logsで対象APIのエラー率とログ文字列を確認する。
3. `scan_jobs` で直近ジョブの `status`, `error_message`, `created_at`, `updated_at`, `scan_mode` を確認する。
4. `pending` が残っている場合、`[scan-jobs/create] Direct processing started` または `[scan-jobs] Direct processing started` が出ているか確認する。
5. `processing` が長い場合、`[scan-jobs/process] Processing started` 後に `Extraction finished` が出ているか確認する。
6. `Failed to download image` がある場合、Supabase Storage `scan-images` の対象パスが存在するか確認する。
7. Cloud Run利用中は `CLOUD_RUN_URL` と `CLOUD_RUN_AUTH_TOKEN` が両方設定されているか確認し、Cloud Run Logsで401 / 403 / 429 / 5xx / timeoutを確認する。
8. 利用制限系の可能性がある場合、`daily_scan_usage` とユーザーの `subscriptions` を確認する。

## 探すべきログ文字列

Vercel:

- `Extract API called:`
- `[extract] Extraction done`
- `Extract API error:`
- `Auth failed:`
- `Invalid file format - not image or PDF`
- `Unsupported image format: HEIC/HEIF detected`
- `Scan limit check error:`
- `[scan-jobs/create] Request received`
- `[scan-jobs/create] Missing bearer token`
- `[scan-jobs/create] Auth failed`
- `[scan-jobs/create] Direct processing started`
- `[scan-jobs/create] Direct processing failed`
- `[scan-jobs] Legacy request received`
- `[scan-jobs] Re-triggering pending job from GET`
- `[scan-jobs] Re-triggering pending jobs from list GET`
- `Failed to mark timed-out scan jobs as failed:`
- `[scan-jobs/process] Processing started`
- `[scan-jobs/process] Failed to claim job:`
- `[scan-jobs/process] Job already claimed or finished`
- `[scan-jobs/process] Job remained pending after claim attempt`
- `scan-jobs/process config:`
- `Failed to download image`
- `Extraction timed out or failed unexpectedly`
- `Processing batch:`
- `[scan-jobs/process] Extraction finished`
- `Processing error:`
- `Process route error:`
- `Cloud Run provider error:`
- `Gemini API error:`
- `OpenAI API error:`
- `[scan-usage] check_and_increment_scan_batch not found. Falling back to single RPC.`

Cloud Run:

- `/health` 失敗
- `/generate` 401 / 403
- 429 / `RESOURCE_EXHAUSTED`
- 502 / 503 / timeout
- fallback / breaker / cap到達の通知ログ

## 確認する環境変数

Vercel:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `CLOUD_RUN_URL`
- `CLOUD_RUN_AUTH_TOKEN`
- `GOOGLE_AI_API_KEY`
- `OPENAI_API_KEY`
- `MASTER_FIRST_SCAN_DISABLED_MODES`
- `SCAN_TIMING_SHEET_URL`
- `SCAN_TIMING_GCP_SHEET_URL`
- `SCAN_TIMING_GCP_SHEET_NAME`
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `VAPID_SUBJECT`
- `INTERNAL_WORKER_TOKEN`

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
- `FALLBACK_SLACK_WEBHOOK_URL`

補足:

- `CLOUD_RUN_URL` と `CLOUD_RUN_AUTH_TOKEN` が両方ある場合、抽出はCloud Run経由になります。
- Cloud Run経由ではNext.js側の直接Provider API keyは主経路ではありませんが、直接経路へ戻す場合に `GOOGLE_AI_API_KEY` / `OPENAI_API_KEY` が必要です。

## 確認するSupabaseテーブルまたはSQL例

直近のスキャン失敗:

```sql
select
  id,
  user_id,
  status,
  scan_mode,
  save_mode,
  target_project_id,
  error_message,
  created_at,
  updated_at
from scan_jobs
where created_at >= now() - interval '24 hours'
order by created_at desc
limit 50;
```

詰まっているジョブ:

```sql
select
  id,
  user_id,
  status,
  scan_mode,
  error_message,
  created_at,
  updated_at,
  (extract(epoch from (now() - created_at::timestamptz)))::int as elapsed_seconds
from scan_jobs
where status in ('pending', 'processing')
order by created_at desc
limit 20;
```

特定ユーザーのスキャン利用回数:

```sql
select
  user_id,
  scan_date,
  scan_count,
  created_at,
  updated_at
from daily_scan_usage
where user_id = '<USER_ID>'
order by scan_date desc
limit 14;
```

対象ユーザーのPro状態:

```sql
select
  user_id,
  status,
  plan,
  pro_source,
  current_period_end,
  test_pro_expires_at,
  updated_at
from subscriptions
where user_id = '<USER_ID>';
```

Storageパスの確認はSupabase Dashboardで `scan-images` bucketを開き、`scan_jobs.image_path` または `scan_jobs.image_paths` の値が存在するか確認します。

## 触ってはいけないこと

- `src/app/api/extract/`, `src/app/api/scan-jobs/`, `src/lib/ai/`, `src/lib/supabase/scan-usage.ts` の挙動を障害中に思いつきで変更しない。
- `after()` からHTTP self-fetchで `/api/scan-jobs/process` を呼ぶ古い方式へ戻さない。
- `vercel.json` の `scan-jobs` 系 `maxDuration: 300` を短くしない。
- 過去のSupabase migrationを編集しない。
- `scan_jobs` や `daily_scan_usage` を手動UPDATEしてユーザー影響を変える操作は、原因と影響範囲を確認してからエスカレーション後に行う。
- `SUPABASE_SERVICE_ROLE_KEY`, `CLOUD_RUN_AUTH_TOKEN`, AI API keyをログやユーザー説明に出さない。
- Cloud Run迂回のために `CLOUD_RUN_*` を外す場合は、直接経路のAI keyと影響範囲を確認せずに本番へ反映しない。

## ユーザーへ説明する時の文面例

全体障害の可能性がある場合:

> 現在、画像スキャン処理の一部で失敗または遅延が発生している可能性があります。保存済みの単語データには影響がないか確認中です。復旧まで時間をおいて再度スキャンをお試しください。

特定ジョブだけ失敗した場合:

> ご申告のスキャンは画像解析処理で失敗していました。画像形式、通信状態、解析サービス側の応答を確認しています。お手数ですが、同じ画像を再度アップロードして改善するか確認してください。

利用上限またはPro制限の可能性がある場合:

> アカウントのスキャン利用状況を確認しています。無料プランの利用上限またはPro限定モードの判定が影響している可能性があります。確認後、必要な対応をご案内します。

## エスカレーション条件

- 直近15分で複数ユーザーのスキャンが連続失敗している。
- `scan_jobs` に `pending` / `processing` が複数残り続け、Vercel Logsに処理開始ログがない。
- Cloud Runで401 / 403 / 429 / 5xxが継続している。
- `CLOUD_RUN_AUTH_TOKEN` やAI API keyの不整合が疑われる。
- `daily_scan_usage` または `subscriptions` の判定が実際のプランと矛盾している。
- Storage `scan-images` にアップロード済み画像が存在しない、または大量にdownload失敗している。
- 手動で `scan_jobs` をfailedへ変更する、Cloud Runを迂回する、環境変数を変更する必要がある。

## 復旧後にdocsへ追記すべきこと

- 障害発生日時、影響範囲、対象API、対象scan mode。
- 代表的なVercel / Cloud Runログ文字列。
- 確認したSupabase SQLと結果。
- 原因がCloud Run、AI provider、Supabase、Storage、利用制限、認証のどれだったか。
- 実施した復旧操作と、再発防止策。
- このRunbookで不足していた確認手順。
