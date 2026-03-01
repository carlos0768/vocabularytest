# DONE: scan_jobs UPDATE RLS ポリシー修正

## 対応概要

`scan_jobs` の UPDATE RLS を `service_role` のみに固定し、環境間のRLSドリフトを解消した。

- 追加 migration:
  - `supabase/migrations/20260302090000_fix_scan_jobs_update_rls_drift.sql`
- 実施内容:
  - `Service role can update scan jobs` を再作成して `TO service_role` を付与
  - ドリフト吸収のため `Users can update own scan jobs` も明示的に削除

## 適用した migration SQL

```sql
BEGIN;

ALTER TABLE public.scan_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role can update scan jobs" ON public.scan_jobs;
DROP POLICY IF EXISTS "Users can update own scan jobs" ON public.scan_jobs;

CREATE POLICY "Service role can update scan jobs"
  ON public.scan_jobs
  FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMIT;
```

## 運用メモ

- `scan_jobs` の UPDATE はサーバー側の `service_role` クライアント経由で行われる想定。
- クライアント（`authenticated`）からの `scan_jobs` 直接UPDATEはサポートしない。

## 検証SQL

```sql
SELECT schemaname, tablename, policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname='public' AND tablename='scan_jobs'
ORDER BY policyname;
```

期待:
- UPDATEポリシーは `Service role can update scan jobs` のみ
- `roles` に `service_role` のみが含まれる

```sql
SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema='public' AND table_name='scan_jobs'
ORDER BY grantee, privilege_type;
```

期待:
- `anon` / `authenticated` に不要な `UPDATE` 権限がない（またはRLSで実効不可）
