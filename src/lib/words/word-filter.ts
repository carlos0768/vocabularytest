/**
 * 単語一覧ページ (/words) のフィルタ・並べ替えロジック。
 *
 * この画面の目的は「単語帳をまたいで単語そのものを眺める」ことなので、
 * 絞り込みは単語1件が持つ属性の組み合わせで行う。データは IndexedDB に
 * 同期済みのものだけを使い、フィルタ処理は完全にフロントエンドで完結させる
 * (API通信はしない)。そのため純粋関数としてここに切り出してテストする。
 */

import type { Word, WordStatus } from '@/types';

/** 単語 + 一覧表示に必要な単語帳側の情報。 */
export interface WordListEntry {
  word: Word;
  projectId: string;
  projectTitle: string;
  /** バインダー名。未分類は null。 */
  binder: string | null;
  /** クイズで間違えた回数 (localStorage の wrongAnswers 由来)。 */
  wrongCount: number;
}

/** 「その要素を持っているか」で絞るための軸。 */
export type FeatureKey =
  | 'example'
  | 'pronunciation'
  | 'morphology'
  | 'derived'
  | 'multiMeaning'
  | 'custom'
  | 'wrong';

/** off = 条件なし / has = 持っているものだけ / none = 持っていないものだけ。 */
export type TriState = 'off' | 'has' | 'none';

export type FavoriteFilter = 'any' | 'only' | 'exclude';
/** due = 復習期限が過ぎている / scheduled = 期限が未来 / never = 一度も学習していない。 */
export type ReviewFilter = 'any' | 'due' | 'scheduled' | 'never';
export type CreatedFilter = 'any' | 'today' | 'week' | 'month';
/** 反復回数 (SM-2 repetition) の帯。 */
export type RepetitionFilter = 'any' | 'zero' | 'low' | 'high';
export type VocabularyTypeFilter = 'active' | 'passive' | 'unset';

export type SortKey =
  | 'created-desc'
  | 'created-asc'
  | 'alpha-asc'
  | 'alpha-desc'
  | 'japanese'
  | 'status'
  | 'review'
  | 'project'
  | 'wrong';

export interface WordFilterState {
  query: string;
  /** 空 = 全単語帳。 */
  projectIds: string[];
  /** 空 = 全バインダー。未分類は空文字で表す。 */
  binders: string[];
  /** 空 = 全ステータス。 */
  statuses: WordStatus[];
  favorite: FavoriteFilter;
  /** 空 = 指定なし。 */
  vocabularyTypes: VocabularyTypeFilter[];
  /** 空 = 指定なし。複数選ぶと OR。 */
  partOfSpeech: string[];
  /** 空 = 指定なし。複数選ぶと OR。 */
  cefrLevels: string[];
  /** 要素の有無。指定した軸どうしは AND。 */
  features: Partial<Record<FeatureKey, TriState>>;
  review: ReviewFilter;
  created: CreatedFilter;
  repetition: RepetitionFilter;
  sort: SortKey;
}

export const DEFAULT_WORD_FILTER: WordFilterState = {
  query: '',
  projectIds: [],
  binders: [],
  statuses: [],
  favorite: 'any',
  vocabularyTypes: [],
  partOfSpeech: [],
  cefrLevels: [],
  features: {},
  review: 'any',
  created: 'any',
  repetition: 'any',
  sort: 'created-desc',
};

export const UNCATEGORIZED_BINDER = '';

export const FEATURE_LABELS: Record<FeatureKey, string> = {
  example: '例文',
  pronunciation: '発音記号',
  morphology: '語源',
  derived: '派生語',
  multiMeaning: '複数の意味',
  custom: 'メモ',
  wrong: '間違えた',
};

export const STATUS_LABELS: Record<WordStatus, string> = {
  new: '未学習',
  review: '学習中',
  active: '定着中',
  mastered: '習得',
};

