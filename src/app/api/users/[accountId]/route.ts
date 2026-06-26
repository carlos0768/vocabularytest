import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser } from '@/app/api/shared-projects/shared';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { resolvePublicProfile } from '@/lib/follows/server';
import { getPublicUserStats } from '@/lib/profile/stats-server';

type RouteContext = {
  params: Promise<{ accountId: string }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await requireAuthenticatedUser(request);
  if (!auth.ok) return auth.response;

  const { accountId: rawAccountId } = await context.params;
  const accountId = rawAccountId?.trim();
  if (!accountId) {
    return NextResponse.json({ success: false, error: 'missing_account_id' }, { status: 400 });
  }

  try {
    const admin = getSupabaseAdmin();
    const profile = await resolvePublicProfile(accountId, admin);
    if (!profile) {
      return NextResponse.json({ success: false, error: 'user_not_found' }, { status: 404 });
    }

    const userId = profile.userId;
    const isSelf = userId === auth.user.id;

    const [stats, createdAtRow, followingCount, followersCount, friendsCount] = await Promise.all([
      getPublicUserStats(userId, admin),
      admin
        .from('profiles')
        .select('created_at')
        .eq('user_id', userId)
        .maybeSingle<{ created_at: string | null }>(),
      admin
        .from('user_follows')
        .select('id', { count: 'exact', head: true })
        .eq('follower_id', userId)
        .eq('status', 'active'),
      admin
        .from('user_follows')
        .select('id', { count: 'exact', head: true })
        .eq('following_id', userId)
        .eq('status', 'active'),
      admin
        .from('user_friendships')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'accepted')
        .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`),
    ]);

    return NextResponse.json({
      success: true,
      isSelf,
      profile,
      joinedAt: createdAtRow.data?.created_at ?? null,
      counts: {
        following: followingCount.count ?? 0,
        followers: followersCount.count ?? 0,
        friends: friendsCount.count ?? 0,
      },
      stats,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'profile_fetch_failed' },
      { status: 500 },
    );
  }
}
