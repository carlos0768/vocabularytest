import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createRouteHandlerClient } from '@/lib/supabase/route-client';

export type CustomScanModeAuth =
  | { ok: true; supabase: SupabaseClient; userId: string }
  | { ok: false; response: NextResponse };

/**
 * カスタム抽出モードAPIの共通認証。Cookieセッションと Bearer トークンの
 * どちらでも通す（Web / ネイティブ両対応）。以降のクエリはRLS配下で走る。
 */
export async function authenticateCustomScanModeRequest(
  request: NextRequest,
): Promise<CustomScanModeAuth> {
  const supabase = await createRouteHandlerClient(request);
  const authHeader = request.headers.get('authorization');
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const { data: { user }, error } = bearerToken
    ? await supabase.auth.getUser(bearerToken)
    : await supabase.auth.getUser();

  if (error || !user) {
    return {
      ok: false,
      response: NextResponse.json({ error: '認証が必要です' }, { status: 401 }),
    };
  }

  return { ok: true, supabase, userId: user.id };
}
