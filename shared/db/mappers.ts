// Shared database mapping functions for WordSnap (Web & Mobile)
// Converts between Supabase snake_case and TypeScript camelCase

import type {
  Project,
  Word,
  CustomSection,
  VocabularyType,
  LexiconEntry,
  LexiconSense,
  Collection,
  CollectionProject,
  RelatedWord,
  UsagePattern,
  WordTranslation,
  WordOrderQuizCache,
  WordMorphology,
  WordMorphologyPart,
} from '../types';
import { normalizeSourceLabels } from '../source-labels';
import { normalizeSharedTags } from '../shared-tags';
import {
  normalizeLexiconDatasetSources,
  normalizeLexiconTranslation,
} from '../lexicon';
import {
  normalizeCustomSections as normalizeCustomSectionsValue,
  normalizeTranslationText,
  normalizeWordTranslationPayload,
} from '../word-translations';

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
  source_labels?: unknown[] | null;
  shared_tags?: unknown[] | null;
  icon_image?: string | null;
  description?: string | null;
  created_at: string;
  share_id?: string | null;
  share_scope?: string | null;
  imported_from_share_id?: string | null;
  imported_from_official_slug?: string | null;
  is_favorite?: boolean | null;
  binder?: string | null;
}

export function mapProjectFromRow(row: ProjectRow): Project {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    sourceLabels: normalizeSourceLabels(row.source_labels),
    sharedTags: normalizeSharedTags(normalizeStringArray(row.shared_tags, 8)),
    description: row.description ?? undefined,
    iconImage: row.icon_image ?? undefined,
    createdAt: row.created_at,
    shareId: row.share_id ?? undefined,
    shareScope: row.share_scope === 'public' ? 'public' : 'private',
    importedFromShareId: row.imported_from_share_id?.trim()
      ? row.imported_from_share_id.trim()
      : undefined,
    importedFromOfficialSlug: row.imported_from_official_slug?.trim()
      ? row.imported_from_official_slug.trim()
      : undefined,
    isFavorite: row.is_favorite ?? false,
    binder: row.binder?.trim() ? row.binder.trim() : null,
  };
}

export function mapProjectToInsert(project: Omit<Project, 'id' | 'createdAt' | 'sourceLabels'> & { sourceLabels?: string[] }): {
  user_id: string;
  title: string;
  source_labels: string[];
  icon_image?: string;
  shared_tags?: string[];
  description?: string;
  imported_from_share_id?: string;
  imported_from_official_slug?: string;
} {
  return {
    user_id: project.userId,
    title: project.title,
    source_labels: normalizeSourceLabels(project.sourceLabels),
    ...(project.iconImage !== undefined && { icon_image: project.iconImage }),
    ...(project.sharedTags !== undefined && { shared_tags: normalizeSharedTags(project.sharedTags) }),
    ...(project.description !== undefined && { description: project.description }),
    ...(project.importedFromShareId !== undefined && {
      imported_from_share_id: project.importedFromShareId,
    }),
    ...(project.importedFromOfficialSlug !== undefined && {
      imported_from_official_slug: project.importedFromOfficialSlug,
    }),
  };
}

export function mapProjectToInsertWithId(project: Project): {
  id: string;
  user_id: string;
  title: string;
  source_labels: string[];
  icon_image?: string;
  shared_tags?: string[];
  description?: string;
  created_at: string;
  share_id?: string;
  share_scope?: string;
  imported_from_share_id?: string;
  imported_from_official_slug?: string;
  is_favorite?: boolean;
} {
  return {
    id: project.id,
    user_id: project.userId,
    title: project.title,
    source_labels: normalizeSourceLabels(project.sourceLabels),
    ...(project.iconImage !== undefined && { icon_image: project.iconImage }),
    ...(project.sharedTags !== undefined && { shared_tags: normalizeSharedTags(project.sharedTags) }),
    ...(project.description !== undefined && { description: project.description }),
    created_at: project.createdAt,
    ...(project.shareId !== undefined && { share_id: project.shareId }),
    ...(project.shareScope !== undefined && { share_scope: project.shareScope }),
    ...(project.importedFromShareId !== undefined && {
      imported_from_share_id: project.importedFromShareId,
    }),
    ...(project.importedFromOfficialSlug !== undefined && {
      imported_from_official_slug: project.importedFromOfficialSlug,
    }),
    ...(project.isFavorite !== undefined && { is_favorite: project.isFavorite }),
    ...(project.binder !== undefined && { binder: project.binder?.trim() ? project.binder.trim() : null }),
  };
}

