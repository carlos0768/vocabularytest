import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { createRouteHandlerClient } from '@/lib/supabase/route-client';
import { isActiveProSubscription } from '@/lib/subscription/status';

type ProAuthSuccess = {
  ok: true;
  supabase: SupabaseClient;
  user: User;
};

type ProAuthFailure = {
  ok: false;
  response: NextResponse;
};

export async function requireProUser(request: NextRequest): Promise<ProAuthSuccess | ProAuthFailure> {
  const supabase = await createRouteHandlerClient(request);
  const authHeader = request.headers.get('authorization');
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const { data: { user }, error: authError } = bearerToken
    ? await supabase.auth.getUser(bearerToken)
    : await supabase.auth.getUser();

  if (authError || !user) {
    return {
      ok: false,
      response: NextResponse.json({ success: false, error: '認証が必要です' }, { status: 401 }),
    };
  }

  const { data: subscription } = await supabase
    .from('subscriptions')
    .select('status, plan, pro_source, test_pro_expires_at, current_period_end')
    .eq('user_id', user.id)
    .single();

  const isPro = isActiveProSubscription({
    status: subscription?.status,
    plan: subscription?.plan,
    proSource: subscription?.pro_source,
    testProExpiresAt: subscription?.test_pro_expires_at,
    currentPeriodEnd: subscription?.current_period_end,
  });

  if (!isPro) {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: 'この機能はPro限定です。', code: 'PRO_REQUIRED' },
        { status: 403 },
      ),
    };
  }

  return { ok: true, supabase, user };
}
