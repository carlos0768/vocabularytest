import type { NextRequest } from 'next/server';
import { createRouteHandlerClient } from '@/lib/supabase/route-client';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { getBearerToken } from '@/lib/api/bearer-token';

export type AuthenticatedUser = {
  id: string;
};

/**
 * Bearer トークン (あれば) か Cookie セッションでログインユーザーを解決する。
 * 検証はリクエストスコープの client で行う。
 */
export async function resolveAuthenticatedUser(request: NextRequest): Promise<AuthenticatedUser | null> {
  const supabase = await createRouteHandlerClient(request);
  const bearerToken = getBearerToken(request);

  const { data: { user }, error } = bearerToken
    ? await supabase.auth.getUser(bearerToken)
    : await supabase.auth.getUser();

  if (error || !user) return null;

  return { id: user.id };
}

/** `resolveAuthenticatedUser` のユーザーIDだけを返す版。 */
export async function resolveUserId(request: NextRequest): Promise<string | null> {
  const user = await resolveAuthenticatedUser(request);
  return user?.id ?? null;
}

/**
 * Bearer トークン必須の認証。トークンは service-role client で検証する
 * (Cookie セッションは見ない)。
 */
export async function authenticateBearerUser(request: NextRequest): Promise<{ userId: string } | null> {
  const token = getBearerToken(request);
  if (token === null) {
    return null;
  }

  const { data: { user }, error } = await getSupabaseAdmin().auth.getUser(token);

  if (error || !user) {
    return null;
  }

  return { userId: user.id };
}
