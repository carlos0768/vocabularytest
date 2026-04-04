import type { Project, Word, RelatedWord, UsagePattern } from '../types';

function normalizeSourceLabels(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  const labels = value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter((item) => item.length > 0);

  return Array.from(new Set(labels));
}

function normalizeString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;

  const values = value
    .map((item) => normalizeString(item))
    .filter((item): item is string => Boolean(item));

  return values.length > 0 ? Array.from(new Set(values)) : undefined;
}

function normalizeRelatedWords(value: unknown): RelatedWord[] | undefined {
  if (!Array.isArray(value)) return undefined;

  const result: RelatedWord[] = [];

  for (const item of value) {
    if (!item || typeof item !== 'object') continue;

    const record = item as Record<string, unknown>;
    const term = normalizeString(record.term);
    const relation = normalizeString(record.relation);

    if (!term || !relation) continue;

    result.push({
      term,
      relation,
      noteJa: normalizeString(record.noteJa ?? record.note_ja),
    });
  }

  return result.length > 0 ? result : undefined;
}

function normalizeUsagePatterns(value: unknown): UsagePattern[] | undefined {
  if (!Array.isArray(value)) return undefined;

  const result: UsagePattern[] = [];

  for (const item of value) {
    if (!item || typeof item !== 'object') continue;

    const record = item as Record<string, unknown>;
    const pattern = normalizeString(record.pattern);
    const meaningJa = normalizeString(record.meaningJa ?? record.meaning_ja);

    if (!pattern || !meaningJa) continue;

    result.push({
      pattern,
      meaningJa,
      example: normalizeString(record.example),
      exampleJa: normalizeString(record.exampleJa ?? record.example_ja),
      register: normalizeString(record.register),
    });
  }

  return result.length > 0 ? result : undefined;
}

export function getDefaultSpacedRepetitionFields() {
  return {
    easeFactor: 2.5,
    intervalDays: 0,
    repetition: 0,
  };
}

export interface ProjectRow {
  id: string;
  user_id: string;
  title: string;
  source_labels?: unknown[] | null;
  icon_image?: string | null;
  created_at: string;
  share_id?: string | null;
  share_scope?: string | null;
  is_favorite?: boolean | null;
}

export function mapProjectFromRow(row: ProjectRow): Project {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    sourceLabels: normalizeSourceLabels(row.source_labels),
    iconImage: row.icon_image ?? undefined,
    createdAt: row.created_at,
    shareId: row.share_id ?? undefined,
    shareScope: row.share_scope === 'public' ? 'public' : 'private',
    isFavorite: row.is_favorite ?? false,
  };
}

export function mapProjectToInsert(
  project: Omit<Project, 'id' | 'createdAt' | 'sourceLabels'> & { sourceLabels?: string[] }
): {
  user_id: string;
  title: string;
  source_labels: string[];
  icon_image?: string;
} {
  return {
    user_id: project.userId,
    title: project.title,
    source_labels: normalizeSourceLabels(project.sourceLabels),
    ...(project.iconImage !== undefined && { icon_image: project.iconImage }),
  };
}

export function mapProjectUpdates(updates: Partial<Project>): Record<string, unknown> {
  const updateData: Record<string, unknown> = {};

  if (updates.title !== undefined) updateData.title = updates.title;
  if (updates.sourceLabels !== undefined) updateData.source_labels = normalizeSourceLabels(updates.sourceLabels);
  if (updates.iconImage !== undefined) updateData.icon_image = updates.iconImage;
  if (updates.shareId !== undefined) updateData.share_id = updates.shareId;
  if (updates.shareScope !== undefined) updateData.share_scope = updates.shareScope;
  if (updates.isFavorite !== undefined) updateData.is_favorite = updates.isFavorite;

  return updateData;
}

