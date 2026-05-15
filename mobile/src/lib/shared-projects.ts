import AsyncStorage from '@react-native-async-storage/async-storage';
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
  relatedWords?: ({ term?: string; word?: string; relation?: string; noteJa?: string } | string)[];
  usagePatterns?: { pattern?: string; meaningJa?: string; example?: string; exampleJa?: string; register?: string }[];
}

export interface SharedProjectsPayload {
  owned: SharedProjectSummary[];
  joined: SharedProjectSummary[];
  publicProjects: SharedProjectSummary[];
}

// The API returns nested objects: { project: { id, title, ... }, accessRole, ownerUsername, wordCount }
// We flatten them into SharedProjectSummary for the UI.
interface RawSharedProjectCard {
  project?: {
    id?: string;
    title?: string;
    shareScope?: 'public' | 'private';
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
  shareScope?: 'public' | 'private';
}

const SHARED_PROJECTS_CACHE_PREFIX = 'merken:shared-projects:v2';
const SHARED_PROJECT_DETAIL_CACHE_PREFIX = 'merken:shared-project-detail:v2';
const PUBLIC_PAGE_SIZE = 50;
const PUBLIC_PAGE_LIMIT = 20;

function normalizeCard(raw: RawSharedProjectCard): SharedProjectSummary {
  const id = raw.project?.id ?? raw.id ?? '';
  const title = raw.project?.title ?? raw.title ?? '無題';
  const ownerName = raw.ownerUsername ?? raw.ownerName ?? null;
  const accessRole = (raw.accessRole ?? 'viewer') as SharedProjectSummary['accessRole'];
  const wordCount = raw.wordCount ?? 0;
  const shareScope = raw.project?.shareScope ?? raw.shareScope;

  return { id, title, wordCount, ownerName, accessRole, shareScope };
}

function dedupeProjects(projects: SharedProjectSummary[]): SharedProjectSummary[] {
  const seen = new Set<string>();
  const result: SharedProjectSummary[] = [];
  for (const project of projects) {
    if (!project.id || seen.has(project.id)) continue;
    seen.add(project.id);
    result.push(project);
  }
  return result;
}

function listCacheKey(scope: string): string {
  return `${SHARED_PROJECTS_CACHE_PREFIX}:${scope}`;
}

function detailCacheKey(projectId: string): string {
  return `${SHARED_PROJECT_DETAIL_CACHE_PREFIX}:${projectId}`;
}

async function readJson<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : null;
  } catch {
    return null;
  }
}

async function writeJson(key: string, value: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Cache writes should never block the visible shared-bookshelf UI.
  }
}

export async function loadCachedSharedProjects(scope: string): Promise<SharedProjectsPayload | null> {
  return readJson<SharedProjectsPayload>(listCacheKey(scope));
}

async function saveCachedSharedProjects(scope: string, payload: SharedProjectsPayload): Promise<void> {
  await writeJson(listCacheKey(scope), payload);
}

export async function loadCachedSharedProjectDetail(projectId: string): Promise<SharedProjectDetail | null> {
  return readJson<SharedProjectDetail>(detailCacheKey(projectId));
}

async function saveCachedSharedProjectDetail(projectId: string, payload: SharedProjectDetail): Promise<void> {
  await writeJson(detailCacheKey(projectId), payload);
}

async function fetchAllPublicSharedProjects(token: string): Promise<SharedProjectSummary[]> {
  const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
  const all: SharedProjectSummary[] = [];
  let cursor: string | null = null;

  for (let page = 0; page < PUBLIC_PAGE_LIMIT; page += 1) {
    const query = new URLSearchParams({ limit: String(PUBLIC_PAGE_SIZE) });
    if (cursor) query.set('cursor', cursor);

    const response = await fetch(withWebAppBase(`/api/shared-projects/public?${query.toString()}`), { headers });
    if (!response.ok) {
      throw new Error(`公開単語帳の取得に失敗しました (${response.status})`);
    }

    const json = await response.json();
    const items = ((json.items ?? json.publicProjects ?? json.public ?? []) as RawSharedProjectCard[]).map(normalizeCard);
    all.push(...items);

    cursor = typeof json.nextCursor === 'string' && json.nextCursor.length > 0 ? json.nextCursor : null;
    if (!cursor) break;
  }

  return dedupeProjects(all);
}

export async function fetchSharedProjects(
  token: string,
  cacheScope = 'global',
): Promise<SharedProjectsPayload> {
  const url = withWebAppBase('/api/shared-projects');
  const [accessibleResponse, publicProjects] = await Promise.all([
    fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    }),
    fetchAllPublicSharedProjects(token),
  ]);

  if (!accessibleResponse.ok) {
    throw new Error(`共有単語帳の取得に失敗しました (${accessibleResponse.status})`);
  }

  const json = await accessibleResponse.json();
  const payload: SharedProjectsPayload = {
    owned: dedupeProjects(((json.owned ?? []) as RawSharedProjectCard[]).map(normalizeCard)),
    joined: dedupeProjects(((json.joined ?? []) as RawSharedProjectCard[]).map(normalizeCard)),
    publicProjects,
  };

  await saveCachedSharedProjects(cacheScope, payload);
  return payload;
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

  const detail = await response.json() as SharedProjectDetail;
  await saveCachedSharedProjectDetail(projectId, detail);
  return detail;
}
