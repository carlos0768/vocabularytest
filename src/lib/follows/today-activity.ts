import type { FriendProfile } from '@/lib/friends/types';

/**
 * 「今日クイズを解いたフォロー中のユーザー」を進歩ページ上部のカード列に出すための集計。
 *
 * 「今日」は JST の暦日で切る（コインの月境界・解き方の日付キーと同じ理由で、
 * 利用者は日本にいるため UTC で切ると朝9時に日付が変わってしまう）。
 */

export type FollowingTodayActivity = {
  userId: string;
  profile: FriendProfile;
  /** 今日解いた問題数（その日に回答があったセッションの answer_count の合計）。 */
  answerCount: number;
  lastAnsweredAt: string;
};

export type TodayActivitySessionRow = {
  user_id: string;
  last_answered_at: string;
  answer_count: number | string | null;
};

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** `now` が属する JST 暦日の 0:00 を UTC の ISO 文字列で返す。 */
export function jstDayStartIso(now: Date = new Date()): string {
  const jstMidnight = Math.floor((now.getTime() + JST_OFFSET_MS) / 86_400_000) * 86_400_000;
  return new Date(jstMidnight - JST_OFFSET_MS).toISOString();
}

/**
 * セッション行をユーザーごとに合算し、問題数が1以上の人だけを
 * 直近に解いた順で返す。`followingIds` に無いユーザー（自分など）は除く。
 *
 * セッションは30分区切りなので、0時をまたいだセッションは前日ぶんも含めて数える。
 */
export function aggregateFollowingTodayActivity(
  sessions: TodayActivitySessionRow[],
  followingIds: readonly string[],
  profilesByUserId: ReadonlyMap<string, FriendProfile>,
  dayStartIso: string,
  fallbackProfile: (userId: string) => FriendProfile,
): FollowingTodayActivity[] {
  const following = new Set(followingIds);
  const dayStart = new Date(dayStartIso).getTime();
  const byUser = new Map<string, { answerCount: number; lastAnsweredAt: string }>();

  for (const session of sessions) {
    if (!following.has(session.user_id)) continue;
    const answeredAt = new Date(session.last_answered_at).getTime();
    if (Number.isNaN(answeredAt) || answeredAt < dayStart) continue;
    const count = Number(session.answer_count ?? 0);
    if (!Number.isFinite(count) || count <= 0) continue;

    const current = byUser.get(session.user_id);
    if (!current) {
      byUser.set(session.user_id, { answerCount: count, lastAnsweredAt: session.last_answered_at });
      continue;
    }
    current.answerCount += count;
    if (answeredAt > new Date(current.lastAnsweredAt).getTime()) {
      current.lastAnsweredAt = session.last_answered_at;
    }
  }

  return [...byUser.entries()]
    .map(([userId, value]) => ({
      userId,
      profile: profilesByUserId.get(userId) ?? fallbackProfile(userId),
      answerCount: value.answerCount,
      lastAnsweredAt: value.lastAnsweredAt,
    }))
    .sort((a, b) => new Date(b.lastAnsweredAt).getTime() - new Date(a.lastAnsweredAt).getTime());
}
