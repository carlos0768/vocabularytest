# Account Management Flows

## Scope

This document defines the first self-service account management flows for the Web settings screen.

The implementation target is `src/app/settings/page.tsx`. Native iOS already routes App Store subscriptions to Apple's subscription management screen, and the current Stripe cancellation API is cookie-session based, so the Web settings screen is the safe first surface for the existing APIs.

## Existing APIs

### Cancel Stripe subscription

- Endpoint: `POST /api/subscription/cancel`
- Authentication: Supabase cookie session
- Eligible subscriptions: active Pro rows with `pro_source = billing`
- Behavior: sets Stripe `cancel_at_period_end = true`, updates `subscriptions.cancel_at_period_end`, and keeps Pro active through `current_period_end`
- Important response fields:
  - `success`
  - `message`
  - `currentPeriodEnd`

### Delete account

- Endpoint: `DELETE /api/account/delete`
- Authentication: Supabase cookie session or bearer token
- Behavior:
  - Deletes free/test/expired accounts directly through Supabase Admin `deleteUser`
  - Cancels active Stripe billing immediately before deleting the user
  - Blocks active Stripe billing if the Stripe subscription id is missing
  - Blocks active App Store subscriptions until Apple auto-renewal is disabled
- Important response fields:
  - `success`
  - `billingSubscriptionCancelled`
  - `code` for blocking conflicts

## Web Settings UX

### Account section

Authenticated users get an `アカウント` section below the upgrade banner and before display settings.

Rows:

- `現在のプラン`
  - Free: `FREE`
  - Pro billing: `PRO`
  - Test Pro: `TEST`
  - App Store Pro: `APP STORE`
- `サブスクリプション管理`
  - Visible for active billing subscriptions
  - If already scheduled for cancellation, display `解約予定`
  - Otherwise opens a confirmation modal and calls `POST /api/subscription/cancel`
- `App Storeで管理`
  - Visible for active App Store subscriptions
  - Opens Apple's subscription management screen in a new tab
- `アカウント削除`
  - Visible for authenticated users
  - Opens a destructive confirmation modal and calls `DELETE /api/account/delete`

### Cancellation modal

The cancellation modal must make the period-end behavior explicit:

- The user is cancelling the next renewal, not losing Pro immediately
- Pro remains available until the current period end
- The row should refresh after success so it becomes `解約予定`

### Account deletion modal

The account deletion modal must make destructive effects explicit:

- Cloud data and account login are removed
- Active Stripe billing is cancelled immediately by the API
- Active App Store subscriptions may need Apple-side cancellation first
- On success, clear the local session and return to the home screen

## Error Handling

- Show inline modal errors for failed API calls.
- Preserve the modal state when an error occurs.
- For `active_appstore_subscription`, tell the user to cancel in App Store first.
- For `missing_stripe_subscription_id`, tell the user to contact support because automatic deletion cannot safely stop billing.

## Non-goals

- Do not add a Stripe Customer Portal dependency in this pass.
- Do not change cancellation semantics to immediate cancellation for normal subscription management.
- Do not add native Android/iOS UI for Stripe cancellation until the cancellation API supports bearer auth consistently.
