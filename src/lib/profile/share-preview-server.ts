import { cache } from 'react';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { resolvePublicProfile } from '@/lib/follows/server';
import { normalizeAccountIdInput } from '@/lib/friends/server';
import { getPublicUserStats } from '@/lib/profile/stats-server';
import type { ProfileSharePreview } from '@/lib/profile/share';

/**
 * プロフィールのシェア画像・メタデータ用の情報を読む。
 *
 * 鍵アカウント(is_public = false)でも出す(プロダクト判断)。
 * 見つからないアカウントでは null を返し、呼び出し側は汎用のカードを出す。
 */
export const getProfileSharePreview = cache(async (rawAccountId: string): Promise<ProfileSharePreview | null> => {
  let decoded = rawAccountId;
  try {
    decoded = decodeURIComponent(rawAccountId);
  } catch {
    // 不正なエスケープはそのまま正規化に回す(英数字以外は落ちる)
  }
  const accountId = normalizeAccountIdInput(decoded);
  if (!accountId) return null;

  try {
    const admin = getSupabaseAdmin();
    const profile = await resolvePublicProfile(accountId, admin);
    if (!profile) return null;

    const stats = await getPublicUserStats(profile.userId, admin);
    return {
      name: profile.username?.trim() || `@${profile.accountId}`,
      accountId: profile.accountId,
      avatarUrl: profile.avatarUrl,
      streakDays: stats?.quizStats.streakDays ?? 0,
      totalWords: stats?.totalWords ?? 0,
      masteredWords: stats?.masteredWords ?? 0,
    };
  } catch (error) {
    console.warn('Profile share preview failed:', error);
    return null;
  }
});
