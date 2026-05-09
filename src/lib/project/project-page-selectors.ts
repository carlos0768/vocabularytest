import type { VocabularyType, WordStatus } from '@/types';

export type ProjectWordSortOrder = 'createdAsc' | 'alphabetical' | 'statusAsc';
export type ProjectWordActivenessFilter = 'all' | 'active' | 'passive';

export interface ProjectWordStats {
  total: number;
  mastered: number;
  learning: number;
  unlearned: number;
}

export interface ProjectWordFilterState {
  bookmark: boolean;
  activeness: ProjectWordActivenessFilter;
  partOfSpeech: string | null;
}

export interface ProjectWordFilterOptions extends ProjectWordFilterState {
  searchText: string;
  sortOrder: ProjectWordSortOrder;
}

export interface ProjectPageWord {
  english: string;
  japanese: string;
  createdAt: string;
  status?: WordStatus;
  isFavorite?: boolean;
  vocabularyType?: VocabularyType | null;
  partOfSpeechTags?: string[];
}

const STATUS_SORT_ORDER: Record<WordStatus, number> = {
  new: 0,
  review: 1,
  mastered: 2,
};

const POS_LABELS: Record<string, string> = {
  noun: '名',
  verb: '動',
  adjective: '形',
  adverb: '副',
  phrase: '句',
  idiom: '熟',
  phrasal_verb: '句',
};

export function countProjectWordStats(words: readonly Pick<ProjectPageWord, 'status'>[]): ProjectWordStats {
  let mastered = 0;
  let learning = 0;
  let unlearned = 0;

  for (const word of words) {
    if (word.status === 'mastered') {
      mastered++;
    } else if (word.status === 'review') {
      learning++;
    } else {
      unlearned++;
    }
  }

  return {
    total: words.length,
    mastered,
    learning,
    unlearned,
  };
}

export function isProjectWordFilterActive(filters: ProjectWordFilterState): boolean {
  return filters.bookmark || filters.activeness !== 'all' || filters.partOfSpeech !== null;
}

export function selectFilteredProjectWords<T extends ProjectPageWord>(
  words: readonly T[],
  options: ProjectWordFilterOptions,
): T[] {
  let result = [...words];

  if (options.searchText) {
    const query = options.searchText.toLowerCase();
    result = result.filter(
      (word) =>
        word.english.toLowerCase().includes(query) ||
        word.japanese.toLowerCase().includes(query),
    );
  }

  if (options.bookmark) {
    result = result.filter((word) => word.isFavorite);
  }

  if (options.partOfSpeech) {
    const partOfSpeech = options.partOfSpeech.toLowerCase();
    result = result.filter((word) =>
      word.partOfSpeechTags?.some((tag) => tag.toLowerCase().includes(partOfSpeech)),
    );
  }

  if (options.activeness === 'active') {
    result = result.filter((word) => word.vocabularyType === 'active');
  } else if (options.activeness === 'passive') {
    result = result.filter((word) => word.vocabularyType === 'passive');
  }

  if (options.sortOrder === 'alphabetical') {
    return [...result].sort((a, b) =>
      a.english.localeCompare(b.english, undefined, { sensitivity: 'base' }),
    );
  }

  if (options.sortOrder === 'statusAsc') {
    return [...result].sort(
      (a, b) => (STATUS_SORT_ORDER[a.status ?? 'new'] ?? 0) - (STATUS_SORT_ORDER[b.status ?? 'new'] ?? 0),
    );
  }

  return [...result].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
}

export function selectAvailableProjectPartsOfSpeech(
  words: readonly Pick<ProjectPageWord, 'partOfSpeechTags'>[],
): string[] {
  const all = words.flatMap((word) => word.partOfSpeechTags ?? []);
  const trimmed = all.map((tag) => tag.trim()).filter(Boolean);
  return [...new Set(trimmed)].sort();
}

export function getProjectPartOfSpeechLabel(tags?: readonly string[]): string | null {
  if (!tags || tags.length === 0) return null;
  return POS_LABELS[tags[0]] || tags[0].slice(0, 1);
}
