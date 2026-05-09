# AI Handoff

## 現在の目的

公開後もAIに安全に保守作業を任せられる最低ラインへ到達すること。旧 `codex/prelaunch-safety-baseline` で行った保守性向上作業は、最新 `origin/main` のUIを壊さずに `codex/prelaunch-safety-baseline-current-ui` へ再実装済みです。自動検証とローカルUI確認は完了済みで、次の主目的は外部サービス手動確認と公開判断です。

## ブランチ方針

- 正式な修正版ブランチ: `codex/prelaunch-safety-baseline-current-ui`
- 参照専用の旧ブランチ: `codex/prelaunch-safety-baseline`
- 旧ブランチの56コミット一括cherry-pickは禁止。
- 最新 `origin/main` のUIを壊さないことを最優先にする。
- 旧maintenance docs内の「完了済み」は旧ブランチ上での記録です。最新UIブランチでの最終状態は、このファイルと `docs/maintenance/TASKS.md` を正とします。

## 触ってよい範囲

- `src/app/signup/page.tsx`
- `src/lib/auth/signup-flow.ts`
- `src/lib/auth/signup-flow.test.ts`
- `package.json` の検証script
- `docs/**`
- `src/lib/**` のpure helper、contract test、DI追加
- `src/app/api/**` の挙動を変えない薄いリファクタとcontract test
- Home/Project/Quizの最新UIを保つためのhelper抽出

## 触ってはいけない範囲

- `src/app/page.tsx`, `src/app/project/**`, `src/app/quiz/**` の見た目・文言・レイアウト巻き戻し
- `src/components/home/**`, `src/components/project/**` の見た目巻き戻し
- `src/components/redesign/**`
- `src/app/globals.css`
- DB migration、API request/response shape、課金仕様、スキャン仕様、同期仕様

## 検証方針

コード変更後は `git diff --check`、禁止UIファイルに差分が無いこと、`npm run lint:web`、`npm test`、`npm run build`、`npm run verify` を確認します。scan/auth/billing/syncなどの危険領域を触った場合は、該当contract testを先に通してください。実メールOTP、Supabase本番、Resend、Stripe、Cloud Runは自動テストでは完了扱いにせず、公開前手動チェックに残します。

## 現在の状態

- `/signup` はメール・パスワード入力からOTP入力へ進む実動線に更新済み。
- 既存ユーザー時にsignup画面から自動ログインしない。
- `send-otp` / `signup-verify` のAPI contractは変更していない。
- 旧P2-C、scan process追加分割、Auth OTP、Stripe/reconcile、sync queue、AI prompt split、Home/Project/Quiz helperは最新UIブランチへ再実装済み。
- `src/components/redesign/**` と `src/app/globals.css` に差分は入れていない。
- `npm run security:deps`, `npm run security:secrets`, `npm run security:all`, `npm run lint:web`, `npm test`, `npm run build`, `npm run verify` は通過済み。
- ブラウザで `/`, `/login`, `/signup`, `/project/[id]`, `/quiz/[projectId]` を確認済み。未ログインのProject/Quizはlogin redirectで保護される。
- 実メールOTP到達と本番外部サービス確認は未実施。

## 次にやるべきこと

1. 実メールOTP、Supabase本番、Resend、Stripe、Cloud Run、App Store/IAPは `PRELAUNCH_RELEASE_CHECKLIST.md` に従って手動確認する。
2. 手動確認で実害が見つかった場合だけ、対象領域を1つに限定して修正計画を立てる。
3. 公開後の追加整理は、Home/Project/Quizの追加分割、scan-jobs/processの追加分割、既存docs全面整理の順で別判断にする。
