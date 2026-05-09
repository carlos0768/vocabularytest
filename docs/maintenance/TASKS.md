# Maintenance Tasks

## P0: 旧保守性向上作業の最新UIブランチ救出

- [x] 最新 `origin/main` 起点の `codex/prelaunch-safety-baseline-current-ui` を使う。
- [x] 旧 `codex/prelaunch-safety-baseline` を参照専用にする。
- [x] 旧maintenance docsを、最新UIブランチ上では「再移植の仕様」と読める形で救出する。
- [x] 検証基盤/security/contract testsを最新コードへ再移植する。
- [x] scan/API/lib系リファクタを最新コードへ再実装する。
- [x] Home/Project/QuizのUI隣接helperを、最新UIの見た目を保ったまま再実装する。
- [x] 反映済みの恒久知識だけを正式docsへ昇格する。
- [x] 最終verify後に `codex/prelaunch-safety-baseline-current-ui` をpushする。

注意: 旧docs内の「完了済み」は旧ブランチ上での記録です。このブランチで完了したかどうかは、このチェックリストを正とします。

## P0: 最新UIを守る

- [x] `codex/prelaunch-safety-baseline-current-ui` を最新 `origin/main` 起点に戻した。
- [x] 旧 `codex/prelaunch-safety-baseline` の一括cherry-pickを禁止した。
- [x] 差分確認で、禁止UIファイルに変更が無いことを確認した。

## P0: Signup導線

- [x] `/signup` のモックオンボーディング画面を外す。
- [x] メール・パスワード入力からOTP入力へ進む実動線にする。
- [x] `/login` と `/signup` にGoogle / Apple OAuthログイン導線を追加する。
- [x] `send-otp` / `signup-verify` の既存API contractを変えない。
- [x] 既存メール時にsignup画面から自動ログインしない。
- [ ] 実メールOTP到達と登録後redirectを手動確認する。
- [ ] Google / Apple OAuthをSupabase本番provider設定で手動確認する。

## P0: 検証基盤

- [x] `npm run lint:web` を追加する。
- [x] `npm run verify` を追加する。
- [x] signup helper testを固定テスト一覧に追加する。
- [x] OAuth redirect helper testを固定テスト一覧に追加する。
- [x] `npm run security:deps`
- [x] `npm run security:secrets`
- [x] `npm run security:all`
- [x] `npm run lint:web`
- [x] `npm test`
- [x] `npm run build`
- [x] `npm run verify`

## P0: ローカルUI確認

- [x] `/` が表示される。
- [x] 未ログイン時の `/` をゲスト向け登録導線にする。
- [x] `/login` が表示される。
- [x] `/signup` が実フォームとして表示される。
- [x] `/signup` から古いモックオンボーディング文言が消えている。
- [x] `/login` と `/signup` にGoogle / Apple OAuthボタンが表示される。
- [x] 初回公開対象外の添削/構造解析を公開導線から非表示にする。
- [x] `/projects` 下部の浮動プラスボタンを非表示にする。

## P0: 公開前手動確認

- [ ] signup OTP実メール到達
- [ ] 登録後ログイン済みredirect
- [ ] Google / Apple OAuth redirect
- [ ] Supabase本番env/RLS/migration一致
- [ ] Resend送信domain
- [ ] Stripe webhook/reconcile
- [ ] Cloud Run env/token
- [ ] App Store/IAP（公開範囲に含める場合のみ）

## P1: 最終確認

- [x] `npm run lint:web`（再移植後）
- [x] `npm run build`（再移植後）
- [x] `npm run security:deps`
- [x] `npm run security:secrets`
- [x] `npm run security:all`
- [x] `npm test`
- [x] `npm run verify`
- [x] ブラウザで最新UI確認
- [x] remote push
