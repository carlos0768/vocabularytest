# AI Handoff

## 現在の目的

公開後もAIに安全に保守作業を任せられる最低ラインへ到達すること。今の主目的は大規模リファクタではなく、最新UIを維持したまま、signup実動線、検証基盤、docs引き継ぎ、公開前手動確認を整えることです。

## ブランチ方針

- 正式な修正版ブランチ: `codex/prelaunch-safety-baseline-current-ui`
- 使わない旧ブランチ: `codex/prelaunch-safety-baseline`
- 旧ブランチの56コミット一括cherry-pickは禁止。
- 最新 `origin/main` のUIを壊さないことを最優先にする。

## 触ってよい範囲

- `src/app/signup/page.tsx`
- `src/lib/auth/signup-flow.ts`
- `src/lib/auth/signup-flow.test.ts`
- `package.json` の検証script
- `docs/**`

## 触ってはいけない範囲

- `src/app/page.tsx`
- `src/app/project/**`
- `src/app/quiz/**`
- `src/components/home/**`
- `src/components/project/**`
- `src/components/redesign/**`
- `src/app/globals.css`
- DB migration、課金、スキャン、同期処理、API contract

## 検証方針

コード変更後は `git diff --check`、禁止UIファイルに差分が無いこと、`npm run lint:web`、`npm test`、`npm run build`、`npm run verify` を確認します。実メールOTP、Supabase本番、Resend、Stripe、Cloud Runは自動テストでは完了扱いにせず、公開前手動チェックに残します。

## 現在の状態

- `/signup` はメール・パスワード入力からOTP入力へ進む実動線に更新済み。
- 既存ユーザー時にsignup画面から自動ログインしない。
- `send-otp` / `signup-verify` のAPI contractは変更していない。
- `npm run verify` は通過済み。
- 実メールOTP到達と本番外部サービス確認は未実施。