export const SORT_LABELS: Record<SortKey, string> = {
  'created-desc': '追加が新しい順',
  'created-asc': '追加が古い順',
  'alpha-asc': 'ABC順',
  'alpha-desc': 'ZYX順',
  japanese: '意味順',
  status: '学習度順',
  review: '復習期限順',
  project: '単語帳順',
  wrong: '間違えた回数順',
};

const STATUS_ORDER: Record<WordStatus, number> = {
  new: 0,
  review: 1,
  active: 2,
  mastered: 3,
};

const CREATED_WINDOW_DAYS: Record<Exclude<CreatedFilter, 'any'>, number> = {
  today: 1,
  week: 7,
  month: 30,
};

const DAY_MS = 24 * 60 * 60 * 1000;

function timestamp(iso: string | undefined): number | null {
  if (!iso) return null;
  const value = new Date(iso).getTime();
  return Number.isNaN(value) ? null : value;
}

/** 単語がその要素を持っているか。空文字や「none: true」は持っていない扱い。 */
export function hasFeature(entry: WordListEntry, key: FeatureKey): boolean {
  const { word } = entry;
  switch (key) {
    case 'example':
      return Boolean(word.exampleSentence?.trim());
    case 'pronunciation':
      return Boolean(word.pronunciation?.trim());
    case 'morphology':
      return Boolean(
        word.morphology && !word.morphology.none && (word.morphology.formula?.length ?? 0) > 0,
      );
    case 'derived':
      return Boolean(
        word.derivedWords && !word.derivedWords.none && (word.derivedWords.items?.length ?? 0) > 0,
      );
    case 'multiMeaning': {
      const meanings = (word.translations ?? []).filter((t) => t.translationJa.trim().length > 0);
      return meanings.length > 1;
    }
    case 'custom':
      return Boolean(word.customSections?.some((section) => section.content.trim().length > 0));
    case 'wrong':
      return entry.wrongCount > 0;
    default:
      return false;
  }
}

function matchesQuery(entry: WordListEntry, rawQuery: string): boolean {
  const query = rawQuery.trim().toLowerCase();
  if (!query) return true;
  const { word } = entry;
  const haystacks: Array<string | undefined> = [
    word.english,
    word.japanese,
    word.exampleSentence,
    word.exampleSentenceJa,
    entry.projectTitle,
    ...(word.translations?.map((t) => t.translationJa) ?? []),
  ];
  return haystacks.some((value) => value?.toLowerCase().includes(query));
}

function matchesVocabularyType(word: Word, selected: VocabularyTypeFilter[]): boolean {
  if (selected.length === 0) return true;
  const value: VocabularyTypeFilter = word.vocabularyType ?? 'unset';
  return selected.includes(value);
}

function matchesReview(word: Word, filter: ReviewFilter, now: number): boolean {
  if (filter === 'any') return true;
  const next = timestamp(word.nextReviewAt);
  if (filter === 'never') return timestamp(word.lastReviewedAt) === null;
  if (next === null) return false;
  return filter === 'due' ? next <= now : next > now;
}

function matchesCreated(word: Word, filter: CreatedFilter, now: number): boolean {
  if (filter === 'any') return true;
  const created = timestamp(word.createdAt);
  if (created === null) return false;
  return now - created <= CREATED_WINDOW_DAYS[filter] * DAY_MS;
}

function matchesRepetition(word: Word, filter: RepetitionFilter): boolean {
  if (filter === 'any') return true;
  const repetition = Number.isFinite(word.repetition) ? word.repetition : 0;
  if (filter === 'zero') return repetition === 0;
  if (filter === 'low') return repetition >= 1 && repetition <= 2;
  return repetition >= 3;
}

