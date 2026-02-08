# Subscription Policy

## Cancellation
- アプリ内の解約API (`/api/subscription/cancel`) は仕様として無効化します。
- APIは常に `403` と `CANCELLATION_DISABLED` を返し、KOMOJU起点の状態変化のみを受け付けます。

## Pro Source Rule
- `pro_source='billing'`: 実KOMOJU契約ID (`komoju_subscription_id` が `NULL` でなく `manual_%` ではない) のみ。
- `pro_source='test'`: テスト付与ユーザー（手動付与・期限付き付与）。
- `pro_source='none'`: 非Proユーザー。

## Test Pro Grants
- 新規のテスト付与は `grant_test_pro` RPC 経由で実行し、既定で90日有効。
- 無期限付与は `p_permanent=true` を明示した場合のみ許可。
