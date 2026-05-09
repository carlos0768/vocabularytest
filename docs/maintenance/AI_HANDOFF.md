# AI Handoff

## 現在の目的

公開後もAIに安全に保守作業を任せられる最低ラインへ到達すること。現在の主目的は、旧 `codex/prelaunch-safety-baseline` で行った保守性向上作業を、最新 `origin/main` のUIを壊さずに `codex/prelaunch-safety-baseline-current-ui` へ再実装することです。

## ブランチ方針

- 正式な修正版ブランチ: `codex/prelaunch-safety-baseline-current-ui`
- 参照専用の旧ブランチ: `codex/prelaunch-safety-baseline`
- 旧ブランチの56コミット一括cherry-pickは禁止。
- 最新 `origin/main` のUIを壊さないことを最優先にする。
- 旧maintenance docs内の「完了済み」は旧ブランチ上での記録です。最新UIブランチでの実装済み/未実装は、このファイルと `docs/maintenance/TASKS.md` を正とします。

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
- `npm run verify` は通過済み。
- 実メールOTP到達と本番外部サービス確認は未実施。

## 現在の再移植対象

1. 旧maintenance docsを最新UI方針に合わせて救出する。
2. 検証基盤、security guard、固定テスト一覧、route contract testsを再移植する。
3. scan/API/lib系helperを最新コードへ再実装する。
4. Home/Project/QuizのUI隣接helperを最新UIを保って再実装する。
5. 反映済みの知識だけを正式docsへ昇格し、最終verify後にpushする。