/** 1件がフィルタ条件をすべて満たすか (軸どうしは AND、軸の中の選択肢は OR)。 */
export function matchesWordFilter(
  entry: WordListEntry,
  filter: WordFilterState,
  now: number = Date.now(),
): boolean {
  const { word } = entry;

  if (!matchesQuery(entry, filter.query)) return false;
  if (filter.projectIds.length > 0 && !filter.projectIds.includes(entry.projectId)) return false;
  if (filter.binders.length > 0 && !filter.binders.includes(entry.binder ?? UNCATEGORIZED_BINDER)) {
    return false;
  }
  if (filter.statuses.length > 0 && !filter.statuses.includes(word.status)) return false;
  if (filter.favorite === 'only' && !word.isFavorite) return false;
  if (filter.favorite === 'exclude' && word.isFavorite) return false;
  if (!matchesVocabularyType(word, filter.vocabularyTypes)) return false;

  if (filter.partOfSpeech.length > 0) {
    const tags = word.partOfSpeechTags ?? [];
    if (!tags.some((tag) => filter.partOfSpeech.includes(tag))) return false;
  }

  if (filter.cefrLevels.length > 0) {
    if (!word.cefrLevel || !filter.cefrLevels.includes(word.cefrLevel)) return false;
  }

  for (const [key, state] of Object.entries(filter.features) as Array<[FeatureKey, TriState]>) {
    if (state === 'off') continue;
    const present = hasFeature(entry, key);
    if (state === 'has' && !present) return false;
    if (state === 'none' && present) return false;
  }

  if (!matchesReview(word, filter.review, now)) return false;
  if (!matchesCreated(word, filter.created, now)) return false;
  if (!matchesRepetition(word, filter.repetition)) return false;

  return true;
}

function compareEnglish(a: WordListEntry, b: WordListEntry): number {
  return a.word.english.localeCompare(b.word.english, 'en', { sensitivity: 'base' });
}

function compareEntries(a: WordListEntry, b: WordListEntry, sort: SortKey): number {
  switch (sort) {
    case 'created-desc':
      return (timestamp(b.word.createdAt) ?? 0) - (timestamp(a.word.createdAt) ?? 0)
        || compareEnglish(a, b);
    case 'created-asc':
      return (timestamp(a.word.createdAt) ?? 0) - (timestamp(b.word.createdAt) ?? 0)
        || compareEnglish(a, b);
    case 'alpha-asc':
      return compareEnglish(a, b);
    case 'alpha-desc':
      return compareEnglish(b, a);
    case 'japanese':
      return a.word.japanese.localeCompare(b.word.japanese, 'ja') || compareEnglish(a, b);
    case 'status':
      return STATUS_ORDER[a.word.status] - STATUS_ORDER[b.word.status] || compareEnglish(a, b);
    case 'review': {
      // 期限なし(未学習)は後ろにまとめる
      const aNext = timestamp(a.word.nextReviewAt) ?? Number.POSITIVE_INFINITY;
      const bNext = timestamp(b.word.nextReviewAt) ?? Number.POSITIVE_INFINITY;
      if (aNext === bNext) return compareEnglish(a, b);
      return aNext - bNext;
    }
    case 'project':
      return a.projectTitle.localeCompare(b.projectTitle, 'ja') || compareEnglish(a, b);
    case 'wrong':
      return b.wrongCount - a.wrongCount || compareEnglish(a, b);
    default:
      return 0;
  }
}

/** 絞り込み + 並べ替え。元配列は変更しない。 */
export function filterAndSortWords(
  entries: WordListEntry[],
  filter: WordFilterState,
  now: number = Date.now(),
): WordListEntry[] {
  const matched = entries.filter((entry) => matchesWordFilter(entry, filter, now));
  return matched.sort((a, b) => compareEntries(a, b, filter.sort));
}

/** 適用中の条件の数。バッジ表示と「クリア」ボタンの出し分けに使う。 */
export function countActiveFilters(filter: WordFilterState): number {
  let count = 0;
  if (filter.query.trim()) count += 1;
  count += filter.projectIds.length > 0 ? 1 : 0;
  count += filter.binders.length > 0 ? 1 : 0;
  count += filter.statuses.length > 0 ? 1 : 0;
  count += filter.favorite === 'any' ? 0 : 1;
  count += filter.vocabularyTypes.length > 0 ? 1 : 0;
  count += filter.partOfSpeech.length > 0 ? 1 : 0;
  count += filter.cefrLevels.length > 0 ? 1 : 0;
  count += Object.values(filter.features).filter((state) => state && state !== 'off').length;
  count += filter.review === 'any' ? 0 : 1;
  count += filter.created === 'any' ? 0 : 1;
  count += filter.repetition === 'any' ? 0 : 1;
  return count;
}