export function mapProjectUpdates(updates: Partial<Project>): Record<string, unknown> {
  const updateData: Record<string, unknown> = {};
  if (updates.title !== undefined) updateData.title = updates.title;
  if (updates.sourceLabels !== undefined) updateData.source_labels = normalizeSourceLabels(updates.sourceLabels);
  if (updates.sharedTags !== undefined) updateData.shared_tags = normalizeSharedTags(updates.sharedTags);
  if (updates.description !== undefined) updateData.description = updates.description;
  if (updates.iconImage !== undefined) updateData.icon_image = updates.iconImage;
  if (updates.shareId !== undefined) updateData.share_id = updates.shareId;
  if (updates.shareScope !== undefined) updateData.share_scope = updates.shareScope;
  if (updates.importedFromShareId !== undefined) {
    updateData.imported_from_share_id = updates.importedFromShareId;
  }
  if (updates.importedFromOfficialSlug !== undefined) {
    updateData.imported_from_official_slug = updates.importedFromOfficialSlug;
  }
  if (updates.isFavorite !== undefined) updateData.is_favorite = updates.isFavorite;
  if (updates.binder !== undefined) updateData.binder = updates.binder?.trim() ? updates.binder.trim() : null;
  return updateData;
}

// ============ Word Mappers ============

export interface WordRow {
  id: string;
  project_id: string;
  english: string;
  japanese: string;
  japanese_source?: string | null;
  vocabulary_type?: string | null;
  lexicon_entry_id?: string | null;
  lexicon_sense_id?: string | null;
  distractors: string[];
  example_sentence?: string | null;
  example_sentence_ja?: string | null;
  pronunciation?: string | null;
  part_of_speech_tags?: unknown | null;
  related_words?: unknown | null;
  usage_patterns?: unknown | null;
  insights_generated_at?: string | null;
  insights_version?: number | null;
  word_order_quiz?: unknown | null;
  morphology?: unknown | null;
  status?: string | null;
  created_at: string;
  last_reviewed_at?: string | null;
  next_review_at?: string | null;
  ease_factor?: number | null;
  interval_days?: number | null;
  repetition?: number | null;
  is_favorite?: boolean | null;
  custom_sections?: unknown | null;
  lexicon_entries?: LexiconEntryRow | LexiconEntryRow[] | null;
  word_translations?: WordTranslationRow[] | null;
  lexicon_senses?: LexiconSenseRow | LexiconSenseRow[] | null;
}

