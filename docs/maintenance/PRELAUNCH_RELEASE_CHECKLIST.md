# Prelaunch Release Checklist

作成日: 2026-05-09

この文書は、初版公開前に「公開後もAIと人間が安全に保守作業を続けられる最低ライン」に到達しているか確認するためのチェックリストです。追加リファクタの計画書ではありません。

## 公開判断の基準

公開前に必須:

- [ ] `npm run verify` が成功している。
- [ ] 新規登録、ログイン、パスワード再設定の代表フローを手動確認している。
- [ ] 代表的なスキャンを1件実行し、結果保存または確認画面への到達を確認している。
- [ ] Stripeの本番前確認、または本番直前に実施する手順と担当者が決まっている。
- [ ] Supabase、Resend、Cloud Run、Stripeの本番環境変数チェックが完了している。
- [ ] 未確認の外部項目を「公開を止めるもの」と「公開後確認でよいもの」に分けている。

公開前にやらない:

- Home / Project / Quiz / `scan-jobs/process` の追加巨大ファイル分割。
- API request/response、DB schema、migration、課金仕様、scan仕様の不要な変更。
- `npm run verify` 成功後の広範囲リファクタ。

## 自動検証

直近の確認結果は [`AI_HANDOFF.md`](AI_HANDOFF.md) の「現在の検証状態」を正とします。

公開直前に実行:

```bash
npm run verify
```

必要に応じて追加:

```bash
npm run test:cloud-run-scan
```

成功条件:

- `lint:web`: 0 errors。既存warningは公開判断で個別に扱う。
- `security:all`: SQL / secrets / dependency high-critical が通過。
- `npm test`: 固定リストのWeb/shared testsが通過。
- `test:security`: security route testsが通過。
- `build`: Next production buildが成功。

## 手動QA

### 認証

- [ ] `/signup` でメール、パスワード、確認パスワードを入力できる。
- [ ] OTPメールがResend経由で届く。
- [ ] OTP入力後、`/api/auth/signup-verify` が成功し、redirect先でログイン済みになる。
- [ ] 既存メールでsignupした場合、signup画面内で自動ログインせず、既存email errorが表示される。
- [ ] `/login` で既存ユーザーがログインできる。
- [ ] `/reset-password` でOTP送信、OTP確認、パスワード更新ができる。

確認時に見るrunbook:

- [`../ops/login-auth-failure-runbook.md`](../ops/login-auth-failure-runbook.md)

### スキャン

- [ ] Webの通常スキャンを1件実行し、単語抽出結果が表示される。
- [ ] 可能ならPro-only modeを1件確認する。
- [ ] background scanを使う運用なら、Vercel Logsで `[scan-jobs/process] Processing started` を確認する。

確認時に見るrunbook:

- [`../ops/scan-failure-runbook.md`](../ops/scan-failure-runbook.md)
- [`../ops/scan-gemini-cloudrun-runbook.md`](../ops/scan-gemini-cloudrun-runbook.md)

### 課金

- [ ] Stripe Checkoutのsuccess / cancel URLが本番ドメイン向き。
- [ ] Stripe webhook endpointが本番 `/api/subscription/webhook` を指す。
- [ ] webhook secretとVercel envが一致している。
- [ ] 支払い後にwebhookまたはreconcileで `subscriptions` が反映される手順を確認している。

確認時に見るrunbook:

- [`../ops/billing-stripe-failure-runbook.md`](../ops/billing-stripe-failure-runbook.md)

### 外部環境

- [ ] [`../ops/production-env-checklist.md`](../ops/production-env-checklist.md) のVercel / Supabase / Stripe / Cloud Run / Resendを確認した。
- [ ] Supabase本番projectのURL、anon key、service role keyが同一projectの組み合わせ。
- [ ] RLSとmigration状態に疑義がある場合、[`../ops/supabase-incident-runbook.md`](../ops/supabase-incident-runbook.md) を読んで確認する。
- [ ] App Store / IAPは、初版公開範囲に含める場合だけApp Store ConnectとNotifications V2到達を確認する。

## 残リスク

公開時点で許容する残リスク:

- Home / Project / Quiz / `scan-jobs/process` には巨大ファイルと混在責務が残る。
- repo外の本番外部設定は、自動テストでは保証できない。
- `npm test` は固定リスト方式であり、全test自動発見ではない。
- `npm run verify` はCloud Run scan serviceの別package testsを含まない。

公開を止める残リスク:

- `npm run verify` が失敗している。
- signup / login / reset-password の代表フローが本番相当環境で失敗する。
- 通常scanの代表フローが失敗する。
- Stripe webhookまたはreconcileの本番前確認手順が未確定。
- production envにtest値と本番値が混在している疑いが残る。

## 追加修正の停止条件

公開前に追加修正してよいのは以下だけです。

- `npm run verify` の失敗修正。
- signup / login / reset-password / scan / payment の実害修正。
- 本番環境変数やrunbookの重大な不一致修正。
- 公開判断を誤らせるdocs不整合の修正。

それ以外の保守性向上リファクタは、公開後または別途判断に回します。
