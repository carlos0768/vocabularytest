/**
 * 新規ユーザー受付のオン・オフ。
 *
 * 2026-10-07 に一時停止。新規アカウントの作成をいったん止めるため、
 * 受付導線 (LP / 料金 / 記事 / ログイン画面の「新規登録」) をすべて隠し、
 * `/signup` は「受付停止中」の案内に差し替える。既存ユーザーのログインと
 * 利用には影響しない。戻すときはこの定数を true にするだけでよい。
 *
 * 止めている間 (4層で守る。画面を隠すだけでは iOS アプリや直接の API 呼び出しを
 * 止められないので、サーバー側の拒否が本体):
 * - 導線: `/signup` へのリンクは出さず、ゲスト向け CTA は `/login` へ向ける
 *   (`getGuestEntryHref` / `getGuestEntryLabel`)。サイトマップからも外す
 * - `/signup`: フォームの代わりに `SIGNUP_CLOSED_NOTICE` とログインへの導線を出す
 * - API: `/api/auth/send-otp` (signup 用) と `/api/auth/signup-verify` は 403、
 *   `/api/auth/verify-otp` は未登録メールのアカウント作成だけ 403 で止める
 *   (既存ユーザーのログインは通す)
 * - OAuth (Google / Apple): Supabase はコールバックより先にユーザーを作ってしまう
 *   ので、`/auth/callback` で「作られたばかりのユーザー」(`isFreshlyCreatedAuthUser`)
 *   を検出し、service role で消してから `/login?signup=closed` へ返す。
 *   Supabase ダッシュボードの Authentication > Sign In / Up の
 *   「Allow new users to sign up」も合わせて切ること (ここは最後の砦で、
 *   `mobile/` の `supabase.auth.signUp` 直叩きはそちらでしか止まらない)
 */
export const NEW_USER_SIGNUP_ENABLED = false;

/** 画面に出す案内文 */
export const SIGNUP_CLOSED_NOTICE = '現在、新規アカウントの登録受付を一時停止しています。';

/** API が 403 で返すメッセージ */
export const SIGNUP_CLOSED_API_ERROR = '現在、新規登録の受付を停止しています';

/**
 * OAuth で作られたばかりのアカウントを取り消したあとに送るログイン画面。
 * `signup=closed` でログイン画面が理由を表示する。
 */
export const SIGNUP_CLOSED_LOGIN_PATH = '/login?signup=closed';

/**
 * ゲスト向け CTA の遷移先。受付中は `/signup`、停止中は `/login` に向ける
 * (どちらも `redirect` を引き継ぐ)。
 */
export function getGuestEntryHref(redirect = '/'): string {
  const base = NEW_USER_SIGNUP_ENABLED ? '/signup' : '/login';
  return `${base}?redirect=${encodeURIComponent(redirect)}`;
}

/** ゲスト向け CTA の文言。停止中は「無料で始める」ではなく「ログイン」。 */
export function getGuestEntryLabel(signupLabel: string, closedLabel = 'ログイン'): string {
  return NEW_USER_SIGNUP_ENABLED ? signupLabel : closedLabel;
}

/**
 * OAuth コールバックで「このサインインでアカウントが新しく作られた」とみなす窓。
 * プロバイダから戻った瞬間に Supabase がユーザーを作り、すぐ `/auth/callback` に
 * 来るので、実際の差は数秒。既存ユーザーを巻き込まないよう短めに取る。
 */
export const FRESH_AUTH_USER_WINDOW_MS = 5 * 60 * 1000;

/**
 * `created_at` が今から `FRESH_AUTH_USER_WINDOW_MS` 以内なら新規作成とみなす。
 * `created_at` が無い・読めない場合は false (消す側に倒さない)。
 */
export function isFreshlyCreatedAuthUser(
  user: { created_at?: string | null } | null | undefined,
  nowMs: number = Date.now(),
): boolean {
  const raw = user?.created_at;
  if (!raw) return false;
  const createdAt = Date.parse(raw);
  if (Number.isNaN(createdAt)) return false;
  const age = nowMs - createdAt;
  return age >= -FRESH_AUTH_USER_WINDOW_MS && age <= FRESH_AUTH_USER_WINDOW_MS;
}
