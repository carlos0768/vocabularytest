import type { Project } from '@/types';

export type SharedProjectAccessRole = 'owner' | 'editor' | 'viewer';

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

export type SharedProjectMetrics = {
  wordCount: number;
  collaboratorCount: number;
  likeCount: number;
};

export type SharedProjectMetricsMap = Record<string, SharedProjectMetrics>;
