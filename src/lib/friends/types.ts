export type FriendProfile = {
  userId: string;
  username: string | null;
  accountId: string;
  /** アカウントアイコン(正方形 JPEG の data URL)。未設定なら null。 */
  avatarUrl: string | null;
};

export type FriendshipStatus = 'pending' | 'accepted';

export type FriendshipSummary = {
  id: string;
  status: FriendshipStatus;
  requesterId: string;
  addresseeId: string;
  createdAt: string;
  respondedAt: string | null;
  profile: FriendProfile;
};

export type FriendSearchRelationship = 'none' | 'friend' | 'incoming' | 'outgoing';

export type FriendSearchResult = FriendProfile & {
  relationship: FriendSearchRelationship;
  friendshipId: string | null;
};

export type QuizSessionWordSummary = {
  id: string;
  wordId: string;
  projectId: string | null;
  english: string;
  japanese: string;
  masteredAt: string;
};

export type FriendTimelineSession = {
  id: string;
  userId: string;
  profile: FriendProfile;
  startedAt: string;
  expiresAt: string;
  lastAnsweredAt: string;
  answerCount: number;
  masteredCount: number;
  words: QuizSessionWordSummary[];
};

export type FriendsHomePayload = {
  profile: FriendProfile;
  friends: FriendshipSummary[];
  incoming: FriendshipSummary[];
  outgoing: FriendshipSummary[];
};
