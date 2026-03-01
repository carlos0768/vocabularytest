# Subscription Policy

## Cancellation
- アプリ内の解約API (`/api/subscription/cancel`) は有効です。
- 既定の動作は「期間末解約」です。解約受付後も現在の `current_period_end` まではPro機能を利用できます。
- 解約対象は `pro_source='billing'` のみです（`test` 付与は対象外）。
- 実際の最終状態はKOMOJU webhook（`subscription.canceled|cancelled`）で確定します。

## Pro Source Rule
- `pro_source='billing'`: 実KOMOJU契約ID (`komoju_subscription_id` が `NULL` でなく `manual_%` ではない) のみ。`current_period_end` 経過で期限切れ。
- `pro_source='appstore'`: Apple IAP 経由の購入。`current_period_end` 経過で期限切れ（`billing` と同一ロジック）。
- `pro_source='test'`: テスト付与ユーザー（手動付与・期限付き付与）。`test_pro_expires_at` 経過で期限切れ。
- `pro_source='none'`: 非Proユーザー。常に `'cancelled'` として扱われる。

## Test Pro Grants
- 新規のテスト付与は `grant_test_pro` RPC 経由で実行し、既定で90日有効。
- 無期限付与は `p_permanent=true` を明示した場合のみ許可。

## Billing Activation Guarantee
- 初回課金反映は `webhook` と `reconcile` の二経路で保証します。
- 優先は `webhook`（`payment.captured` / `subscription.captured`）で反映し、未反映時は `/api/subscription/reconcile` が同じ `activateBillingFromSession` を実行して回復します。
- 反映時は必ず `subscriptions.pro_source='billing'` と `subscription_sessions.status='succeeded'` に更新します。

## Payment Failure State Transitions
- 失敗系イベント（`payment.failed`, `payment.cancelled|canceled`, `payment.expired`）を受信した場合、`subscription_sessions.status='failed'` に確定します。
- `reconcile` でも失敗ステータス（`failed`, `declined`, `expired`, `cancelled`, `canceled`, `rejected`）を検知したら `failed` を返し、待機状態を継続しません。
- `success` 画面は `reconcile.state='failed'` を受けた時点で「決済失敗」表示へ遷移し、`/subscription` への再試行導線を出します。
