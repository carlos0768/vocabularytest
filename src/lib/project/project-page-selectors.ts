import type { VocabularyType, WordStatus } from '@/types';
import { summarizeWordMemory } from '@/lib/words/memory';
import { compareWordsByPriority } from '@/lib/spaced-repetition';

// 'priority' はクイズ・フラッシュカードと同じ学習優先度順（sortWordsByPriority）。
export type ProjectWordSortOrder = 'priority' | 'createdAsc' | 'alphabetical' | 'statusAsc';
export type ProjectWordActivenessFilter = 'all' | 'active' | 'passive';

export interface ProjectWordStats {
  total: number;
  mastered: number;
  active: number;
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
  /**
   * 並べ替えに使う学習タグ (status / nextReviewAt) の凍結値。渡すと、一覧を
   * 開いた時点の値で並びが決まり、行の学習タグを押しても順番が動かない。
   * スナップショットに無い単語 (一覧を開いたあとに追加された単語) だけは
   * 現在の値で並ぶ。
   */
  orderSnapshot?: ProjectWordOrderSnapshot | null;
}

/** 並べ替えにだけ使う、単語の学習状態のスナップショット。 */
export interface ProjectWordOrderKey {
  status: WordStatus;
  nextReviewAt?: string;
}

export type ProjectWordOrderSnapshot = ReadonlyMap<string, ProjectWordOrderKey>;

export interface ProjectPageWord {
  english: string;
  japanese: string;
  createdAt: string;
  id?: string;
  nextReviewAt?: string;
  projectId?: string;
  status?: WordStatus;
  isFavorite?: boolean;
  vocabularyType?: VocabularyType | null;
  partOfSpeechTags?: string[];
  lexiconEntryId?: string;
  lexiconSenseId?: string;
  lexiconDistinctKey?: string;
  lexiconSenseIsPrimary?: boolean;
}

const STATUS_SORT_ORDER: Record<WordStatus, number> = {
  new: 0,
  review: 1,
  active: 2,
  mastered: 3,
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

export function countProjectWordStats(words: readonly Partial<ProjectPageWord>[]): ProjectWordStats {
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
    total: summary.total,
    mastered: summary.mastered,
    active: summary.active,
    learning: summary.learning,
    unlearned: summary.unlearned,
  };
}

/**
 * 現在の学習タグを「並び順用」に凍結する。学習タグを押した瞬間に行が飛ぶのを
 * 防ぐため、一覧を開いたときと並べ替えを選び直したときだけ作り直す。
 */
export function buildProjectWordOrderSnapshot(
  words: readonly Pick<ProjectPageWord, 'id' | 'status' | 'nextReviewAt'>[],
): ProjectWordOrderSnapshot {
  const snapshot = new Map<string, ProjectWordOrderKey>();
  for (const word of words) {
    if (!word.id) continue;
    snapshot.set(word.id, { status: word.status ?? 'new', nextReviewAt: word.nextReviewAt });
  }
  return snapshot;
}

function resolveOrderKey(
  word: ProjectPageWord,
  snapshot: ProjectWordOrderSnapshot | null | undefined,
): ProjectWordOrderKey {
  const frozen = word.id ? snapshot?.get(word.id) : undefined;
  return frozen ?? { status: word.status ?? 'new', nextReviewAt: word.nextReviewAt };
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
    return [...result].sort((a, b) => {
      const keyA = resolveOrderKey(a, options.orderSnapshot);
      const keyB = resolveOrderKey(b, options.orderSnapshot);
      return (STATUS_SORT_ORDER[keyA.status] ?? 0) - (STATUS_SORT_ORDER[keyB.status] ?? 0);
    });
  }

  if (options.sortOrder === 'priority') {
    // クイズ・フラッシュカードと完全に同じ並び（復習期限→ステータス→作成日昇順→id）。
    const now = new Date();
    return [...result].sort((a, b) => {
      const keyA = resolveOrderKey(a, options.orderSnapshot);
      const keyB = resolveOrderKey(b, options.orderSnapshot);
      return compareWordsByPriority(
        { id: a.id ?? '', status: keyA.status, createdAt: a.createdAt, nextReviewAt: keyA.nextReviewAt },
        { id: b.id ?? '', status: keyB.status, createdAt: b.createdAt, nextReviewAt: keyB.nextReviewAt },
        now,
      );
    });
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
