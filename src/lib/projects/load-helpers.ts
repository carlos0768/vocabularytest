import type { Project, Word } from '@/types';
import { summarizeWordMemory } from '@/lib/words/memory';

export interface ProjectWithStats extends Project {
  totalWords: number;
  masteredWords: number;
  progress: number;
  lastUsedAt: string | null; // Most recent lastReviewedAt among words, or null
}

export interface WordReadRepository {
  getWords(projectId: string): Promise<Word[]>;
  getAllWordsByProjectIds?: (projectIds: string[]) => Promise<Record<string, Word[]>>;
  getAllWordsByProject?: (projectIds: string[]) => Promise<Record<string, Word[]>>;
}

function withAllProjectKeys(
  projectIds: string[],
  wordsByProject: Record<string, Word[]>
): Record<string, Word[]> {
  const normalized: Record<string, Word[]> = {};
  for (const projectId of projectIds) {
    normalized[projectId] = wordsByProject[projectId] ?? [];
  }
  return normalized;
}

function summarizeLoadError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (error && typeof error === 'object') {
    const record = error as Record<string, unknown>;
    const parts = [
      typeof record.code === 'string' ? record.code : undefined,
      typeof record.message === 'string' ? record.message : undefined,
      typeof record.details === 'string' ? record.details : undefined,
      typeof record.hint === 'string' ? record.hint : undefined,
    ].filter(Boolean);
    if (parts.length > 0) return parts.join(' | ');
  }

  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

export async function getWordsByProjectMap(
  repository: WordReadRepository,
  projectIds: string[]
): Promise<Record<string, Word[]>> {
  const uniqueProjectIds = [...new Set(projectIds)];
  if (uniqueProjectIds.length === 0) return {};

  if (repository.getAllWordsByProjectIds) {
    try {
      const wordsByProject = await repository.getAllWordsByProjectIds(uniqueProjectIds);
      return withAllProjectKeys(uniqueProjectIds, wordsByProject);
    } catch (error) {
      console.warn('[load-helpers] getAllWordsByProjectIds failed; falling back to local bulk/per-project word loads', error);
    }
  }

  if (repository.getAllWordsByProject) {
    try {
      const wordsByProject = await repository.getAllWordsByProject(uniqueProjectIds);
      return withAllProjectKeys(uniqueProjectIds, wordsByProject);
    } catch (error) {
      console.warn('[load-helpers] getAllWordsByProject failed; falling back to per-project word loads', error);
    }
  }

  const wordsArrays = await Promise.allSettled(
    uniqueProjectIds.map((projectId) => repository.getWords(projectId))
  );
  const wordsByProject: Record<string, Word[]> = {};
  uniqueProjectIds.forEach((projectId, index) => {
    const result = wordsArrays[index];
    if (result?.status === 'fulfilled') {
      wordsByProject[projectId] = result.value ?? [];
      return;
    }

    const summary = summarizeLoadError(result?.reason);
    console.warn(`[load-helpers] getWords failed for project ${projectId}: ${summary}; using an empty word list`, {
      projectId,
      summary,
      error: result?.reason,
    });
    wordsByProject[projectId] = [];
  });

  return withAllProjectKeys(uniqueProjectIds, wordsByProject);
}

export function buildProjectStats(
  projects: Project[],
  wordsByProject: Record<string, Word[]>
): ProjectWithStats[] {
  return projects.map((project) => {
    const words = wordsByProject[project.id] ?? [];
    const memorySummary = summarizeWordMemory(words);
    const masteredWords = memorySummary.mastered;
    const totalWords = memorySummary.total;
    const progress = totalWords > 0 ? Math.round((masteredWords / totalWords) * 100) : 0;

    let lastUsedAt: string | null = null;
    for (const w of words) {
      if (w.lastReviewedAt && (!lastUsedAt || w.lastReviewedAt > lastUsedAt)) {
        lastUsedAt = w.lastReviewedAt;
      }
    }

    return {
      ...project,
      totalWords,
      masteredWords,
      progress,
      lastUsedAt,
    };
  });
}

export function mergeProjectsById<T extends { id: string }>(projects: T[]): T[] {
  const seen = new Set<string>();
  const merged: T[] = [];

  for (const project of projects) {
    if (seen.has(project.id)) continue;
    seen.add(project.id);
    merged.push(project);
  }

  return merged;
}
