# Supabase接続障害 / migration事故 Runbook

## 目的

公開後にSupabase接続、RLS、Storage、migration適用差分が原因でアプリの読み書き、認証後データ取得、スキャン、課金反映が失敗した時、運用者が初動で原因を切り分けるための手順です。

対象:

- Supabase接続障害、環境変数不整合、RLS denied
- migration未適用、migration適用途中、schema drift
- Table / RPC / policy / trigger / Storage bucketの不整合
- DBを利用する主要API: 認証、課金、スキャン、AIコスト集計、同期

DB schemaを変更する対応が必要になった場合も、過去migrationは編集せず、必ず新しいmigrationで修正します。

## まず見る場所

- Supabase Dashboard
  - Project status
  - API settings
  - Authentication > Users
  - Storage
- Supabase Logs
  - API logs
  - Postgres logs
  - Auth logs
  - Edge / Cron関連ログがある場合は対象時間帯
- Table Editor
  - 対象ユーザー、対象ジョブ、対象subscriptionの行が存在するか
  - `created_at`, `updated_at`, `status`, `error_message` の時系列
- SQL Editor
  - 読み取り専用SELECTでschema、RLS、policy、直近行だけ確認する
  - 本番でDDL / DMLを実行しない
- Vercel Runtime Logs
  - 500 / 401 / 403
  - `relation does not exist`
  - `Could not find the table`
  - `permission denied`
  - `row-level security`
  - `Supabase environment variables not configured`

## よくある症状

- ログイン後にプロジェクト、単語、購読状態が読み込めない。
- `/api/health` は通るが、特定APIだけSupabase queryで500になる。
- `/api/ops/api-costs` が `api_cost_events table not found. Apply latest Supabase migrations first.` を返す。
- スキャンが `scan_jobs` 作成後に進まない、または `daily_scan_usage` のRPCで失敗する。
- Stripe支払い済みなのに `subscriptions` または `subscription_sessions` が更新されない。
- OTP送信や検証で `otp_requests` のINSERT / SELECTに失敗する。
- 特定ユーザーだけRLSで見えない、または全ユーザーでRLS deniedが出る。
- migration適用後から特定テーブル、RPC、policy、triggerの挙動が変わった。

## 初動確認手順

1. 影響範囲を確認する。
   - 全ユーザーか、特定ユーザーか。
   - 認証、課金、スキャン、AIコスト集計、同期のどこで止まっているか。
   - Vercel Productionだけか、Preview / localでも再現するか。
2. Vercel Runtime Logsで対象時間帯のエラー文字列を確認する。
3. Supabase DashboardでProject statusとAPI availabilityを確認する。
4. Supabase LogsでPostgres / API / Authのエラーを確認する。
5. Table Editorで対象テーブルの直近行と対象ユーザー行が存在するか確認する。
6. SQL Editorでは読み取り専用SQLだけを実行し、テーブル存在、RLS有効状態、policy、直近データを確認する。
7. migration事故が疑われる場合、`supabase/migrations/` の最新ファイル名と本番に適用済みのschema状態を照合する。
8. 原因が未確定のまま、本番テーブルのUPDATE、DELETE、DROP、ALTER、policy変更をしない。

## 確認するテーブル

- 認証 / 初期ユーザー状態
  - `otp_requests`
  - `profiles`
  - Supabase Authentication > Users
- 課金
  - `subscriptions`
  - `subscription_sessions`
  - `webhook_events`
- スキャン
  - `scan_jobs`
  - `daily_scan_usage`
  - Storage bucket: `scan-images`
- AIコスト / 利用制限
  - `api_cost_events`
  - `feature_usage_daily`
- ユーザーデータ / 共有
  - `projects`
  - `words`
  - `collections`
  - `collection_projects`
  - `project_members`
  - `project_likes`
- Lexicon / worker
  - `lexicon_entries`
  - `lexicon_enrichment_jobs`
  - `word_lexicon_resolution_jobs`
  - `monitoring_alert_log`

## migration事故時に触ってはいけないこと

- 過去のSupabase migrationファイルを編集しない。
- 本番SQL Editorで原因未確定の `ALTER TABLE`, `DROP`, `CREATE OR REPLACE FUNCTION`, `CREATE POLICY`, `DROP POLICY`, `UPDATE`, `DELETE` を実行しない。
- RLSを一時的に無効化しない。
- `SUPABASE_SERVICE_ROLE_KEY` をクライアント、ログ、スクリーンショット、ユーザー説明に出さない。
- `subscriptions`, `subscription_sessions`, `webhook_events`, `scan_jobs`, `daily_scan_usage` を手動更新して状態を合わせない。
- 失敗したmigrationを途中から手で継ぎ足して、repoのmigration履歴と本番schemaをさらにずらさない。
- Storage bucketやpolicyを原因確認前に公開設定へ変えない。

## 過去migrationファイルを編集しないルール