export interface WordTranslationRow {
  id?: string | null;
  word_id?: string | null;
  lexicon_sense_id?: string | null;
  lexicon_senses?: LexiconSenseRow | LexiconSenseRow[] | null;
  translation_ja?: string | null;
  normalized_translation_ja?: string | null;
  source?: string | null;
  meaning_rank?: number | null;
  position?: number | null;
  is_primary?: boolean | null;
  status?: string | null;
  last_reviewed_at?: string | null;
  next_review_at?: string | null;
  ease_factor?: number | null;
  interval_days?: number | null;
  repetition?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface LexiconEntryRow {
  id: string;
  headword: string;
  normalized_headword: string;
  pos: string;
  cefr_level?: string | null;
  dataset_sources?: string[] | null;
  primary_sense_id?: string | null;
  translation_ja?: string | null;
  normalized_translation_ja?: string | null;
  distinct_key?: string | null;
  meaning_summary?: string | null;
  usage_notes?: string | null;
  translation_source?: string | null;
  example_sentence?: string | null;
  example_sentence_ja?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface LexiconSenseRow {
  id: string;
  lexicon_entry_id: string;
  translation_ja: string;
  normalized_translation_ja: string;
  distinct_key?: string | null;
  meaning_summary?: string | null;
  usage_notes?: string | null;
  example_sentence?: string | null;
  example_sentence_ja?: string | null;
  translation_source?: string | null;
  is_primary?: boolean | null;
  created_at?: string;
  updated_at?: string;
}

function toNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeDistractors(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

function normalizeWordStatus(value: unknown): Word['status'] | undefined {
  return value === 'new' || value === 'review' || value === 'active' || value === 'mastered'
    ? value
    : undefined;
}

function resolveLexiconRow(
  value: WordRow['lexicon_entries'],
): LexiconEntryRow | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }
  return value ?? null;
}

function resolveLexiconSenseRow(
  value: WordRow['lexicon_senses'],
): LexiconSenseRow | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }
  return value ?? null;
}

function resolveWordEnglish(row: WordRow): string {
  return (
    toNonEmptyString(resolveLexiconRow(row.lexicon_entries)?.headword) ??
    row.english
  );
}

function resolveWordJapanese(row: WordRow): string {
  const primaryTranslation = resolveWordTranslations(row)[0]?.translationJa;
  if (primaryTranslation) {
    return primaryTranslation;
  }

  const lexicon = resolveLexiconRow(row.lexicon_entries);
  const sense = resolveLexiconSenseRow(row.lexicon_senses);
  return (
    normalizeLexiconTranslation(sense?.translation_ja) ??
    normalizeLexiconTranslation(lexicon?.translation_ja) ??
    row.japanese
  );
}

function normalizeWordTranslationRows(value: unknown): WordTranslation[] {
  if (!Array.isArray(value)) return [];
  const translations: WordTranslation[] = [];
  const seen = new Set<string>();

  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const row = item as WordTranslationRow;
    const sense = resolveLexiconSenseRow(row.lexicon_senses);
    const translationJa = normalizeTranslationText(row.translation_ja);
    if (!translationJa) continue;
    const normalizedTranslationJa = normalizeTranslationText(row.normalized_translation_ja) || translationJa;
    const key = normalizedTranslationJa.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    translations.push({
      id: row.id ?? undefined,
      wordId: row.word_id ?? undefined,
      lexiconSenseId: row.lexicon_sense_id ?? sense?.id ?? undefined,
      distinctKey: toNonEmptyString(sense?.distinct_key) ?? undefined,
      lexiconSenseIsPrimary: sense?.is_primary ?? undefined,
      translationJa,
      normalizedTranslationJa,
      source: row.source === 'scan' || row.source === 'ai' || row.source === 'user' ? row.source : undefined,
      meaningRank: typeof row.meaning_rank === 'number' && row.meaning_rank > 0 ? row.meaning_rank : translations.length + 1,
      position: typeof row.position === 'number' ? row.position : translations.length,
      isPrimary: row.is_primary ?? false,
      status: normalizeWordStatus(row.status),
      lastReviewedAt: row.last_reviewed_at ?? undefined,
      nextReviewAt: row.next_review_at ?? undefined,
      easeFactor: row.ease_factor ?? undefined,
      intervalDays: row.interval_days ?? undefined,
      repetition: row.repetition ?? undefined,
      createdAt: row.created_at ?? undefined,
      updatedAt: row.updated_at ?? undefined,
    });
  }

  return translations
    .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.position - b.position)
    .map((translation, index) => ({
      ...translation,
      meaningRank: typeof translation.meaningRank === 'number' && translation.meaningRank > 0
        ? translation.meaningRank
        : index + 1,
      position: index,
      isPrimary: index === 0,
    }));
}

