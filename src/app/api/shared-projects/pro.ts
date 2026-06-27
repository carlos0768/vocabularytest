import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { isActiveProSubscription } from '@/lib/subscription/status';

type SupabaseAdminClient = ReturnType<typeof getSupabaseAdmin>;

export async function isUserActivePro(
  userId: string,
  admin: SupabaseAdminClient = getSupabaseAdmin(),
): Promise<boolean> {
  const { data, error } = await admin
    .from('subscriptions')
    .select('status,plan,pro_source,test_pro_expires_at,current_period_end')
    .eq('user_id', userId)
    .maybeSingle<Record<string, unknown>>();

  if (error) {
    throw new Error(error.message || 'shared_wordbook_subscription_lookup_failed');
  }

  return isActiveProSubscription({
    status: data?.status as string | null | undefined,
    plan: data?.plan as string | null | undefined,
    proSource: data?.pro_source as string | null | undefined,
    testProExpiresAt: data?.test_pro_expires_at as string | null | undefined,
    currentPeriodEnd: data?.current_period_end as string | null | undefined,
  });
}
