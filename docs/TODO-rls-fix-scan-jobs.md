# TODO: scan_jobs UPDATE RLS ポリシー修正

## 問題

`supabase/migrations/20260207000000_create_scan_jobs.sql` (lines 51-55) の UPDATE ポリシーが `TO service_role` を指定していないため、任意の認証済みユーザーが他人の `scan_jobs` 行を更新可能。

```sql
-- 現状 (脆弱)
CREATE POLICY "Service role can update scan jobs"
  ON scan_jobs FOR UPDATE
  USING (true)
  WITH CHECK (true);
```

Supabase では `TO` 句がない場合、全ロール (`authenticated` 含む) に適用される。

## 影響

- 認証済みユーザーが他人のスキャンジョブの `status`、`error_message`、`result` を上書き可能
- DoS: 他人のジョブを `failed` に設定可能
- データ改ざん: `result` を差し替えて不正な単語データを注入可能

## 修正方針

新しいマイグレーションで既存ポリシーを DROP し、`TO service_role` 付きで再作成する。

## 修正用マイグレーション SQL

```sql
-- Drop the overly permissive UPDATE policy
DROP POLICY IF EXISTS "Service role can update scan jobs" ON scan_jobs;

-- Recreate with service_role restriction only
CREATE POLICY "Service role can update scan jobs"
  ON scan_jobs FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);
```

## 適用手順

1. 上記 SQL を `supabase/migrations/YYYYMMDDHHMMSS_fix_scan_jobs_update_rls.sql` として作成
2. `npm run lint && npm test` で既存テストが通ることを確認
3. Supabase ダッシュボードまたは CLI でマイグレーション適用
4. 適用後、認証済みユーザー (anon key) で scan_jobs UPDATE が拒否されることを確認

## 検証方法

Supabase SQL Editor で以下を実行:

```sql
-- anon/authenticated ユーザーとして (anon key 経由)
UPDATE scan_jobs SET status = 'failed' WHERE id = '<other-users-job-id>';
-- 期待結果: 0 rows affected (RLS によりブロック)
```
