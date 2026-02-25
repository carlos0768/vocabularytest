// Shared database mapping functions for WordSnap (Web & Mobile)
// Converts between Supabase snake_case and TypeScript camelCase

import type {
  Project,
  Word,
  Collection,
  CollectionProject,
  RelatedWord,
  UsagePattern,
} from '../types';

// ============ Default Values ============

export function getDefaultSpacedRepetitionFields() {
  return {
    easeFactor: 2.5,
    intervalDays: 0,
    repetition: 0,
  };
}

// ============ Project Mappers ============

export interface ProjectRow {
  id: string;
  user_id: string;
  title: string;
  icon_image?: string | null;
  created_at: string;
  share_id?: string | null;
  is_favorite?: boolean | null;
}

export function mapProjectFromRow(row: ProjectRow): Project {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    iconImage: row.icon_image ?? undefined,
    createdAt: row.created_at,
    shareId: row.share_id ?? undefined,
    isFavorite: row.is_favorite ?? false,
  };
}

export function mapProjectToInsert(project: Omit<Project, 'id' | 'createdAt'>): {
  user_id: string;
  title: string;
  icon_image?: string;
} {
  return {
    user_id: project.userId,
    title: project.title,
    ...(project.iconImage !== undefined && { icon_image: project.iconImage }),
  };
}

export function mapProjectToInsertWithId(project: Project): {
  id: string;
  user_id: string;
  title: string;
  icon_image?: string;
  created_at: string;
  share_id?: string;
  is_favorite?: boolean;
} {
  return {
    id: project.id,
    user_id: project.userId,
    title: project.title,
    ...(project.iconImage !== undefined && { icon_image: project.iconImage }),
    created_at: project.createdAt,
    ...(project.shareId !== undefined && { share_id: project.shareId }),
    ...(project.isFavorite !== undefined && { is_favorite: project.isFavorite }),
  };
}

export function mapProjectUpdates(updates: Partial<Project>): Record<string, unknown> {
  const updateData: Record<string, unknown> = {};
  if (updates.title !== undefined) updateData.title = updates.title;
  if (updates.iconImage !== undefined) updateData.icon_image = updates.iconImage;
  if (updates.shareId !== undefined) updateData.share_id = updates.shareId;
  if (updates.isFavorite !== undefined) updateData.is_favorite = updates.isFavorite;
  return updateData;
}

// ============ Word Mappers ============

export interface WordRow {
  id: string;
  project_id: string;
  english: string;
  japanese: string;
  distractors: string[];
  example_sentence?: string | null;
  example_sentence_ja?: string | null;
  pronunciation?: string | null;
  part_of_speech_tags?: unknown | null;
  related_words?: unknown | null;
  usage_patterns?: unknown | null;
  insights_generated_at?: string | null;
  insights_version?: number | null;
  status?: string | null;
  created_at: string;
  last_reviewed_at?: string | null;
  next_review_at?: string | null;
  ease_factor?: number | null;
  interval_days?: number | null;
  repetition?: number | null;
  is_favorite?: boolean | null;
}

function toNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizePartOfSpeechTags(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const deduped = new Set<string>();
  for (const item of value) {
    const normalized = toNonEmptyString(item);
    if (!normalized) continue;
    deduped.add(normalized);
  }
  return deduped.size > 0 ? Array.from(deduped) : undefined;
}

