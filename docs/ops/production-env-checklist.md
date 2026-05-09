# 本番環境変数チェックリスト

## 目的

公開前または障害時に、Vercel、Supabase、Stripe、Cloud Run、AI provider、通知、管理系workerの環境変数が本番として安全に揃っているか確認するためのチェックリストです。

この文書は確認用です。実際の本番DB操作、Stripe操作、Cloud Run変更、Gemini / OpenAI本番操作は、このチェックリストだけを根拠に実施しません。

## Vercel

- [ ] Production環境に本番値が設定されている。
- [ ] Preview環境とProduction環境でtest/live値が混在していない。
- [ ] `NEXT_PUBLIC_APP_URL` が本番ドメインを指している。
- [ ] `NEXT_PUBLIC_SUPABASE_URL` と `NEXT_PUBLIC_SUPABASE_ANON_KEY` が同じSupabase projectの値。
- [ ] `SUPABASE_SERVICE_ROLE_KEY` はProduction server-side envだけに設定されている。
- [ ] `ADMIN_SECRET` は十分に長いランダム値で、外部に共有されていない。
- [ ] `INTERNAL_WORKER_TOKEN` はSupabase Vault側の `internal_worker_token` と同期している。
- [ ] `vercel.json` の長時間AI route設定は維持されている。

注意:

- `NEXT_PUBLIC_` で始まる値はブラウザへ公開される。secret、service role、API key、webhook secret、private keyを入れない。
- Vercel Runtime Logsにsecret値を出さない。
- `ENABLE_TEST_PRO_GRANTS` や `DEBUG_USER_EMAIL` のような検証用envがProductionに残っていないか確認する。

## Supabase

