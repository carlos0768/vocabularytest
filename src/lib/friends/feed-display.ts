import type { FriendProfile, FriendTimelineSession } from '@/lib/friends/types';
import type { StudyGroupFeedEvent } from '@/lib/shared-projects/types';

/** フィードに並ぶ1件分のエントリ（クイズ学習 or グループイベント）。 */
export type FeedEntry =
  | { kind: 'quiz'; sortAt: string; session: FriendTimelineSession }
  | { kind: 'group_event'; sortAt: string; event: StudyGroupFeedEvent };

// Site-wide avatar/thumbnail palette (matches home, collections, shared).
const THUMBS = ['#137FEC', '#664DB3', '#228B22', '#2E66BF', '#D97340', '#3373B3', '#CC4D59', '#3DA1B8'];

export function avatarColor(identifier: string): string {
  let hash = 0;
  for (let i = 0; i < identifier.length; i++) {
    hash = ((hash << 5) - hash + identifier.charCodeAt(i)) | 0;
  }
  return THUMBS[Math.abs(hash) % THUMBS.length];
}

export function displayName(profile: Pick<FriendProfile, 'username' | 'accountId'>): string {
  return profile.username?.trim() || `@${profile.accountId}`;
}

export function formatSessionTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('ja-JP', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** 「3時間前」形式の相対時刻。1週間より前は日付表記に落とす。 */
export function formatRelativeTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const minutes = Math.floor((Date.now() - date.getTime()) / 60_000);
  if (minutes < 1) return 'たった今';
  if (minutes < 60) return `${minutes}分前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}時間前`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}日前`;
  return date.toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' });
}
