import type { Project, Word } from '@/types';

export type SharedProjectAccessRole = 'owner' | 'editor' | 'viewer';
export type StudyGroupMembershipRole = 'owner' | 'member';
export type StudyGroupVisibility = 'private' | 'public';
export type SharedDiscoverCategory = 'all' | 'users' | 'projects';

export type SharedProjectCard = {
  project: Project;
  accessRole: SharedProjectAccessRole;
  wordCount?: number;
  collaboratorCount?: number;
  likeCount?: number;
  /** 共有単語帳がインポートされた回数 (人気ランキングに使用) */
  importCount?: number;
  ownerUsername?: string | null;
  ownerAccountId?: string | null;
  sharedGroupId?: string;
  sharedByCurrentUser?: boolean;
  canRemoveFromGroup?: boolean;
};

export type SharedProjectSummary = SharedProjectCard & {
  wordCount: number;
  collaboratorCount: number;
};

export type AccessibleSharedProjectListPayload = {
  owned: SharedProjectCard[];
  joined: SharedProjectCard[];
};

export type PublicSharedProjectListPayload = {
  items: SharedProjectCard[];
  nextCursor: string | null;
};

export type SharedProjectPreviewPayload = {
  project: Project;
  words: Word[];
  totalWordCount: number;
  likeCount: number;
  ownerUsername: string | null;
  ownerAccountId: string | null;
};

export type SharedProjectMetrics = {
  wordCount: number;
  collaboratorCount: number;
  likeCount: number;
};

export type SharedProjectMetricsMap = Record<string, SharedProjectMetrics>;

/** グループ一覧カードに出す今週のランキング上位者（軽量版） */
export type StudyGroupTopMember = {
  userId: string;
  username: string | null;
  accountId: string | null;
  quizCount: number;
  isViewer: boolean;
};

export type StudyGroupSummary = {
  id: string;
  name: string;
  inviteCode: string;
  role: StudyGroupMembershipRole;
  visibility: StudyGroupVisibility;
  memberCount: number;
  projectCount: number;
  createdAt: string;
  ownerUsername?: string | null;
  projectShared?: boolean;
  /** 今週のランキング上位（最大3人）。一覧APIのみ設定するbest-effort項目 */
  topMembers?: StudyGroupTopMember[];
};

export type StudyGroupsPayload = {
  groups: StudyGroupSummary[];
};

export type StudyGroupProjectListPayload = {
  group: StudyGroupSummary;
  projects: SharedProjectCard[];
};

export type StudyGroupLeaderboardEntry = {
  userId: string;
  username: string | null;
  accountId: string | null;
  quizCount: number;
  masteredCount: number;
  isViewer: boolean;
};

export type StudyGroupMissedWord = {
  englishKey: string;
  english: string;
  japanese: string;
  missCount: number;
};

export type StudyGroupStrugglingWord = {
  key: string;
  wordId: string;
  projectId: string;
  english: string;
  japanese: string;
  wrongCount: number;
  learnerCount: number;
  lastWrongAt: string;
};

export type StudyGroupStrugglingWordsPayload = {
  group: StudyGroupSummary;
  words: StudyGroupStrugglingWord[];
  totalCount: number;
};

export type StudyGroupMember = {
  userId: string;
  username: string | null;
  accountId: string | null;
  role: StudyGroupMembershipRole;
  isViewer: boolean;
};

export type StudyGroupOverviewPayload = {
  group: StudyGroupSummary;
  projects: SharedProjectCard[];
  members: StudyGroupMember[];
  leaderboard: StudyGroupLeaderboardEntry[];
  missedWords: StudyGroupMissedWord[];
  missedWordsTotalCount?: number;
  viewerUserId: string;
};

export type StudyGroupFeedEvent = {
  id: string;
  groupId: string;
  groupName: string;
  eventType: 'project_added';
  projectId: string | null;
  projectTitle: string;
  actorUserId: string | null;
  actorName: string | null;
  createdAt: string;
};

export type SharedUserSummary = {
  userId: string;
  username: string | null;
  accountId: string | null;
  projectCount: number;
  wordCount: number;
  likeCount: number;
};

export type PublicStudyGroupSummary = {
  id: string;
  name: string;
  visibility: StudyGroupVisibility;
  memberCount: number;
  projectCount: number;
  createdAt: string;
  ownerUsername?: string | null;
};

export type SharedDiscoverPayload = {
  category: SharedDiscoverCategory;
  users: SharedUserSummary[];
  projects: SharedProjectCard[];
  groups: PublicStudyGroupSummary[];
  nextCursor: string | null;
};