- [ ] `NEXT_PUBLIC_SUPABASE_URL` は本番Supabase project URL。
- [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY` は同じ本番projectのanon key。
- [ ] `SUPABASE_SERVICE_ROLE_KEY` は同じ本番projectのservice role key。
- [ ] anon keyとservice role keyを別projectから混ぜていない。
- [ ] migrationはrepoの `supabase/migrations/` と本番schemaが一致している。
- [ ] `api_cost_events` と `feature_usage_daily` が存在する。
- [ ] `scan_jobs`, `daily_scan_usage`, `otp_requests`, `subscription_sessions`, `webhook_events`, `subscriptions` が存在する。
- [ ] RLSが必要なテーブルで有効になっている。
- [ ] Storage bucket `scan-images` が期待どおり存在し、policyが過度に公開されていない。

設定してはいけないもの:

- `SUPABASE_SERVICE_ROLE_KEY` を `NEXT_PUBLIC_` にしない。
- service role keyをブラウザ、mobile client、公開docs、ログに出さない。
- 本番projectにPreview用の手動検証値を混ぜない。

## Stripe

- [ ] `STRIPE_SECRET_KEY` はProductionではlive key。
- [ ] `STRIPE_WEBHOOK_SECRET` は本番Webhook endpointのsecret。
- [ ] `STRIPE_PRICE_ID` は同じStripe live環境のPro plan price id。
- [ ] `NEXT_PUBLIC_APP_URL` とCheckout success / cancel URLが本番ドメインに向く。
- [ ] Stripe DashboardのWebhook endpoint URLが本番 `/api/subscription/webhook`。
- [ ] Previewではtest key、Productionではlive keyに分かれている。

混在チェック:

- Productionに `sk_test_` やtest price idを入れない。
- Previewにlive keyを入れない。
- `STRIPE_SECRET_KEY` と `STRIPE_PRICE_ID` が別環境の値になっていないか確認する。

## Cloud Run

Vercel側:

- [ ] `CLOUD_RUN_URL` は本番Cloud Run service URL。
- [ ] `CLOUD_RUN_AUTH_TOKEN` はCloud Run側 `AUTH_TOKEN` と一致する。

Cloud Run側:

- [ ] `AUTH_TOKEN` はVercel `CLOUD_RUN_AUTH_TOKEN` と一致する。
- [ ] `OPENAI_API_KEY` はfallbackに使う本番用key。
- [ ] `GCP_PROJECT_ID` は本番GCP project。
- [ ] `GCP_LOCATION` は想定region。既存運用では `asia-northeast1`。
- [ ] `APP_ENV=prod`。
- [ ] `FALLBACK_OPENAI_MODEL` が想定モデル。
- [ ] `FALLBACK_CALLS_DAILY_CAP` と `FALLBACK_COST_DAILY_CAP_YEN` が本番上限として妥当。
- [ ] `FALLBACK_SLACK_WEBHOOK_URL` は必要な場合だけ設定。

注意:

- `CLOUD_RUN_URL` と `CLOUD_RUN_AUTH_TOKEN` が両方ある場合、AI provider呼び出しはCloud Run経由になる。
- どちらか欠けると直接API経路へ戻るため、`GOOGLE_AI_API_KEY` / `OPENAI_API_KEY` の有無も確認する。

## OpenAI / Gemini

- [ ] `OPENAI_API_KEY` は本番で使うOpenAI projectのkey。
- [ ] `GOOGLE_AI_API_KEY` は直接Gemini経路で使う本番key。
- [ ] Cloud Run経由運用ではCloud Run側 `OPENAI_API_KEY` とVertex AI権限も確認する。
- [ ] OpenAI / Gemini / Google Cloud billing alertが設定されている。
- [ ] `API_COST_USD_TO_JPY` が推定コスト表示の前提として妥当。
- [ ] `REQUIRE_AUTH_TRANSLATE=true`。
- [ ] `REQUIRE_AUTH_GENERATE_EXAMPLES=true`。
- [ ] `REQUIRE_AUTH_DICTATION_GRADE=true`。
- [ ] `ENABLE_AI_USAGE_LIMITS=true`。
- [ ] `AI_LIMIT_*` がFree / Proの本番上限として妥当。
- [ ] `SENTENCE_QUIZ_MAX_CONCURRENCY` が過度に高くない。
- [ ] 緊急切戻し用に `SENTENCE_QUIZ_USE_LEGACY` の現在値を把握している。

公開してはいけないもの:

- `OPENAI_API_KEY`
- `GOOGLE_AI_API_KEY`
- Cloud Run `AUTH_TOKEN`
- fallback Slack webhook URL

## Apple IAP

- [ ] `APPLE_IAP_ISSUER_ID` が本番App Store Connectの値。
- [ ] `APPLE_IAP_KEY_ID` が本番用key id。
- [ ] `APPLE_IAP_PRIVATE_KEY` が改行形式を含めて正しく設定されている。
- [ ] `APPLE_IAP_BUNDLE_ID` が本番アプリbundle id。
- [ ] `APPLE_IAP_ENV=production`。
- [ ] `APPLE_IAP_APP_APPLE_ID` が本番アプリのApple ID。
- [ ] `IAP_PRO_PRODUCT_IDS` が本番App Store product idのCSV。

注意:

- sandbox値とproduction値を混ぜない。
- private keyをログ、docs、スクリーンショットに出さない。

## Resend

- [ ] `RESEND_API_KEY` が本番送信用key。
- [ ] 送信domainがResendでverified。
- [ ] OTP送信元が本番domainとして許可されている。
- [ ] `NEXT_PUBLIC_APP_URL` がメール内リンクの本番URLになる。

注意:

- `RESEND_API_KEY` をクライアントへ公開しない。
- domain未検証の一時送信元へ本番で切り替えない。

## Web Push / APNS

Web Push:

- [ ] `NEXT_PUBLIC_VAPID_PUBLIC_KEY` が公開用VAPID public key。
- [ ] `VAPID_PRIVATE_KEY` が対応するprivate key。
- [ ] `VAPID_SUBJECT` が有効なmailtoまたはURL。

APNS:

- [ ] `APNS_TEAM_ID` が本番Apple Developer Team ID。
- [ ] `APNS_KEY_ID` が本番用key id。
- [ ] `APNS_SIGNING_KEY` が正しいprivate key。
- [ ] `APNS_BUNDLE_ID` が本番bundle id。
- [ ] `APNS_ENVIRONMENT=production`。

注意:

- `NEXT_PUBLIC_VAPID_PUBLIC_KEY` 以外の通知secretは公開しない。
- APNS sandbox / productionの混在を確認する。

## Admin / internal worker

- [ ] `ADMIN_SECRET` は `/api/ops/api-costs` と `/api/embeddings/rebuild` の管理アクセスに使う値として設定されている。
- [ ] `INTERNAL_WORKER_TOKEN` はinternal async route用に設定されている。
- [ ] `SUPABASE_SERVICE_ROLE_KEY` fallbackに依存していないか、依存する場合は理由を把握している。
- [ ] Supabase Vault secret `internal_worker_token` とVercel `INTERNAL_WORKER_TOKEN` が一致している。
- [ ] Cron / workerが参照するURLとtokenが本番向き。

設定してはいけないもの:

- `ADMIN_SECRET` を `NEXT_PUBLIC_` にしない。
- `INTERNAL_WORKER_TOKEN` をログ、client、公開docsに出さない。
- 管理系APIの確認に本番secretをチャットやissueへ貼らない。

## 設定してはいけないもの、公開してはいけないもの

- `SUPABASE_SERVICE_ROLE_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `OPENAI_API_KEY`
- `GOOGLE_AI_API_KEY`
- `CLOUD_RUN_AUTH_TOKEN`
- Cloud Run `AUTH_TOKEN`
- `APPLE_IAP_PRIVATE_KEY`
- `APNS_SIGNING_KEY`
- `VAPID_PRIVATE_KEY`
- `RESEND_API_KEY`
- `ADMIN_SECRET`
- `INTERNAL_WORKER_TOKEN`
- Slack webhook URL

これらを `NEXT_PUBLIC_` にしない。ログ、スクリーンショット、docs、ユーザー説明、GitHub issue、PR本文に出さない。

## 本番値・test値の混在チェック

- [ ] Stripe Productionに `sk_test_`、test webhook secret、test price idが入っていない。
- [ ] Stripe Previewにlive keyが入っていない。
- [ ] Supabase URL、anon key、service role keyが同じprojectから発行されている。
- [ ] Cloud Run URLとtokenが同じservice / revision向け。
- [ ] Apple IAPでsandbox product / production productが混ざっていない。
- [ ] APNSでsandbox環境とproduction bundle idが混ざっていない。
- [ ] Resendの送信domainが本番domain。
- [ ] OpenAI / Google Cloud projectが検証用ではなく本番billing管理下。
- [ ] `NEXT_PUBLIC_APP_URL` がProductionでlocalhostやPreview URLになっていない。

## 公開前の確認手順

1. Vercel Production envをカテゴリごとに確認する。
2. `NEXT_PUBLIC_` にsecretが入っていないか確認する。
3. Supabase projectのURL / anon key / service role keyの組み合わせを確認する。
4. Stripe live key、webhook secret、price idの組み合わせを確認する。
5. Cloud Runを使う場合、`CLOUD_RUN_URL` / `CLOUD_RUN_AUTH_TOKEN` とCloud Run `AUTH_TOKEN` を確認する。
6. OpenAI / Gemini / Google Cloud billing alertを確認する。
7. Apple IAP、Resend、Web Push、APNSを使う導線のenvを確認する。
8. `ADMIN_SECRET` と `INTERNAL_WORKER_TOKEN` の管理範囲を確認する。
9. `npm run verify` を実行する。
10. 本番操作が必要な確認は、該当Runbookを読んでから実施する。

## 障害時に確認する順番

1. ユーザー影響が出ている導線を特定する。
2. Vercel Runtime Logsで対象APIのenv不足、401、403、500を確認する。
3. Supabase接続やRLSが疑われる場合は [`supabase-incident-runbook.md`](supabase-incident-runbook.md) を確認する。
4. AIコストやAI routeが疑われる場合は [`ai-cost-spike-runbook.md`](ai-cost-spike-runbook.md) を確認する。
5. 課金反映なら [`billing-stripe-failure-runbook.md`](billing-stripe-failure-runbook.md) を確認する。
6. 認証なら [`login-auth-failure-runbook.md`](login-auth-failure-runbook.md) を確認する。
7. スキャンなら [`scan-failure-runbook.md`](scan-failure-runbook.md) と [`scan-gemini-cloudrun-runbook.md`](scan-gemini-cloudrun-runbook.md) を確認する。
8. env変更が必要な場合は、変更前の値、変更後の値、戻し方、影響範囲を記録してからエスカレーションする。
