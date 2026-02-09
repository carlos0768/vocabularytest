# KOMOJU決済反映障害 調査メモ（2026-02-09）

## 事象
- テストカード決済はKOMOJUダッシュボード上で売上計上される。
- しかしアプリの `/subscription/success` は「決済を確認中...」を繰り返し、最終的に「決済反映を待っています」を表示する。
- ユーザーはProへ昇格しない。

## 原因（確定）
1. **アプリ側のPro反映はWebhook依存**
   - `src/app/subscription/success/page.tsx` は `/api/subscription/me` をポーリングし、
     `isActivePro && proSource === 'billing'` の時だけ成功扱いにする。
   - `billing` への変更は `src/app/api/subscription/webhook/route.ts` の `payment.captured` 処理が前提。

2. **対象環境でWebhook処理実績が存在しない**
   - `public.webhook_events` が 0 件。
   - `public.subscription_sessions` は作成済みだが `used_at` が NULL のまま。
   - `public.subscriptions` も `pro_source='billing'` が 0 件。

3. **結果として、売上とアプリ状態が乖離した**
   - KOMOJU側は売上が立つ（決済成功）。
   - アプリDBは `free` のまま（Webhook未到達/未処理）。

## 直接的な再発ポイント
- Webhook URL誤設定、または到達不可。
- `KOMOJU_WEBHOOK_SECRET` の不一致（test/live混在含む）。
- `NEXT_PUBLIC_APP_URL` の環境値誤りにより運用確認が困難。

## 恒久対策（今回実装する方針）
- Webhook経路の正常化に加え、
  `session_id` を使った **reconcile API** を追加し、Webhook不達時でも成功画面から安全に回復可能にする。
- Webhookとreconcileで同じアクティベーション処理を共通化し、二重処理を防ぐ。
