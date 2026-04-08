import { withWebAppBase } from './web-base-url';

export interface SharedProjectSummary {
  id: string;
  title: string;
  wordCount: number;
  ownerName: string | null;
  accessRole: 'owner' | 'viewer' | 'editor';
  shareScope?: 'public' | 'private';
}

export interface SharedProjectDetail {
  project: {
    id: string;
    title: string;
    shareScope: string;
    createdAt: string;
  };
  words: SharedWord[];
  accessRole: 'owner' | 'viewer';
  collaboratorCount: number;
}

export interface SharedWord {
  id: string;
  english: string;
  japanese: string;
  status: string;
  pronunciation?: string;
  exampleSentence?: string;
  exampleSentenceJa?: string;
  vocabularyType?: 'active' | 'passive';
  partOfSpeechTags?: string[];
}

// The API returns nested objects: { project: { id, title, ... }, accessRole, ownerUsername, wordCount }
// We flatten them into SharedProjectSummary for the UI.
interface RawSharedProjectCard {
  project?: {
    id?: string;
    title?: string;
    [key: string]: unknown;
  };
  accessRole?: string;
  ownerUsername?: string | null;
  wordCount?: number;
  collaboratorCount?: number;
  // Flat fallback fields (in case API ever returns flat)
  id?: string;
  title?: string;
  ownerName?: string | null;
}

function normalizeCard(raw: RawSharedProjectCard): SharedProjectSummary {
  const id = raw.project?.id ?? raw.id ?? '';
  const title = raw.project?.title ?? raw.title ?? '無題';
  const ownerName = raw.ownerUsername ?? raw.ownerName ?? null;
  const accessRole = (raw.accessRole ?? 'viewer') as SharedProjectSummary['accessRole'];
  const wordCount = raw.wordCount ?? 0;

  return { id, title, wordCount, ownerName, accessRole };
}

export async function fetchSharedProjects(
  token: string,
): Promise<{
  owned: SharedProjectSummary[];
  joined: SharedProjectSummary[];
  publicProjects: SharedProjectSummary[];
}> {
  const url = withWebAppBase('/api/shared-projects');
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    throw new Error(`共有単語帳の取得に失敗しました (${response.status})`);
  }

  const json = await response.json();

  return {
    owned: ((json.owned ?? []) as RawSharedProjectCard[]).map(normalizeCard),
    joined: ((json.joined ?? []) as RawSharedProjectCard[]).map(normalizeCard),
    publicProjects: ((json.publicProjects ?? json.public ?? []) as RawSharedProjectCard[]).map(normalizeCard),
  };
}

export async function fetchSharedProjectDetail(
  projectId: string,
  token: string,
): Promise<SharedProjectDetail> {
  const url = withWebAppBase(`/api/shared-projects/${projectId}`);
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    throw new Error(`共有単語帳の詳細取得に失敗しました (${response.status})`);
  }

  return response.json();
}
