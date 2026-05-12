# オペレーション: 新規登録先着66名 自動永久テストPro（2026-04-04、廃止済み）

## 概要

このキャンペーンは **2026-05-12 に廃止済み**。新規登録ユーザーは自動でPro化されず、`subscriptions` は `status='free'`, `plan='free'` のまま作成される。

過去の仕様では、2026-04-04 00:00 UTC 以降に `auth.users` に挿入されたユーザーのうち、**先着66名**に対して、サインアップ直後の同一トランザクション内で `subscriptions` を永久テストProに更新していた。

- **廃止マイグレーション**: [`supabase/migrations/20260512140000_retire_auto_pro_first_66_after_onboarding.sql`](../supabase/migrations/20260512140000_retire_auto_pro_first_66_after_onboarding.sql)
- **過去の開始マイグレーション**: [`supabase/migrations/20260404150000_auto_pro_first_66_users.sql`](../supabase/migrations/20260404150000_auto_pro_first_66_users.sql)（`handle_new_user()` を `CREATE OR REPLACE`）
- **ポリシー文書**: [`docs/subscription-policy.md`](subscription-policy.md) の「Retired launch campaign」節
- **アプリ判定**: `pro_source='test'` かつ `test_pro_expires_at IS NULL` は `src/lib/subscription/status.ts` の `isActiveProSubscription()` で有効Proとして扱われる（`grant_test_pro(p_permanent := true)` と同型）

## 現在の挙動

1. トリガーは `subscriptions` に `free/free` を INSERT する。
2. `profiles` に `onboarding_step='signed_up'` の行を INSERT / UPDATE する。
3. 自動Pro付与は実行しない。

## 過去の挙動

1. トリガーは従来どおり `subscriptions` に `free/free` を INSERT し、`profiles` に行を INSERT（`ON CONFLICT DO NOTHING`）。
2. `NEW.created_at >= '2026-04-04T00:00:00+00:00'` のときのみキャンペーン分岐へ。
3. 次の条件をすべて満たす `subscriptions` 行を COUNT:
   - `s.created_at >= '2026-04-04T00:00:00+00:00'`
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

廃止後は、この件数に関係なく以降の新規ユーザーは `free/free` のまま。

## 手動での個別調整

- **別途テストProを付与**: 既存の `grant_test_pro` RPC（サービスロールのみ）。
- **キャンペーン対象者を free に戻す**: 該当 `user_id` に対し `revoke_test_pro`、または方針に沿った手動 UPDATE。`pro_source='billing'` のユーザーはトリガー側で上書きされない設計（新規は通常 `billing` ではない）。

## 廃止後の注意

既に付与された `pro_source='test'`, `test_pro_expires_at IS NULL` の行はそのまま残る。個別に戻す場合は `revoke_test_pro` または方針に沿った手動 UPDATE を使う。

## 関連ファイル

| 種別 | パス |
|------|------|
| 廃止マイグレーション | `supabase/migrations/20260512140000_retire_auto_pro_first_66_after_onboarding.sql` |
| 開始マイグレーション | `supabase/migrations/20260404150000_auto_pro_first_66_users.sql` |
| 再有効化されていた直前の `handle_new_user` 定義 | `supabase/migrations/20260506120000_add_profile_onboarding_step.sql` |
| Pro 判定 | `src/lib/subscription/status.ts` |