- `supabase/migrations/` にある既存ファイルは、適用済み履歴として扱う。
- 修正が必要な場合は `YYYYMMDDHHMMSS_description.sql` 形式で新しいmigrationを作る。
- 既存migrationのコメント修正、順序変更、ファイル名変更も行わない。
- `shared/types/index.ts` や `shared/db/mappers.ts` とschemaがずれている場合も、まず現在の本番schemaを読み取りで確認し、修正は新migrationと型更新で行う。

## RLS確認の観点

- ユーザー所有データは `auth.uid() = user_id` またはプロジェクト所有関係で制限されているか。
- service role専用テーブルに一般ユーザー向けpolicyが追加されていないか。
- `api_cost_events` はservice role full accessとユーザー自身のSELECTだけになっているか。
- `feature_usage_daily` はユーザー自身のSELECTとRPC経由の更新を前提にしているか。
- `scan_jobs` はユーザーの作成・閲覧とservice roleの更新が分かれているか。
- shared project関連のpolicy変更が `projects` / `words` / `project_members` / `profiles` の表示に影響していないか。
- `subscriptions` はクライアントから自由に更新できる状態に戻っていないか。

## 実行してよい読み取りSQL例

RLS有効状態:

```sql
select
  schemaname,
  tablename,
  rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in (
    'subscriptions',
    'projects',
    'words',
    'scan_jobs',
    'daily_scan_usage',
    'otp_requests',
    'subscription_sessions',
    'webhook_events',
    'api_cost_events',
    'feature_usage_daily',
    'profiles'
  )
order by tablename;
```

policy一覧:

```sql
select
  schemaname,
  tablename,
  policyname,
  roles,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename in (
    'subscriptions',
    'projects',
    'words',
    'scan_jobs',
    'daily_scan_usage',
    'subscription_sessions',
    'webhook_events',
    'api_cost_events',
    'feature_usage_daily'
  )
order by tablename, policyname;
```

直近のスキャン状態:

```sql
select
  id,
  user_id,
  status,
  scan_mode,
  error_message,
  created_at,
  updated_at
from scan_jobs
where created_at >= now() - interval '24 hours'
order by created_at desc
limit 50;
```

直近の課金状態:

```sql
select
  user_id,
  status,
  plan,
  pro_source,
  stripe_customer_id,
  stripe_subscription_id,
  current_period_end,
  updated_at
from subscriptions
order by updated_at desc
limit 50;
```

AIコスト記録テーブルの存在と直近行:

```sql
select
  provider,
  model,
  operation,
  status,
  total_tokens,
  estimated_cost_jpy,
  created_at
from api_cost_events
order by created_at desc
limit 50;
```

AI利用制限の直近行:

```sql
select
  user_id,
  feature_key,
  usage_date,
  usage_count,
  updated_at
from feature_usage_daily
order by updated_at desc
limit 50;
```

特定ユーザーの主要行:

```sql
select id, title, user_id, updated_at
from projects
where user_id = '<USER_ID>'
order by updated_at desc
limit 20;
```

## ユーザーへ説明する時の文面例

全体障害の可能性がある場合:

> 現在、データベース接続または権限設定の影響で、一部機能の読み込みや保存に失敗している可能性があります。保存済みデータへの影響範囲を確認中です。復旧まで時間をおいて再度お試しください。

特定ユーザーだけの可能性がある場合:

> 対象アカウントのデータ取得または権限判定で問題が起きていないか確認しています。現在、保存済みデータとアカウント状態を照合しています。確認が取れ次第、必要な対応をご案内します。

migration不整合が疑われる場合:

> 直近のデータベース構成変更とアプリ側の期待する構成に差分がないか確認しています。安全確認が完了するまで、データを直接変更する操作は行わず、影響範囲の確認を優先しています。

## エスカレーション条件

- 複数ユーザーでDB読み書きが継続して失敗している。
- `relation does not exist`, `permission denied`, `row-level security`, `schema cache` 系エラーが本番で続いている。
- migration適用の途中失敗、適用順序の不整合、手動SQL実行履歴が疑われる。
- `subscriptions`、課金webhook、OTP、スキャンjobなどユーザー状態を手動修復する必要がある。
- RLS policyを変更しないと復旧できない可能性がある。
- `SUPABASE_SERVICE_ROLE_KEY`、Supabase project URL、anon keyの不整合や漏洩が疑われる。
- 本番で新しいmigration適用、rollback相当の操作、Storage policy変更が必要。

## 復旧後にdocsへ追記すべきこと

- 発生日時、影響範囲、対象API、対象テーブル。
- Vercel / Supabase Logsの代表的なエラー文字列。
- 確認したSQLと結果。
- 原因がSupabase障害、env不整合、RLS、migration未適用、schema drift、Storage policyのどれだったか。
- 実施した復旧操作と、repoに残したmigrationまたはdocs更新。
- このRunbookで不足していた確認手順。
