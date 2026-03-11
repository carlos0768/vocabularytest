# 手動Pro有効化 オペレーションレポート（2026-03-09）

## 対象ユーザー
- **メール**: carlosking1208@gmail.com
- **user_id**: `c1d8b2aa-7cda-49a8-98ec-f71b9bfd4ad8`

## 事象
ユーザーのPro有効化依頼を受け、DBレコードを確認したところ以下の状態だった：

| カラム | 値 |
|--------|-----|
| status | `active` |
| plan | `pro` |
| pro_source | `test` |
| test_pro_expires_at | `2026-02-24 09:23:37` |
| current_period_end | `NULL` |

DBレコード上は `status='active'`, `plan='pro'` だが、`test_pro_expires_at` が2026-02-24で既に期限切れ。
アプリ上ではFree扱いになっていた。

## なぜDBの status/plan が期限切れでも更新されないのか

**これは設計上の意図的な挙動である。**

`src/lib/subscription/status.ts` で、アプリは毎回動的にPro判定を行う：

1. `status='active'` + `plan='pro'` + `pro_source='test'` の場合
2. `test_pro_expires_at` をチェック
3. 期限切れなら `getEffectiveSubscriptionStatus()` は `'cancelled'` を返す（66-68行目）
4. `isActiveProSubscription()` は `false` を返す（39-41行目）

DBレコードを `plan='free'` に戻さない理由：
- `wasProUser()` 関数（97-104行目）が `plan='pro'` かつ `isActiveProSubscription()=false` の状態を検出して「元Proユーザー」を識別する
- 元ProユーザーはSupabase上のデータを `ReadonlyRemoteRepository` で読み取り専用で参照可能
- DBの `plan` を `free` に戻すとこの判定ができなくなり、クラウドデータにアクセスできなくなる

### 判定フロー図

```
DB: status='active', plan='pro', pro_source='test'
                    │
    getEffectiveSubscriptionStatus()
                    │
        ┌───────────┴───────────┐
        │ test_pro_expires_at   │
        │ > now ?               │
        ├───── Yes ─────┐      │
        │  return 'active'     │
        ├───── No ──────┐      │
        │  return 'cancelled'  │
        └──────────────────────┘
                    │
        getRepository(status, wasPro)
                    │
        ┌───────────┴───────────┐
        │ status='cancelled'    │
        │ wasPro=true           │
        │ → ReadonlyRemote      │
        │   Repository          │
        └───────────────────────┘
```

## 実施した対応

以下のSQLを実行してPro状態を再有効化：

```sql
UPDATE subscriptions
SET status = 'active',
    plan = 'pro',
    pro_source = 'test',
    current_period_start = NOW(),
    test_pro_expires_at = NOW() + INTERVAL '1 year',
    updated_at = NOW()
WHERE user_id = 'c1d8b2aa-7cda-49a8-98ec-f71b9bfd4ad8';
```

- `test_pro_expires_at` を2027-03-09（1年後）に延長
- `current_period_start` を現在日時にリセット

## 今後の手動Pro有効化手順

1. `auth.users` テーブルからメールでユーザーを検索して `user_id` を取得
2. `subscriptions` テーブルの現在の状態を確認
3. 上記のUPDATE文を実行（`test_pro_expires_at` を適切な期間に設定）
4. ユーザーにアプリの再読み込みを依頼
