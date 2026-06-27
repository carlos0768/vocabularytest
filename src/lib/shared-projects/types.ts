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
  ownerUsername?: string | null;
  ownerAccountId?: string | null;
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
};

export type StudyGroupsPayload = {
  groups: StudyGroupSummary[];
};

export type StudyGroupProjectListPayload = {
  group: StudyGroupSummary;
  projects: SharedProjectCard[];
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
  visibility: 'public';
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