function resolveWordTranslations(row: WordRow): WordTranslation[] {
  const normalizedRows = normalizeWordTranslationRows(row.word_translations);
  if (normalizedRows.length > 0) {
    return normalizedRows;
  }

  const lexicon = resolveLexiconRow(row.lexicon_entries);
  const sense = resolveLexiconSenseRow(row.lexicon_senses);
  const fallback = normalizeWordTranslationPayload({
    japanese: normalizeLexiconTranslation(sense?.translation_ja)
      ?? normalizeLexiconTranslation(lexicon?.translation_ja)
      ?? row.japanese,
    lexiconSenseId: row.lexicon_sense_id ?? sense?.id,
  }).translations;

  return fallback.map((translation) => ({
    ...translation,
    distinctKey: toNonEmptyString(sense?.distinct_key) ?? undefined,
    lexiconSenseIsPrimary: sense?.is_primary ?? undefined,
  }));
}

function resolveWordCefrLevel(row: WordRow): string | undefined {
  return toNonEmptyString(resolveLexiconRow(row.lexicon_entries)?.cefr_level) ?? undefined;
}

function resolveWordExampleSentence(row: WordRow): string | undefined {
  const lexicon = resolveLexiconRow(row.lexicon_entries);
  return toNonEmptyString(row.example_sentence)
    ?? toNonEmptyString(lexicon?.example_sentence)
    ?? undefined;
}

function resolveWordExampleSentenceJa(row: WordRow): string | undefined {
  const lexicon = resolveLexiconRow(row.lexicon_entries);
  return toNonEmptyString(row.example_sentence_ja)
    ?? toNonEmptyString(lexicon?.example_sentence_ja)
    ?? undefined;
}

function normalizeVocabularyType(value: unknown): VocabularyType | null {
  return value === 'active' || value === 'passive' ? value : null;
}

function normalizeJapaneseSource(value: unknown): Word['japaneseSource'] | undefined {
  return value === 'scan' || value === 'ai' ? value : undefined;
}

export function mapLexiconSenseFromRow(row: LexiconSenseRow): LexiconSense {
  return {
    id: row.id,
    lexiconEntryId: row.lexicon_entry_id,
    translationJa: row.translation_ja,
    normalizedTranslationJa: row.normalized_translation_ja,
    distinctKey: toNonEmptyString(row.distinct_key) ?? undefined,
    meaningSummary: toNonEmptyString(row.meaning_summary) ?? undefined,
    usageNotes: toNonEmptyString(row.usage_notes) ?? undefined,
    exampleSentence: toNonEmptyString(row.example_sentence) ?? undefined,
    exampleSentenceJa: toNonEmptyString(row.example_sentence_ja) ?? undefined,
    translationSource: toNonEmptyString(row.translation_source) ?? undefined,
    isPrimary: row.is_primary ?? false,
    createdAt: row.created_at ?? new Date(0).toISOString(),
    updatedAt: row.updated_at ?? new Date(0).toISOString(),
  };
}

export function mapLexiconEntryFromRow(row: LexiconEntryRow): LexiconEntry {
  const primarySenseTranslation = normalizeLexiconTranslation(row.translation_ja);
  return {
    id: row.id,
    headword: row.headword,
    normalizedHeadword: row.normalized_headword,
    pos: row.pos,
    cefrLevel: row.cefr_level ?? undefined,
    datasetSources: normalizeLexiconDatasetSources(row.dataset_sources ?? []),
    primarySense: row.primary_sense_id && primarySenseTranslation
      ? {
          id: row.primary_sense_id,
          lexiconEntryId: row.id,
          translationJa: primarySenseTranslation,
          normalizedTranslationJa: row.normalized_translation_ja ?? primarySenseTranslation,
          distinctKey: toNonEmptyString(row.distinct_key) ?? undefined,
          meaningSummary: toNonEmptyString(row.meaning_summary) ?? undefined,
          usageNotes: toNonEmptyString(row.usage_notes) ?? undefined,
          exampleSentence: toNonEmptyString(row.example_sentence) ?? undefined,
          exampleSentenceJa: toNonEmptyString(row.example_sentence_ja) ?? undefined,
          translationSource: row.translation_source ?? undefined,
          isPrimary: true,
          createdAt: row.created_at ?? new Date(0).toISOString(),
          updatedAt: row.updated_at ?? new Date(0).toISOString(),
        }
      : undefined,
    translationJa: primarySenseTranslation ?? undefined,
    translationSource: row.translation_source ?? undefined,
    exampleSentence: toNonEmptyString(row.example_sentence) ?? undefined,
    exampleSentenceJa: toNonEmptyString(row.example_sentence_ja) ?? undefined,
    createdAt: row.created_at ?? new Date(0).toISOString(),
    updatedAt: row.updated_at ?? new Date(0).toISOString(),
  };
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

function normalizeStringArray(value: unknown, maxCount: number): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const result: string[] = [];
  for (const item of value) {
    const normalized = toNonEmptyString(item);
    if (!normalized) continue;
    result.push(normalized);
    if (result.length >= maxCount) break;
  }
  return result.length > 0 ? result : undefined;
}

