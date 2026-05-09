# ログイン / 認証失敗 Runbook

## 目的

公開後にログイン、サインアップ、OTPメール、パスワード再設定、保護ページ遷移で失敗が起きた時、運用者が初動で切り分けるための手順です。

対象:

- OTP送信: `/api/auth/send-otp`
- OTPログイン/ユーザー作成: `/api/auth/verify-otp`
- サインアップOTP検証: `/api/auth/signup-verify`
- パスワード再設定: `/api/auth/reset-password`
- Google / Apple OAuth callback: `/auth/callback`
- クライアント認証状態: `src/hooks/use-auth.ts`
- 保護ルートのmiddleware: `src/lib/supabase/middleware.ts`
- メール送信: Resend
- DB: `otp_requests`
- Supabase Auth Users

## まず見る場所

- Vercel Runtime Logs
  - `/api/auth/send-otp`
  - `/api/auth/verify-otp`
  - `/api/auth/signup-verify`
  - `/api/auth/reset-password`
  - 認証後に失敗する場合は該当APIの401も確認する
- Supabase Dashboard
  - Authentication > Users
  - Authentication > Providers
  - Authentication > URL Configuration
  - Auth logs
  - Table: `otp_requests`
- Resend Dashboard
  - Emails
  - API key状態
  - domain / sender状態
- Browser側
  - Cookieが保存されているか
  - `/login?redirect=...` へ戻され続けていないか

## よくある症状

- 認証コードメールが届かない。
- OTP入力後に「認証コードが見つかりません」「有効期限が切れました」「試行回数の上限」と表示される。
- サインアップ時に既存ユーザー扱いになる。
- パスワード再設定メールは成功表示だが、メールが届かない。
- Google / Appleボタンを押した後に外部認証画面へ移動しない。
- Google / Apple認証後に `/auth/auth-code-error` へ戻る。
- ログイン後も保護ページで `/login` に戻される。
- `/api/auth/*` が500を返す。
- Proユーザーの初期同期や購読情報取得だけが失敗する。

## 初動確認手順

1. 影響範囲を確認する。
   - 全ユーザーか、特定メールアドレスだけか。
   - OTP送信、OTP検証、パスワードログイン、保護ページredirectのどこで止まるか。
2. Vercel Runtime Logsで `/api/auth/*` のエラーを確認する。
3. Resend Dashboardで対象メールの送信履歴とbounce / blocked / deliveredを確認する。
4. `otp_requests` で対象メールの最新OTP行を確認する。
5. Supabase Authentication > Usersで対象メールが存在するか、email confirmed状態か確認する。
6. OAuthの場合、Supabase Authentication > ProvidersでGoogle / Apple providerが有効か確認する。
7. OAuthの場合、Supabase URL ConfigurationのSite URLとRedirect URLsに本番 `/auth/callback` があるか確認する。
8. ログイン後に戻される場合、`NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` とcookie設定、middleware redirectを確認する。
9. 認証後の購読情報や同期だけ失敗する場合、`/api/subscription/me`、sync系ログ、Supabase RLSエラーを別途確認する。

## 探すべきログ文字列

Vercel:

- `Send OTP error:`
- `Failed to insert OTP:`
- `RESEND_API_KEY is not set`
- `Resend API error:`
- `Resend API request failed:`
- `Verify OTP error:`
- `Failed to create user:`
- `Failed to generate magic link:`
- `Failed to verify OTP:`
- `Signup verify error:`
- `Failed to create session:`
- `Reset password error:`
- `Failed to update password:`
- `Auth error:`
- `/auth/auth-code-error`
- `Failed to fetch subscription:`
- `[Auth] Pro user detected, triggering initial sync`
- `[Auth] Initial sync failed:`
- `[Auth] Sync queue processing failed:`
- `[Auth] Recent project offline prefetch failed:`

Supabase:

- Auth user creation error
- magiclink / OTP verification error
- rate limit
- invalid JWT / expired session
- RLS denied

Resend:

- API 401 / 403
- domain not verified
- rate limit
- bounced / complained / blocked

## 確認する環境変数

