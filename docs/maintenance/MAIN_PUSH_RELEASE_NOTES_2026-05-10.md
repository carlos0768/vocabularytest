# Main Push Release Notes 2026-05-10

2026-05-10に `codex/prelaunch-safety-baseline-current-ui` の内容を `main` へfast-forward pushしました。

この文書は、説明不足のまま広い変更を `main` に入れた状態を補正するためのリリースメモです。以後、本番投入判断や不具合調査では、まずこの文書と `PRELAUNCH_RELEASE_CHECKLIST.md` を確認してください。

## Push概要

- 対象リポジトリ: `carlos0768/vocabularytest`
- push先: `main`
- push元: `codex/prelaunch-safety-baseline-current-ui`
- 取り込み範囲: `c2a69d4..d1fa9d2`
- 取り込み方式: fast-forward push
- force push: なし
- 変更規模: 33 commits / 176 files

## Mainに入った主な変更

### 公開前の保守性向上

- `docs/README.md`、`docs/maintenance/*`、`docs/ops/*`、`docs/security/*` を整備。
- AIが作業前に読む入口、危険領域、runbook、公開前チェックリストを追加。
- `lint:web`、`verify`、security系検証、固定テストリストを整備。
- Auth、extract、scan job、billing、sync、AI prompt、Home/Project/Quiz helperにcontract testやpure helperを追加。

### Signup / Login

- `/signup` をモックオンボーディングではなく、メール・パスワード・OTP登録導線に整理。
- `/login` と `/signup` にGoogle / Apple OAuthボタンを追加。
- OAuth providerは環境変数で有効化されたものだけ表示する。
- Auth callbackまわりのredirectを安定化。

### 初回公開範囲の調整

- 初回公開では添削と構造解析を非表示。
- `/correction/**` と `/parser/**` は初回公開で404にする。
- `/projects` 下部の不要な浮動プラスボタンを削除。
- 設定の学習セクションを削除。

### UI / 学習導線

- 未ログイン時のルート `/` をゲスト向けLP/登録導線に変更。
- `/lp` は表示対象から外し、rootをLPとして使う。
- マイ単語帳のホーム表示件数を5件に変更。
- 保存済みページの名称、戻るボタン、クイズ導線を新UIに合わせて調整。
- フラッシュカード右上をシャッフルではなく詳細メニューに変更。
- 単語詳細の右ボタンを削除ボタンに変更。
- ブックマークボタンのサイズとモバイルホーム配置を調整。

### Quiz / Scan

- Duolingo形式の語順クイズを追加。
- 2語以上の単語は4択ではなく語順クイズ対象にする。
- スキャン時に語順クイズの非同期生成を呼ぶ。
- 語順クイズ生成中は4択だけ表示し、生成結果が届いたら差し込む。
- 発音記号はAI生成へ寄せる。

### DB / Migration / Stats

- 語順クイズキャッシュ用migrationを追加。
- 学習統計をログインユーザーのDBへ同期するmigrationとコードを追加。
- remote stats syncは標準ONに変更。
- 欠落していたSupabase migration履歴を復元し、remote-only履歴はplaceholderで整合。

## 自動検証の記録

main push前に記録されている検証:

- `git diff --check`: pass
- `npm run security:deps`: pass
- `npm run security:secrets`: pass
- `npm run security:all`: pass
- `npm run lint:web`: pass
- `npm test`: pass
- `npm run build`: pass
- `npm run verify`: pass
- `supabase db push --dry-run`: remote database is up to date
- Supabase migration `20260510120000` はremote適用済み

ただし、自動検証は外部サービスの本番設定を保証しません。

## 本番投入前に必ず人間が確認すること

- Vercelのmain deploymentが成功している。
- production URLで `/`、`/login`、`/signup` が表示できる。
- 新規メールでOTP登録できる。
- Google / Apple OAuthがCode 400にならず、ログイン後に正しい画面へ戻る。
- Supabase AuthのSite URL、Redirect URL allowlist、Google/Apple provider設定がproduction URLと一致している。
- Resendの送信domainが本番で認証済み。
- Stripe webhook URLと署名secretが本番環境と一致している。
- scan 1件が本番で完了し、単語、例文、発音記号、クイズが作られる。
- 学習統計が別端末でも同じユーザーで同期される。
- Cloud Run / AI API関連のenvとtokenが本番値になっている。

詳細は `docs/maintenance/PRELAUNCH_RELEASE_CHECKLIST.md` と `docs/ops/production-env-checklist.md` を確認してください。

## 公開を止める条件

- signup/login/OAuthで登録またはログイン不能。
- 既存ユーザーの単語帳が読めない。
- scan結果が保存されない。
- Stripe webhookまたはsubscription判定が壊れている。
- DB migrationの適用状態がlocal/remoteで不整合。
- secret漏れ、または本番secret未設定の疑い。
- `npm run verify`、`npm test`、`npm run build` のいずれかがmain上で失敗。

## 問題が出た時の戻し方

1. まずVercelの直前の安定deploymentへrollbackできるか確認する。
2. DB migrationを伴う問題かを確認する。DB変更が絡む場合、コードだけ戻しても直らない可能性がある。
3. Gitで戻す場合は、`main` へrevert commitを作る。force pushで履歴を巻き戻さない。
4. 調査時は `docs/ops/supabase-incident-runbook.md`、`docs/ops/login-auth-failure-runbook.md`、`docs/ops/scan-failure-runbook.md`、`docs/ops/billing-stripe-failure-runbook.md` を使う。

## 次回からの運用ルール

- `main` へ直接pushする前に、この程度の説明を先に出す。
- 変更範囲が広い場合は、最低でも「入るcommit数」「危険領域」「未確認外部サービス」「rollback方針」を明示する。
- 本番投入と同義になるpushでは、push前に `PRELAUNCH_RELEASE_CHECKLIST.md` を更新する。
