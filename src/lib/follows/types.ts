import type { FriendProfile, FriendTimelineSession } from '@/lib/friends/types';

export type FollowStatus = 'active' | 'pending';

export type FollowRelationship = 'none' | 'following' | 'pending' | 'mutual';

export type FollowSummary = {
  id: string;
  followerId: string;
  followingId: string;
  status: FollowStatus;
  createdAt: string;
  respondedAt: string | null;
  readAt: string | null;
  profile: FriendProfile;
};

export type FollowNotification = {
  id: string;
  /** 元のフォロー。フォローが外れた後も通知は残るので、そのときは null */
  followId: string | null;
  status: FollowStatus;
  createdAt: string;
  readAt: string | null;
  profile: FriendProfile;
};

export type FollowSearchResult = FriendProfile & {
  isPublic: boolean;
  relationship: FollowRelationship;
  followId: string | null;
};

export type FollowsHomePayload = {
  profile: FriendProfile;
  following: FollowSummary[];
  followers: FollowSummary[];
  pendingIncoming: FollowSummary[];
  pendingOutgoing: FollowSummary[];
};

export type FollowTimelinePayload = {
  sessions: FriendTimelineSession[];
};
