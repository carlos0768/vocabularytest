import type { Project, Word } from '@/types';

export interface ProjectWithStats extends Project {
  totalWords: number;
  masteredWords: number;
  progress: number;
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

export async function getWordsByProjectMap(
  repository: WordReadRepository,
  projectIds: string[]
): Promise<Record<string, Word[]>> {
  const uniqueProjectIds = [...new Set(projectIds)];
  if (uniqueProjectIds.length === 0) return {};

  if (repository.getAllWordsByProjectIds) {
    const wordsByProject = await repository.getAllWordsByProjectIds(uniqueProjectIds);
    return withAllProjectKeys(uniqueProjectIds, wordsByProject);
  }

  if (repository.getAllWordsByProject) {
    const wordsByProject = await repository.getAllWordsByProject(uniqueProjectIds);
    return withAllProjectKeys(uniqueProjectIds, wordsByProject);
  }

  const wordsArrays = await Promise.all(uniqueProjectIds.map((projectId) => repository.getWords(projectId)));
  const wordsByProject = Object.fromEntries(
    uniqueProjectIds.map((projectId, index) => [projectId, wordsArrays[index] ?? []])
  );

  return withAllProjectKeys(uniqueProjectIds, wordsByProject);
}

export function buildProjectStats(
  projects: Project[],
  wordsByProject: Record<string, Word[]>
): ProjectWithStats[] {
  return projects.map((project) => {
    const words = wordsByProject[project.id] ?? [];
    const masteredWords = words.filter((word) => word.status === 'mastered').length;
    const totalWords = words.length;
    const progress = totalWords > 0 ? Math.round((masteredWords / totalWords) * 100) : 0;

    return {
      ...project,
      totalWords,
      masteredWords,
      progress,
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