const MORPHOLOGY_PART_KINDS = new Set(['prefix', 'suffix', 'infix', 'root']);

function normalizeWordMorphologyValue(value: unknown): WordMorphology | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  if (record.version !== 1) return undefined;
  if (!Array.isArray(record.formula)) return undefined;

  const formula: WordMorphologyPart[] = [];
  for (const item of record.formula) {
    if (!item || typeof item !== 'object') return undefined;
    const part = item as Record<string, unknown>;
    const text = toNonEmptyString(part.text);
    const meaningJa = toNonEmptyString(part.meaningJa ?? part.meaning_ja);
    const kind = typeof part.kind === 'string' && MORPHOLOGY_PART_KINDS.has(part.kind)
      ? (part.kind as WordMorphologyPart['kind'])
      : undefined;
    if (!text || !meaningJa || !kind) return undefined;
    const affixId = toNonEmptyString(part.affixId ?? part.affix_id);
    formula.push({ text, kind, meaningJa, ...(affixId ? { affixId } : {}) });
  }

  const explanation = typeof record.explanation === 'string' ? record.explanation : '';
  const none = record.none === true;
  if (!none && (formula.length === 0 || !explanation)) return undefined;

  return {
    formula,
    explanation,
    version: 1,
    ...(none ? { none: true } : {}),
  };
}

function normalizeWordOrderQuizCache(value: unknown): WordOrderQuizCache | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  if (record.version !== 1) return undefined;

  const sourceEnglish = toNonEmptyString(record.sourceEnglish ?? record.source_english);
  const sourceJapanese = toNonEmptyString(record.sourceJapanese ?? record.source_japanese);
  const generatedAt = toNonEmptyString(record.generatedAt ?? record.generated_at);
  const sentenceTokens = normalizeStringArray(record.sentenceTokens ?? record.sentence_tokens, 30);
  const answerTokens = normalizeStringArray(record.answerTokens ?? record.answer_tokens, 3);
  const decoyTokens = normalizeStringArray(record.decoyTokens ?? record.decoy_tokens, 3);

  if (!sourceEnglish || !sourceJapanese || !generatedAt || !sentenceTokens || !answerTokens || !decoyTokens) {
    return undefined;
  }
  if (answerTokens.length < 1 || answerTokens.length > 3 || decoyTokens.length !== 3) {
    return undefined;
  }

  return {
    version: 1,
    sourceEnglish,
    sourceJapanese,
    sentenceTokens,
    answerTokens,
    decoyTokens,
    generatedAt,
  };
}