Vercel:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `RESEND_API_KEY`
- `NEXT_PUBLIC_APP_URL`

確認観点:

- `SUPABASE_SERVICE_ROLE_KEY` が `/api/auth/*` の管理操作で使える値か。
- `NEXT_PUBLIC_SUPABASE_URL` と `NEXT_PUBLIC_SUPABASE_ANON_KEY` が同じSupabase projectの値か。
- `RESEND_API_KEY` が本番環境に設定され、`noreply@merken.jp` から送信できる状態か。
- `NEXT_PUBLIC_APP_URL` が本番ドメインを指しているか。
- Supabase AuthのSite URLが `NEXT_PUBLIC_APP_URL` と同じ本番ドメインか。
- Supabase AuthのRedirect URLsに `https://<本番ドメイン>/auth/callback` が登録されているか。
- Google / Apple側のOAuth redirect URI / Return URLが、Supabase projectの callback URLを指しているか。

## 確認するSupabaseテーブルまたはSQL例

対象メールのOTP状況:

```sql
select
  id,
  email,
  verified,
  attempts,
  expires_at,
  created_at
from otp_requests
where email = lower('<EMAIL>')
order by created_at desc
limit 10;
```

期限切れOTPの量:

```sql
select
  count(*) as expired_unverified_count
from otp_requests
where verified = false
  and expires_at < now();
```

直近のOTP発行量:

```sql
select
  date_trunc('hour', created_at) as hour,
  count(*) as otp_count
from otp_requests
where created_at >= now() - interval '24 hours'
group by 1
order by 1 desc;
```

対象ユーザーの確認:

- Supabase Dashboard > Authentication > Usersで対象メールを検索します。
- `auth.users` はDashboardまたは管理権限のある安全なSQL環境で確認してください。通常の運用初動では、`otp_requests` とAuthentication画面の確認を優先します。

## 触ってはいけないこと

- `otp_requests.otp_code` をユーザーへ伝えない。
- OTP行を手動で `verified=true` にしない。
- ユーザーのパスワードを運用者が任意値に変更しない。
- `SUPABASE_SERVICE_ROLE_KEY` や `RESEND_API_KEY` をログ、スクリーンショット、ユーザー説明に出さない。
- middlewareの保護パスや認証skip挙動を障害中に変更しない。
- Supabase Auth Usersを手動削除しない。
- Resendで本番送信元domainを未確認のまま別送信元に切り替えない。

## ユーザーへ説明する時の文面例

OTPメールが届かない場合:

> 認証コードメールの送信状況を確認しています。迷惑メールフォルダや受信拒否設定もあわせてご確認ください。必要に応じて、少し時間をおいてから認証コードを再送してください。

OTP期限切れまたは試行回数超過の場合:

> 認証コードの有効期限切れ、または入力試行回数の上限に達している可能性があります。新しい認証コードを再送して、最新のコードを入力してください。

ログイン後に戻される場合:

> ログインセッションの保存または確認で問題が起きている可能性があります。ブラウザのCookie設定を確認し、再ログインをお試しください。こちらでも認証基盤側の状態を確認しています。

## エスカレーション条件

- 複数ユーザーでOTPメールが届かない。
- Resend Dashboardで送信失敗、domain未検証、rate limitが継続している。
- `/api/auth/*` が継続して500を返す。
- Supabase Authでユーザー作成、magiclink生成、session作成が失敗している。
- ログイン後のCookieが保存されず、複数ブラウザで保護ページに入れない。
- `otp_requests` の作成や削除に失敗している。
- `SUPABASE_SERVICE_ROLE_KEY` またはSupabase project設定の不整合が疑われる。
- 手動でAuth UserやOTP行に触る必要がある。

## 復旧後にdocsへ追記すべきこと

- 発生日時、影響範囲、対象フロー。
- Vercel / Supabase / Resendで確認した代表ログ。
- `otp_requests` の状態と、Resend送信結果。
- 原因がResend、Supabase Auth、環境変数、Cookie、middleware、ユーザー操作のどれだったか。
- 実施した復旧操作と、再発防止策。
- このRunbookで不足していた確認手順。
