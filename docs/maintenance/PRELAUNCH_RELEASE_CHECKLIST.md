# Prelaunch Release Checklist

公開前の判断は「完璧な分割が終わったか」ではなく、「壊した時に検知でき、AIがdocsから状況復元でき、外部サービスの未確認点を把握できているか」で行います。

## 公開してよい条件

- 最新UIベースのブランチから作業している。
- `/signup` がモックではなく、メール・パスワード・OTPで登録できる導線になっている。
- `npm run verify` が通っている。
- 実メールOTP、Supabase、Resend、Stripe、Cloud Runの公開前確認が完了または明確に未完として記録されている。
- 残リスクが「公開後に直せるもの」と「公開前に止めるもの」に分けられている。

## 自動検証

- [ ] `git diff --check`
- [ ] `npm run security:deps`
- [ ] `npm run security:secrets`
- [ ] `npm run security:all`
- [ ] `npm run lint:web`
- [ ] `npm test`
- [ ] `npm run build`
- [ ] `npm run verify`

## UI保護

- [ ] `git diff --name-only origin/main...HEAD` で禁止UIファイルに差分が無い。
- [ ] `/` が最新UIのまま表示される。
- [ ] `/login` が最新UIのまま表示される。
- [ ] `/signup` が実フォームとして表示される。

禁止UIファイル:

- `src/app/page.tsx`
- `src/app/project/**`
- `src/app/quiz/**`
- `src/components/home/**`
- `src/components/project/**`
- `src/components/redesign/**`
- `src/app/globals.css`

## Signup手動QA

- [ ] 新規メールで `/signup` からOTPメールを送れる。
- [ ] 6桁OTP入力後、`/api/auth/signup-verify` が成功する。
- [ ] `redirect` queryがある場合は登録後にその先へ遷移する。
- [ ] `redirect` queryが無い場合は `/` へ遷移する。
- [ ] 既存メールはsignup画面で自動ログインされず、エラー表示される。
- [ ] パスワード不一致が画面で止まる。
- [ ] OTP誤入力・期限切れが画面で分かる。

## 外部サービス確認

- [ ] Supabase本番envがVercel/実行環境に設定されている。
- [ ] Supabase RLSとmigrationの状態が本番DBと一致している。
- [ ] Resend送信domainが認証済み。
- [ ] Stripe webhook URLと署名secretが本番設定と一致している。
- [ ] Stripe reconcile手順をrunbookから辿れる。
- [ ] Cloud Run env/tokenが本番向けに設定されている。
- [ ] App Store/IAPは公開範囲に含める場合のみ確認する。

## 公開前に直すもの

- `verify` 失敗
- signup/login/reset-passwordの実害
- scan/paymentの実害
- 本番env不足
- secret漏れまたは疑い
- docsと実コードの重大な不一致

## 公開後へ回すもの

- Home/Project/Quizの追加分割
- scan-jobs/processの追加分割
- 既存docsの全面整理
- 使い勝手改善や追加機能