export function mapWordFromRow(row: WordRow): Word {
  const defaultSR = getDefaultSpacedRepetitionFields();
  const linkedSense = resolveLexiconSenseRow(row.lexicon_senses);
  return {
    id: row.id,
    projectId: row.project_id,
    english: resolveWordEnglish(row),
    japanese: resolveWordJapanese(row),
    translations: resolveWordTranslations(row),
    japaneseSource: normalizeJapaneseSource(row.japanese_source),
    vocabularyType: normalizeVocabularyType(row.vocabulary_type),
    lexiconEntryId: row.lexicon_entry_id ?? undefined,
    lexiconSenseId: row.lexicon_sense_id ?? linkedSense?.id ?? undefined,
    lexiconDistinctKey: toNonEmptyString(linkedSense?.distinct_key) ?? undefined,
    lexiconSenseIsPrimary: linkedSense?.is_primary ?? undefined,
    cefrLevel: resolveWordCefrLevel(row),
    distractors: normalizeDistractors(row.distractors),
    exampleSentence: resolveWordExampleSentence(row),
    exampleSentenceJa: resolveWordExampleSentenceJa(row),
    pronunciation: row.pronunciation ?? undefined,
    partOfSpeechTags: normalizePartOfSpeechTags(row.part_of_speech_tags),
    relatedWords: normalizeRelatedWords(row.related_words),
    usagePatterns: normalizeUsagePatterns(row.usage_patterns),
    insightsGeneratedAt: row.insights_generated_at ?? undefined,
    insightsVersion: row.insights_version ?? undefined,
    wordOrderQuiz: normalizeWordOrderQuizCache(row.word_order_quiz),
    morphology: normalizeWordMorphologyValue(row.morphology),
    status: (row.status as Word['status']) ?? 'new',
    createdAt: row.created_at,
    lastReviewedAt: row.last_reviewed_at ?? undefined,
    nextReviewAt: row.next_review_at ?? undefined,
    easeFactor: row.ease_factor ?? defaultSR.easeFactor,
    intervalDays: row.interval_days ?? defaultSR.intervalDays,
    repetition: row.repetition ?? defaultSR.repetition,
    isFavorite: row.is_favorite ?? false,
    customSections: normalizeCustomSections(row.custom_sections),
  };
}

function normalizeCustomSections(raw: unknown): CustomSection[] | undefined {
  const sections = normalizeCustomSectionsValue(raw);
  return sections.length > 0 ? sections : undefined;
}

export type WordInput = Omit<Word, 'id' | 'createdAt' | 'easeFactor' | 'intervalDays' | 'repetition' | 'isFavorite' | 'lastReviewedAt' | 'nextReviewAt' | 'status'>;

export function mapWordToInsert(word: WordInput): {
  project_id: string;
  english: string;
  japanese: string;
  japanese_source?: Word['japaneseSource'];
  vocabulary_type?: VocabularyType | null;
  lexicon_entry_id?: string;
  lexicon_sense_id?: string;
  distractors: string[];
  example_sentence?: string;
  example_sentence_ja?: string;
  pronunciation?: string;
  part_of_speech_tags?: string[];
  related_words?: RelatedWord[];
  usage_patterns?: UsagePattern[];
  insights_generated_at?: string;
  insights_version?: number;
  word_order_quiz?: WordOrderQuizCache;
  morphology?: WordMorphology;
  status: string;
  ease_factor: number;
  interval_days: number;
  repetition: number;
  is_favorite: boolean;
  custom_sections?: CustomSection[];
} {
  const defaultSR = getDefaultSpacedRepetitionFields();
  return {
    project_id: word.projectId,
    english: word.english,
    japanese: word.japanese,
    japanese_source: word.japaneseSource,
    vocabulary_type: word.vocabularyType ?? null,
    lexicon_entry_id: word.lexiconEntryId,
    lexicon_sense_id: word.lexiconSenseId,
    distractors: word.distractors,
    example_sentence: word.exampleSentence,
    example_sentence_ja: word.exampleSentenceJa,
    pronunciation: word.pronunciation,
    part_of_speech_tags: word.partOfSpeechTags,
    related_words: word.relatedWords,
    usage_patterns: word.usagePatterns,
    insights_generated_at: word.insightsGeneratedAt,
    insights_version: word.insightsVersion,
    word_order_quiz: word.wordOrderQuiz,
    morphology: word.morphology,
    status: 'new',
    ease_factor: defaultSR.easeFactor,
    interval_days: defaultSR.intervalDays,
    repetition: defaultSR.repetition,
    is_favorite: false,
    custom_sections: word.customSections,
  };
}