export interface WordFilterOption {
  value: string;
  label: string;
  count: number;
}

export interface WordFilterOptions {
  projects: WordFilterOption[];
  binders: WordFilterOption[];
  partOfSpeech: WordFilterOption[];
  cefrLevels: WordFilterOption[];
}

function toSortedOptions(
  counts: Map<string, { label: string; count: number }>,
  compare: (a: WordFilterOption, b: WordFilterOption) => number,
): WordFilterOption[] {
  return [...counts.entries()]
    .map(([value, { label, count }]) => ({ value, label, count }))
    .sort(compare);
}

/**
 * 実データに存在する値だけを選択肢として出す。
 * (品詞やCEFRは単語帳によって付いていないことがあるため、固定リストにしない)
 */
export function deriveFilterOptions(entries: WordListEntry[]): WordFilterOptions {
  const projects = new Map<string, { label: string; count: number }>();
  const binders = new Map<string, { label: string; count: number }>();
  const partOfSpeech = new Map<string, { label: string; count: number }>();
  const cefrLevels = new Map<string, { label: string; count: number }>();

  const bump = (
    map: Map<string, { label: string; count: number }>,
    value: string,
    label: string,
  ) => {
    const existing = map.get(value);
    if (existing) existing.count += 1;
    else map.set(value, { label, count: 1 });
  };

  for (const entry of entries) {
    bump(projects, entry.projectId, entry.projectTitle || '(無題)');
    const binderValue = entry.binder ?? UNCATEGORIZED_BINDER;
    bump(binders, binderValue, binderValue === UNCATEGORIZED_BINDER ? '未分類' : binderValue);
    for (const tag of new Set(entry.word.partOfSpeechTags ?? [])) {
      if (tag.trim()) bump(partOfSpeech, tag, tag);
    }
    if (entry.word.cefrLevel) bump(cefrLevels, entry.word.cefrLevel, entry.word.cefrLevel);
  }

  const byCountDesc = (a: WordFilterOption, b: WordFilterOption) =>
    b.count - a.count || a.label.localeCompare(b.label, 'ja');

  return {
    projects: toSortedOptions(projects, byCountDesc),
    binders: toSortedOptions(binders, byCountDesc),
    partOfSpeech: toSortedOptions(partOfSpeech, byCountDesc),
    cefrLevels: toSortedOptions(cefrLevels, (a, b) => a.label.localeCompare(b.label, 'en')),
  };
}

/** 一覧ヘッダーの内訳表示用。 */
export function summarizeStatuses(entries: WordListEntry[]): Record<WordStatus, number> {
  const summary: Record<WordStatus, number> = { new: 0, review: 0, active: 0, mastered: 0 };
  for (const entry of entries) summary[entry.word.status] += 1;
  return summary;
}

export interface ActiveFilterChip {
  id: string;
  label: string;
  /** このチップを外したあとのフィルタ状態。 */
  next: WordFilterState;
}

const FAVORITE_LABELS: Record<Exclude<FavoriteFilter, 'any'>, string> = {
  only: 'ブックマークのみ',
  exclude: 'ブックマーク以外',
};

const REVIEW_LABELS: Record<Exclude<ReviewFilter, 'any'>, string> = {
  due: '復習期限ぎれ',
  scheduled: '復習予定あり',
  never: '未学習のまま',
};

const CREATED_LABELS: Record<Exclude<CreatedFilter, 'any'>, string> = {
  today: '24時間以内に追加',
  week: '7日以内に追加',
  month: '30日以内に追加',
};

const REPETITION_LABELS: Record<Exclude<RepetitionFilter, 'any'>, string> = {
  zero: '正解 0回',
  low: '正解 1〜2回',
  high: '正解 3回以上',
};

