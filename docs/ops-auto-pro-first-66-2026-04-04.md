# オペレーション: 新規登録先着66名 自動永久テストPro（2026-04-04）

## 概要

2026-04-04 00:00 UTC 以降に `auth.users` に挿入されたユーザーのうち、**先着66名**に対して、サインアップ直後の同一トランザクション内で `subscriptions` を永久テストProに更新する。

- **マイグレーション**: [`supabase/migrations/20260404150000_auto_pro_first_66_users.sql`](../supabase/migrations/20260404150000_auto_pro_first_66_users.sql)（`handle_new_user()` を `CREATE OR REPLACE`）
- **ポリシー文書**: [`docs/subscription-policy.md`](subscription-policy.md) の「Launch campaign」節
- **アプリ判定**: `pro_source='test'` かつ `test_pro_expires_at IS NULL` は `src/lib/subscription/status.ts` の `isActiveProSubscription()` で有効Proとして扱われる（`grant_test_pro(p_permanent := true)` と同型）

## 挙動

1. トリガーは従来どおり `subscriptions` に `free/free` を INSERT し、`profiles` に行を INSERT（`ON CONFLICT DO NOTHING`）。
2. `NEW.created_at >= '2026-04-04T00:00:00+00:00'` のときのみキャンペーン分岐へ。
3. 次の条件をすべて満たす `subscriptions` 行を `auth.users` と JOIN して COUNT:
   - `u.created_at >= '2026-04-04T00:00:00+00:00'`
   - `s.plan = 'pro'`
   - `s.pro_source = 'test'`
   - `s.test_pro_expires_at IS NULL`
4. COUNT が 66 未満なら、今回の `NEW.id` の行を `active` / `pro` / `test` / `test_pro_expires_at NULL` 等に UPDATE。

**注意**: マイグレーション適用**前**に既に作成されたユーザーには遡及しない（`AFTER INSERT ON auth.users` のみ）。

## 付与済み人数の確認（SQL）

サービスロールまたは SQL エディタで実行:

```sql
SELECT COUNT(*) AS campaign_pro_users
FROM public.subscriptions s
INNER JOIN auth.users u ON u.id = s.user_id
WHERE u.created_at >= '2026-04-04T00:00:00+00:00'::timestamptz
  AND s.plan = 'pro'
  AND s.pro_source = 'test'
  AND s.test_pro_expires_at IS NULL;
```

66 に達すると、以降の新規ユーザーは `free/free` のまま。

## 手動での個別調整

- **別途テストProを付与**: 既存の `grant_test_pro` RPC（サービスロールのみ）。
- **キャンペーン対象者を free に戻す**: 該当 `user_id` に対し `revoke_test_pro`、または方針に沿った手動 UPDATE。`pro_source='billing'` のユーザーはトリガー側で上書きされない設計（新規は通常 `billing` ではない）。

## キャンペーン終了後にトリガーを「通常のみ」に戻す場合

新しいマイグレーションで `handle_new_user()` を、プロファイル作成まで含め **`20260403180000_create_profiles.sql` と同じ本文**に戻す（キャンペーン用の `IF` ブロックを削除）。既に付与された行はそのまま残る。

## 関連ファイル

| 種別 | パス |
|------|------|
| マイグレーション | `supabase/migrations/20260404150000_auto_pro_first_66_users.sql` |
| 直前の `handle_new_user` 定義（プロファイル付き） | `supabase/migrations/20260403180000_create_profiles.sql` |
| Pro 判定 | `src/lib/subscription/status.ts` |
