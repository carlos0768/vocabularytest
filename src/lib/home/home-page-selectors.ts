import type { Project, Word } from '@/types';

export interface HomeWordStatusCounts {
  masteredTotal: number;
  learningTotal: number;
  unlearnedTotal: number;
}

export interface HomeProjectSections {
  homeSharedProjects: Project[];
  homeMyProjects: Project[];
  showSharedProjectsSection: boolean;
}

const HOME_PROJECT_LIMIT = 8;

export function countHomeWordStatuses(words: readonly Pick<Word, 'status'>[]): HomeWordStatusCounts {
  let masteredTotal = 0;
  let learningTotal = 0;
  let unlearnedTotal = 0;

  for (const word of words) {
    if (word.status === 'mastered') {
      masteredTotal++;
    } else if (word.status === 'review') {
      learningTotal++;
    } else {
      unlearnedTotal++;
    }
  }

  return { masteredTotal, learningTotal, unlearnedTotal };
}

export function calculateHomeCompletionPercent(masteredTotal: number, totalWords: number): number {
  return totalWords > 0 ? Math.round((masteredTotal / totalWords) * 100) : 0;
}

export function selectHomeProjectSections(projects: readonly Project[]): HomeProjectSections {
  const homeSharedProjects = selectHomeProjectsByShareState(projects, true);
  const homeMyProjects = selectHomeProjectsByShareState(projects, false);

  return {
    homeSharedProjects,
    homeMyProjects,
    showSharedProjectsSection: homeSharedProjects.length > 0,
  };
}

function selectHomeProjectsByShareState(projects: readonly Project[], importedFromShare: boolean): Project[] {
  return [...projects]
    .filter((project) => Boolean(project.importedFromShareId) === importedFromShare)
    .sort(compareHomeProjects)
    .slice(0, HOME_PROJECT_LIMIT);
}

function compareHomeProjects(a: Project, b: Project): number {
  if (a.isFavorite && !b.isFavorite) return -1;
  if (!a.isFavorite && b.isFavorite) return 1;
  return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
}
