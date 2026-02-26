import type { Project, Word } from '@/types';
import { getDb } from '@/lib/db/dexie';
import { remoteRepository } from '@/lib/db/remote-repository';
import { getRecentVisitedProjectIds } from '@/lib/project-visit';

const OFFLINE_PROJECT_CACHE_KEY = 'merken_offline_project_cache_v1';
const PROJECT_CACHE_COOLDOWN_MS = 10 * 60 * 1000;

type CacheMap = Record<string, number>;

function readCacheMap(): CacheMap {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(OFFLINE_PROJECT_CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as CacheMap;
  } catch {
    return {};
  }
}

function writeCacheMap(map: CacheMap) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(OFFLINE_PROJECT_CACHE_KEY, JSON.stringify(map));
  } catch {
    // ignore
  }
}

function makeCacheKey(userId: string, projectId: string) {
  return `${userId}:${projectId}`;
}

function shouldRefreshProject(userId: string, projectId: string, now: number): boolean {
  const map = readCacheMap();
  const key = makeCacheKey(userId, projectId);
  const last = map[key] ?? 0;
  return now - last >= PROJECT_CACHE_COOLDOWN_MS;
}

function markProjectsRefreshed(userId: string, projectIds: string[], now: number) {
  if (projectIds.length === 0) return;
  const map = readCacheMap();
  for (const projectId of projectIds) {
    map[makeCacheKey(userId, projectId)] = now;
  }
  writeCacheMap(map);
}

async function cacheProjectsToIndexedDb(projects: Project[], wordsByProject: Record<string, Word[]>) {
  if (projects.length === 0) return;
  const db = getDb();
  const projectIds = projects.map((project) => project.id);
  const words = projectIds.flatMap((projectId) => wordsByProject[projectId] ?? []);

  await db.transaction('rw', db.projects, db.words, async () => {
    await db.projects.bulkPut(projects.map((project) => ({ ...project, isSynced: true })));
    await db.words.where('projectId').anyOf(projectIds).delete();
    if (words.length > 0) {
      await db.words.bulkPut(words);
    }
  });
}

export async function prefetchRecentProjectsForOffline(userId: string, limit: number = 5): Promise<void> {
  if (typeof window === 'undefined' || !navigator.onLine || !userId) return;

  const recentIds = getRecentVisitedProjectIds(limit);
  if (recentIds.length === 0) return;

  const now = Date.now();
  const targetIds = recentIds.filter((projectId) => shouldRefreshProject(userId, projectId, now));
  if (targetIds.length === 0) return;

  try {
    const projects = await remoteRepository.getProjects(userId);
    const projectMap = new Map(projects.map((project) => [project.id, project]));
    const ownedTargetProjects = targetIds
      .map((projectId) => projectMap.get(projectId))
      .filter((project): project is Project => Boolean(project));
    if (ownedTargetProjects.length === 0) return;

    const ownedTargetIds = ownedTargetProjects.map((project) => project.id);
    const wordsByProject = await remoteRepository.getAllWordsByProjectIds(ownedTargetIds);
    await cacheProjectsToIndexedDb(ownedTargetProjects, wordsByProject);
    markProjectsRefreshed(userId, ownedTargetIds, now);
  } catch (error) {
    console.error('[OfflinePrefetch] Failed to prefetch recent projects:', error);
  }
}

export async function cacheProjectForOffline(userId: string, projectId: string): Promise<void> {
  if (typeof window === 'undefined' || !navigator.onLine || !userId || !projectId) return;
  const now = Date.now();
  if (!shouldRefreshProject(userId, projectId, now)) return;

  try {
    const project = await remoteRepository.getProject(projectId);
    if (!project || project.userId !== userId) return;
    const words = await remoteRepository.getWords(projectId);
    await cacheProjectsToIndexedDb([project], { [projectId]: words });
    markProjectsRefreshed(userId, [projectId], now);
  } catch (error) {
    console.error('[OfflinePrefetch] Failed to cache project:', error);
  }
}