function normalizeRelatedWords(value: unknown): RelatedWord[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const result: RelatedWord[] = [];
  const seen = new Set<string>();

  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    const term = toNonEmptyString(record.term);
    const relation = toNonEmptyString(record.relation);
    const noteJa = toNonEmptyString(record.noteJa ?? record.note_ja);
    if (!term || !relation) continue;
    const key = `${term.toLowerCase()}::${relation.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ term, relation, noteJa: noteJa ?? undefined });
  }

  return result.length > 0 ? result : undefined;
}

function normalizeUsagePatterns(value: unknown): UsagePattern[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const result: UsagePattern[] = [];
  const seen = new Set<string>();

  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    const pattern = toNonEmptyString(record.pattern);
    const meaningJa = toNonEmptyString(record.meaningJa ?? record.meaning_ja);
    if (!pattern || !meaningJa) continue;
    const key = pattern.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({
      pattern,
      meaningJa,
      example: toNonEmptyString(record.example) ?? undefined,
      exampleJa: toNonEmptyString(record.exampleJa ?? record.example_ja) ?? undefined,
      register: toNonEmptyString(record.register) ?? undefined,
    });
  }

  return result.length > 0 ? result : undefined;
}

export function mapWordFromRow(row: WordRow): Word {
  const defaultSR = getDefaultSpacedRepetitionFields();
  return {
    id: row.id,
    projectId: row.project_id,
    english: row.english,
    japanese: row.japanese,
    distractors: row.distractors,
    exampleSentence: row.example_sentence ?? undefined,
    exampleSentenceJa: row.example_sentence_ja ?? undefined,
    pronunciation: row.pronunciation ?? undefined,
    partOfSpeechTags: normalizePartOfSpeechTags(row.part_of_speech_tags),
    relatedWords: normalizeRelatedWords(row.related_words),
    usagePatterns: normalizeUsagePatterns(row.usage_patterns),
    insightsGeneratedAt: row.insights_generated_at ?? undefined,
    insightsVersion: row.insights_version ?? undefined,
    status: (row.status as Word['status']) ?? 'new',
    createdAt: row.created_at,
    lastReviewedAt: row.last_reviewed_at ?? undefined,
    nextReviewAt: row.next_review_at ?? undefined,
    easeFactor: row.ease_factor ?? defaultSR.easeFactor,
    intervalDays: row.interval_days ?? defaultSR.intervalDays,
    repetition: row.repetition ?? defaultSR.repetition,
    isFavorite: row.is_favorite ?? false,
  };
}

export type WordInput = Omit<Word, 'id' | 'createdAt' | 'easeFactor' | 'intervalDays' | 'repetition' | 'isFavorite' | 'lastReviewedAt' | 'nextReviewAt' | 'status'>;

export function mapWordToInsert(word: WordInput): {
  project_id: string;
  english: string;
  japanese: string;
  distractors: string[];
  example_sentence?: string;
  example_sentence_ja?: string;
  pronunciation?: string;
  part_of_speech_tags?: string[];
  related_words?: RelatedWord[];
  usage_patterns?: UsagePattern[];
  insights_generated_at?: string;
  insights_version?: number;
  status: string;
  ease_factor: number;
  interval_days: number;
  repetition: number;
  is_favorite: boolean;
} {
  const defaultSR = getDefaultSpacedRepetitionFields();
  return {
    project_id: word.projectId,
    english: word.english,
    japanese: word.japanese,
    distractors: word.distractors,
    example_sentence: word.exampleSentence,
    example_sentence_ja: word.exampleSentenceJa,
    pronunciation: word.pronunciation,
    part_of_speech_tags: word.partOfSpeechTags,
    related_words: word.relatedWords,
    usage_patterns: word.usagePatterns,
    insights_generated_at: word.insightsGeneratedAt,
    insights_version: word.insightsVersion,
    status: 'new',
    ease_factor: defaultSR.easeFactor,
    interval_days: defaultSR.intervalDays,
    repetition: defaultSR.repetition,
    is_favorite: false,
  };
}

export function mapWordToInsertWithId(word: Word): {
  id: string;
  project_id: string;
  english: string;
  japanese: string;
  distractors: string[];
  example_sentence?: string;
  example_sentence_ja?: string;
  pronunciation?: string;
  part_of_speech_tags?: string[];
  related_words?: RelatedWord[];
  usage_patterns?: UsagePattern[];
  insights_generated_at?: string;
  insights_version?: number;
  status: string;
  created_at: string;
  last_reviewed_at?: string;
  next_review_at?: string;
  ease_factor: number;
  interval_days: number;
  repetition: number;
  is_favorite: boolean;
} {
  return {
    id: word.id,
    project_id: word.projectId,
    english: word.english,
    japanese: word.japanese,
    distractors: word.distractors,
    example_sentence: word.exampleSentence,
    example_sentence_ja: word.exampleSentenceJa,
    pronunciation: word.pronunciation,
    part_of_speech_tags: word.partOfSpeechTags,
    related_words: word.relatedWords,
    usage_patterns: word.usagePatterns,
    insights_generated_at: word.insightsGeneratedAt,
    insights_version: word.insightsVersion,
    status: word.status,
    created_at: word.createdAt,
    last_reviewed_at: word.lastReviewedAt,
    next_review_at: word.nextReviewAt,
    ease_factor: word.easeFactor,
    interval_days: word.intervalDays,
    repetition: word.repetition,
    is_favorite: word.isFavorite,
  };
}

export function mapWordUpdates(updates: Partial<Word>): Record<string, unknown> {
  const updateData: Record<string, unknown> = {};

  if (updates.english !== undefined) updateData.english = updates.english;
  if (updates.japanese !== undefined) updateData.japanese = updates.japanese;
  if (updates.distractors !== undefined) updateData.distractors = updates.distractors;
  if (updates.status !== undefined) updateData.status = updates.status;
  if (updates.exampleSentence !== undefined) updateData.example_sentence = updates.exampleSentence;
  if (updates.exampleSentenceJa !== undefined) updateData.example_sentence_ja = updates.exampleSentenceJa;
  if (updates.pronunciation !== undefined) updateData.pronunciation = updates.pronunciation;
  if (updates.partOfSpeechTags !== undefined) updateData.part_of_speech_tags = updates.partOfSpeechTags;
  if (updates.relatedWords !== undefined) updateData.related_words = updates.relatedWords;
  if (updates.usagePatterns !== undefined) updateData.usage_patterns = updates.usagePatterns;
  if (updates.insightsGeneratedAt !== undefined) updateData.insights_generated_at = updates.insightsGeneratedAt;
  if (updates.insightsVersion !== undefined) updateData.insights_version = updates.insightsVersion;

  // Spaced repetition fields
  if (updates.lastReviewedAt !== undefined) updateData.last_reviewed_at = updates.lastReviewedAt;
  if (updates.nextReviewAt !== undefined) updateData.next_review_at = updates.nextReviewAt;
  if (updates.easeFactor !== undefined) updateData.ease_factor = updates.easeFactor;
  if (updates.intervalDays !== undefined) updateData.interval_days = updates.intervalDays;
  if (updates.repetition !== undefined) updateData.repetition = updates.repetition;
  if (updates.isFavorite !== undefined) updateData.is_favorite = updates.isFavorite;

  return updateData;
}

// ============ Collection Mappers ============

export interface CollectionRow {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface CollectionProjectRow {
  collection_id: string;
  project_id: string;
  sort_order: number;
  added_at: string;
}

export function mapCollectionFromRow(row: CollectionRow): Collection {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    description: row.description ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapCollectionToInsert(data: { userId: string; name: string; description?: string }): {
  user_id: string;
  name: string;
  description?: string;
} {
  return {
    user_id: data.userId,
    name: data.name,
    ...(data.description !== undefined && { description: data.description }),
  };
}

export function mapCollectionUpdates(updates: Partial<Pick<Collection, 'name' | 'description'>>): Record<string, unknown> {
  const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (updates.name !== undefined) updateData.name = updates.name;
  if (updates.description !== undefined) updateData.description = updates.description;
  return updateData;
}

export function mapCollectionProjectFromRow(row: CollectionProjectRow): CollectionProject {
  return {
    collectionId: row.collection_id,
    projectId: row.project_id,
    sortOrder: row.sort_order,
    addedAt: row.added_at,
  };
}