export interface WordRow {
  id: string;
  project_id: string;
  english: string;
  japanese: string;
  japanese_source?: 'scan' | 'ai' | null;
  lexicon_entry_id?: string | null;
  cefr_level?: string | null;
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

export function mapWordFromRow(row: WordRow): Word {
  const defaults = getDefaultSpacedRepetitionFields();

  return {
    id: row.id,
    projectId: row.project_id,
    english: row.english,
    japanese: row.japanese,
    japaneseSource: row.japanese_source ?? undefined,
    lexiconEntryId: row.lexicon_entry_id ?? undefined,
    cefrLevel: row.cefr_level ?? undefined,
    distractors: Array.isArray(row.distractors) ? row.distractors : [],
    exampleSentence: row.example_sentence ?? undefined,
    exampleSentenceJa: row.example_sentence_ja ?? undefined,
    pronunciation: row.pronunciation ?? undefined,
    status: (row.status as Word['status']) ?? 'new',
    createdAt: row.created_at,
    lastReviewedAt: row.last_reviewed_at ?? undefined,
    nextReviewAt: row.next_review_at ?? undefined,
    easeFactor: row.ease_factor ?? defaults.easeFactor,
    intervalDays: row.interval_days ?? defaults.intervalDays,
    repetition: row.repetition ?? defaults.repetition,
    isFavorite: row.is_favorite ?? false,
    partOfSpeechTags: normalizeStringArray(row.part_of_speech_tags),
    relatedWords: normalizeRelatedWords(row.related_words),
    usagePatterns: normalizeUsagePatterns(row.usage_patterns),
    insightsGeneratedAt: row.insights_generated_at ?? undefined,
    insightsVersion: row.insights_version ?? undefined,
  };
}

export type WordInput = Omit<
  Word,
  | 'id'
  | 'createdAt'
  | 'easeFactor'
  | 'intervalDays'
  | 'repetition'
  | 'isFavorite'
  | 'lastReviewedAt'
  | 'nextReviewAt'
  | 'status'
>;

export function mapWordToInsert(word: WordInput): Record<string, unknown> {
  const defaults = getDefaultSpacedRepetitionFields();

  return {
    project_id: word.projectId,
    english: word.english,
    japanese: word.japanese,
    ...(word.japaneseSource !== undefined && { japanese_source: word.japaneseSource }),
    ...(word.lexiconEntryId !== undefined && { lexicon_entry_id: word.lexiconEntryId }),
    ...(word.cefrLevel !== undefined && { cefr_level: word.cefrLevel }),
    distractors: word.distractors,
    ...(word.exampleSentence !== undefined && { example_sentence: word.exampleSentence }),
    ...(word.exampleSentenceJa !== undefined && { example_sentence_ja: word.exampleSentenceJa }),
    ...(word.pronunciation !== undefined && { pronunciation: word.pronunciation }),
    ...(word.partOfSpeechTags !== undefined && { part_of_speech_tags: word.partOfSpeechTags }),
    ...(word.relatedWords !== undefined && { related_words: word.relatedWords }),
    ...(word.usagePatterns !== undefined && { usage_patterns: word.usagePatterns }),
    ...(word.insightsGeneratedAt !== undefined && { insights_generated_at: word.insightsGeneratedAt }),
    ...(word.insightsVersion !== undefined && { insights_version: word.insightsVersion }),
    status: 'new',
    ease_factor: defaults.easeFactor,
    interval_days: defaults.intervalDays,
    repetition: defaults.repetition,
    is_favorite: false,
  };
}

export function mapWordUpdates(updates: Partial<Word>): Record<string, unknown> {
  const updateData: Record<string, unknown> = {};

  if (updates.english !== undefined) updateData.english = updates.english;
  if (updates.japanese !== undefined) updateData.japanese = updates.japanese;
  if (updates.japaneseSource !== undefined) updateData.japanese_source = updates.japaneseSource;
  if (updates.lexiconEntryId !== undefined) updateData.lexicon_entry_id = updates.lexiconEntryId;
  if (updates.cefrLevel !== undefined) updateData.cefr_level = updates.cefrLevel;
  if (updates.distractors !== undefined) updateData.distractors = updates.distractors;
  if (updates.exampleSentence !== undefined) updateData.example_sentence = updates.exampleSentence;
  if (updates.exampleSentenceJa !== undefined) updateData.example_sentence_ja = updates.exampleSentenceJa;
  if (updates.pronunciation !== undefined) updateData.pronunciation = updates.pronunciation;
  if (updates.status !== undefined) updateData.status = updates.status;
  if (updates.lastReviewedAt !== undefined) updateData.last_reviewed_at = updates.lastReviewedAt;
  if (updates.nextReviewAt !== undefined) updateData.next_review_at = updates.nextReviewAt;
  if (updates.easeFactor !== undefined) updateData.ease_factor = updates.easeFactor;
  if (updates.intervalDays !== undefined) updateData.interval_days = updates.intervalDays;
  if (updates.repetition !== undefined) updateData.repetition = updates.repetition;
  if (updates.isFavorite !== undefined) updateData.is_favorite = updates.isFavorite;
  if (updates.partOfSpeechTags !== undefined) updateData.part_of_speech_tags = updates.partOfSpeechTags;
  if (updates.relatedWords !== undefined) updateData.related_words = updates.relatedWords;
  if (updates.usagePatterns !== undefined) updateData.usage_patterns = updates.usagePatterns;
  if (updates.insightsGeneratedAt !== undefined) updateData.insights_generated_at = updates.insightsGeneratedAt;
  if (updates.insightsVersion !== undefined) updateData.insights_version = updates.insightsVersion;

  return updateData;
}
