import type { FriendProfile } from '@/lib/friends/types';

/**
 * ホームのカード列で「今日クイズを解いた人」の後ろ（または代わり）に並べる、フォローのおすすめ。
 *
 * 候補の出どころと優先順（インスタの「おすすめ」と同じ考え方）:
 *  1. フォロー中の人がフォローしている人（共通のフォロー数が多い順）
 *  2. フレンド（承認済み）なのにまだフォローしていない人
 *  3. 同じ学習グループのメンバー
 * 自分・フォロー済み・フォローリクエスト中の人は出さない。
 */

export type FollowSuggestionReason = 'mutual' | 'friend' | 'group';

export type FollowSuggestion = {
  userId: string;
  profile: FriendProfile;
  reason: FollowSuggestionReason;
  /** reason='mutual' のとき、その人をフォローしているフォロー中の人数。 */
  mutualCount: number;
};

export type RankedFollowSuggestion = Omit<FollowSuggestion, 'profile'>;

export const FOLLOW_SUGGESTION_LIMIT = 12;

export function rankFollowSuggestions({
  viewerId,
  excludedUserIds,
  secondDegreeFollowingIds,
  friendIds,
  groupMemberIds,
  limit = FOLLOW_SUGGESTION_LIMIT,
}: {
  viewerId: string;
  /** すでにフォロー済み・リクエスト中の相手。 */
  excludedUserIds: Iterable<string>;
  /** フォロー中の人それぞれがフォローしている相手（重複あり。出現回数＝共通のフォロー数）。 */
  secondDegreeFollowingIds: readonly string[];
  friendIds: readonly string[];
  groupMemberIds: readonly string[];
  limit?: number;
}): RankedFollowSuggestion[] {
  const excluded = new Set(excludedUserIds);
  excluded.add(viewerId);

  const mutualCounts = new Map<string, number>();
  for (const id of secondDegreeFollowingIds) {
    if (excluded.has(id)) continue;
    mutualCounts.set(id, (mutualCounts.get(id) ?? 0) + 1);
  }

  const ranked: RankedFollowSuggestion[] = [...mutualCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([userId, mutualCount]) => ({ userId, reason: 'mutual' as const, mutualCount }));

  const seen = new Set(ranked.map((item) => item.userId));
  const pushFallback = (ids: readonly string[], reason: FollowSuggestionReason) => {
    for (const userId of ids) {
      if (excluded.has(userId) || seen.has(userId)) continue;
      seen.add(userId);
      ranked.push({ userId, reason, mutualCount: 0 });
    }
  };
  pushFallback(friendIds, 'friend');
  pushFallback(groupMemberIds, 'group');

  return ranked.slice(0, Math.max(0, limit));
}

/** カードの名前の下に出す一言。 */
export function followSuggestionLabel(suggestion: Pick<FollowSuggestion, 'reason' | 'mutualCount'>): string {
  if (suggestion.reason === 'mutual') return `共通のフォロー${suggestion.mutualCount}人`;
  if (suggestion.reason === 'friend') return 'フレンド';
  return '同じグループ';
}
