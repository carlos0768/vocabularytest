import { withWebAppBase } from './web-base-url';

export interface SharedProjectSummary {
  id: string;
  title: string;
  wordCount: number;
  ownerName: string | null;
  accessRole: 'owner' | 'viewer';
  shareScope: 'public' | 'private';
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

  return response.json();
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
