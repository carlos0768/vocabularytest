import type { Project, Word } from '@/types';

export type SharedProjectAccessRole = 'owner' | 'editor' | 'viewer';
export type StudyGroupMembershipRole = 'owner' | 'member';

export type SharedProjectCard = {
  project: Project;
  accessRole: SharedProjectAccessRole;
  wordCount?: number;
  collaboratorCount?: number;
  likeCount?: number;
  ownerUsername?: string | null;
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