export function mapWordToInsertWithId(word: Word): {
  id: string;
  project_id: string;
  english: string;
  japanese: string;
  japanese_source?: Word['japaneseSource'];
  vocabulary_type?: VocabularyType | null;
  lexicon_entry_id?: string;
  lexicon_sense_id?: string;
  distractors: string[];
  example_sentence?: string;
  example_sentence_ja?: string;
  pronunciation?: string;
  part_of_speech_tags?: string[];
  related_words?: RelatedWord[];
  usage_patterns?: UsagePattern[];
  insights_generated_at?: string;
  insights_version?: number;
  word_order_quiz?: WordOrderQuizCache;
  morphology?: WordMorphology;
  status: string;
  created_at: string;
  last_reviewed_at?: string;
  next_review_at?: string;
  ease_factor: number;
  interval_days: number;
  repetition: number;
  is_favorite: boolean;
  custom_sections?: CustomSection[];
} {
  return {
    id: word.id,
    project_id: word.projectId,
    english: word.english,
    japanese: word.japanese,
    japanese_source: word.japaneseSource,
    vocabulary_type: word.vocabularyType ?? null,
    lexicon_entry_id: word.lexiconEntryId,
    lexicon_sense_id: word.lexiconSenseId,
    distractors: word.distractors,
    example_sentence: word.exampleSentence,
    example_sentence_ja: word.exampleSentenceJa,
    pronunciation: word.pronunciation,
    part_of_speech_tags: word.partOfSpeechTags,
    related_words: word.relatedWords,
    usage_patterns: word.usagePatterns,
    insights_generated_at: word.insightsGeneratedAt,
    insights_version: word.insightsVersion,
    word_order_quiz: word.wordOrderQuiz,
    morphology: word.morphology,
    status: word.status,
    created_at: word.createdAt,
    last_reviewed_at: word.lastReviewedAt,
    next_review_at: word.nextReviewAt,
    ease_factor: word.easeFactor,
    interval_days: word.intervalDays,
    repetition: word.repetition,
    is_favorite: word.isFavorite,
    custom_sections: word.customSections,
  };
}

export function mapWordUpdates(updates: Partial<Word>): Record<string, unknown> {
  const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (updates.english !== undefined) updateData.english = updates.english;
  if (updates.japanese !== undefined) updateData.japanese = updates.japanese;
  if (updates.japaneseSource !== undefined) updateData.japanese_source = updates.japaneseSource;
  if (updates.vocabularyType !== undefined) updateData.vocabulary_type = updates.vocabularyType;
  if (updates.lexiconEntryId !== undefined) updateData.lexicon_entry_id = updates.lexiconEntryId;
  if (updates.lexiconSenseId !== undefined) updateData.lexicon_sense_id = updates.lexiconSenseId;
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
  if (updates.wordOrderQuiz !== undefined) updateData.word_order_quiz = updates.wordOrderQuiz;
  if (updates.morphology !== undefined) updateData.morphology = updates.morphology;

  // Spaced repetition fields
  if (updates.lastReviewedAt !== undefined) updateData.last_reviewed_at = updates.lastReviewedAt;
  if (updates.nextReviewAt !== undefined) updateData.next_review_at = updates.nextReviewAt;
  if (updates.easeFactor !== undefined) updateData.ease_factor = updates.easeFactor;
  if (updates.intervalDays !== undefined) updateData.interval_days = updates.intervalDays;
  if (updates.repetition !== undefined) updateData.repetition = updates.repetition;
  if (updates.isFavorite !== undefined) updateData.is_favorite = updates.isFavorite;
  if (updates.customSections !== undefined) updateData.custom_sections = updates.customSections;

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
