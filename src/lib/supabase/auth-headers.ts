import { createClient as createBrowserClient } from './client';

/**
 * JSON API 呼び出し用の見出しに、ログイン中ならアクセストークンを載せる。
 *
 * Cookie だけに頼ると、ホーム画面に追加した iOS の PWA が Safari とは別の
 * 保存領域を持つために、ログイン済みでも 401 で弾かれることがある。
 * トークンが取れなければ Cookie に任せる (ここで投げると呼び出し側の処理ごと止まる)。
 */
export async function jsonHeadersWithAccessToken(): Promise<Record<string, string>> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  try {
    const { data: { session } } = await createBrowserClient().auth.getSession();
    if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
  } catch {
    // 取れなければ Cookie に任せる
  }
  return headers;
}
