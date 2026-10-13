import type { FriendProfile } from '@/lib/friends/types';

/** 表示名。ユーザー名が無ければ @accountId。 */
export function displayName(profile: Pick<FriendProfile, 'username' | 'accountId'>): string {
  return profile.username?.trim() || `@${profile.accountId}`;
}