const VOCABULARY_TYPE_LABELS: Record<VocabularyTypeFilter, string> = {
  active: '発信語彙',
  passive: '受信語彙',
  unset: '語彙タイプ未設定',
};

/**
 * 適用中の条件を1つずつ外せるチップにする。
 * 「どの条件が効いているのか」を一列で見せるための表示用ヘルパー。
 */
export function describeActiveFilters(
  filter: WordFilterState,
  options: WordFilterOptions,
): ActiveFilterChip[] {
  const chips: ActiveFilterChip[] = [];
  const labelFor = (list: WordFilterOption[], value: string) =>
    list.find((option) => option.value === value)?.label ?? value;

  if (filter.query.trim()) {
    chips.push({ id: 'query', label: `"${filter.query.trim()}"`, next: { ...filter, query: '' } });
  }

  for (const projectId of filter.projectIds) {
    chips.push({
      id: `project:${projectId}`,
      label: labelFor(options.projects, projectId),
      next: { ...filter, projectIds: filter.projectIds.filter((id) => id !== projectId) },
    });
  }

  for (const binder of filter.binders) {
    chips.push({
      id: `binder:${binder}`,
      label: binder === UNCATEGORIZED_BINDER ? '未分類' : binder,
      next: { ...filter, binders: filter.binders.filter((value) => value !== binder) },
    });
  }

  for (const status of filter.statuses) {
    chips.push({
      id: `status:${status}`,
      label: STATUS_LABELS[status],
      next: { ...filter, statuses: filter.statuses.filter((value) => value !== status) },
    });
  }

  if (filter.favorite !== 'any') {
    chips.push({
      id: 'favorite',
      label: FAVORITE_LABELS[filter.favorite],
      next: { ...filter, favorite: 'any' },
    });
  }

  for (const type of filter.vocabularyTypes) {
    chips.push({
      id: `vocabularyType:${type}`,
      label: VOCABULARY_TYPE_LABELS[type],
      next: { ...filter, vocabularyTypes: filter.vocabularyTypes.filter((value) => value !== type) },
    });
  }

  for (const tag of filter.partOfSpeech) {
    chips.push({
      id: `pos:${tag}`,
      label: tag,
      next: { ...filter, partOfSpeech: filter.partOfSpeech.filter((value) => value !== tag) },
    });
  }

  for (const level of filter.cefrLevels) {
    chips.push({
      id: `cefr:${level}`,
      label: level,
      next: { ...filter, cefrLevels: filter.cefrLevels.filter((value) => value !== level) },
    });
  }

  for (const [key, state] of Object.entries(filter.features) as Array<[FeatureKey, TriState]>) {
    if (!state || state === 'off') continue;
    const features = { ...filter.features };
    delete features[key];
    chips.push({
      id: `feature:${key}`,
      label: `${FEATURE_LABELS[key]}${state === 'has' ? 'あり' : 'なし'}`,
      next: { ...filter, features },
    });
  }

  if (filter.review !== 'any') {
    chips.push({ id: 'review', label: REVIEW_LABELS[filter.review], next: { ...filter, review: 'any' } });
  }
  if (filter.created !== 'any') {
    chips.push({ id: 'created', label: CREATED_LABELS[filter.created], next: { ...filter, created: 'any' } });
  }
  if (filter.repetition !== 'any') {
    chips.push({
      id: 'repetition',
      label: REPETITION_LABELS[filter.repetition],
      next: { ...filter, repetition: 'any' },
    });
  }

  return chips;
}

/** 検索語と並べ替えは残したまま、絞り込みだけ初期化する。 */
export function clearFilterConditions(filter: WordFilterState): WordFilterState {
  return { ...DEFAULT_WORD_FILTER, query: filter.query, sort: filter.sort };
}

/** 配列の中の値をトグルする (選択チップ用の小さなヘルパー)。 */
export function toggleValue<T>(values: T[], value: T): T[] {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

/** off → has → none → off と回す。 */
export function nextTriState(state: TriState | undefined): TriState {
  if (state === 'has') return 'none';
  if (state === 'none') return 'off';
  return 'has';
}
