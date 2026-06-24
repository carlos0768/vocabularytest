import type { Project, Word } from '@/types';
import { summarizeWordMemory } from '@/lib/words/memory';

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

export function countHomeWordStatuses(words: readonly Partial<Word>[]): HomeWordStatusCounts {
  const summary = summarizeWordMemory(words.map((word, index) => ({
    english: 'english' in word && typeof word.english === 'string' ? word.english : `word-${index}`,
    japanese: 'japanese' in word && typeof word.japanese === 'string' ? word.japanese : `word-${index}`,
    projectId: 'projectId' in word && typeof word.projectId === 'string' ? word.projectId : undefined,
    status: word.status,
    lexiconEntryId: 'lexiconEntryId' in word && typeof word.lexiconEntryId === 'string' ? word.lexiconEntryId : undefined,
    lexiconSenseId: 'lexiconSenseId' in word && typeof word.lexiconSenseId === 'string' ? word.lexiconSenseId : undefined,
    lexiconDistinctKey: 'lexiconDistinctKey' in word && typeof word.lexiconDistinctKey === 'string' ? word.lexiconDistinctKey : undefined,
    lexiconSenseIsPrimary: 'lexiconSenseIsPrimary' in word && typeof word.lexiconSenseIsPrimary === 'boolean' ? word.lexiconSenseIsPrimary : undefined,
  })));

  return {
    masteredTotal: summary.mastered,
    learningTotal: summary.learning,
    unlearnedTotal: summary.unlearned,
  };
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
