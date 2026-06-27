import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser } from '@/app/api/shared-projects/shared';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { resolvePublicProfile, getProfilesByUserIds, getFollowRelationship } from '@/lib/follows/server';
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

    const [stats, createdAtRow, followingRows, followersRows, friendsCount, relationship] = await Promise.all([
      getPublicUserStats(userId, admin),
      admin
        .from('profiles')
        .select('created_at')
        .eq('user_id', userId)
        .maybeSingle<{ created_at: string | null }>(),
      admin
        .from('user_follows')
        .select('following_id')
        .eq('follower_id', userId)
        .eq('status', 'active'),
      admin
        .from('user_follows')
        .select('follower_id')
        .eq('following_id', userId)
        .eq('status', 'active'),
      admin
        .from('user_friendships')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'accepted')
        .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`),
      isSelf
        ? Promise.resolve({ relationship: 'none' as const, followId: null })
        : getFollowRelationship(auth.user.id, userId, admin),
    ]);

    const followingIds = (followingRows.data ?? []).map((r) => (r as { following_id: string }).following_id);
    const followerIds = (followersRows.data ?? []).map((r) => (r as { follower_id: string }).follower_id);
    const profilesById = await getProfilesByUserIds([...followingIds, ...followerIds], admin);
    const following = followingIds.map((id) => profilesById.get(id)).filter(Boolean);
    const followers = followerIds.map((id) => profilesById.get(id)).filter(Boolean);

    return NextResponse.json({
      success: true,
      isSelf,
      profile,
      relationship: relationship.relationship,
      followId: relationship.followId,
      joinedAt: createdAtRow.data?.created_at ?? null,
      counts: {
        following: followingIds.length,
        followers: followerIds.length,
        friends: friendsCount.count ?? 0,
      },
      following,
      followers,
      stats,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'profile_fetch_failed' },
      { status: 500 },
    );
  }
}
