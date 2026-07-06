import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';
import {
  buildWordTranslationInsertRows,
  isWordTranslationsSchemaError,
  normalizeWordForTranslationPersistence,
} from '@/lib/words/translation-persistence';
import { getDefaultSpacedRepetitionFields } from '@/lib/spaced-repetition';
import { mapProjectToInsertWithId, mapWordToInsertWithId } from '../../../shared/db';
import type {
  CustomSection,
  Project,
  RelatedWord,
  UsagePattern,
  Word,
  WordOrderQuizCache,
  WordTranslation,
} from '@/types';

export type OfficialWordbookEikenLevel = '5' | '4' | '3' | 'pre2' | '2' | 'pre1' | '1';

type OfficialWordbookRow = {
  id: string;
  slug: string;
  title: string;
  icon_image?: string | null;
  source_labels?: unknown;
  is_default?: boolean | null;
};

type OfficialWordbookWordRow = {
  id: string;
  english: string;
  japanese?: string | null;
  translations?: unknown;
  distractors?: unknown;
  vocabulary_type?: string | null;
  japanese_source?: string | null;
  lexicon_entry_id?: string | null;
  lexicon_sense_id?: string | null;
  example_sentence?: string | null;
  example_sentence_ja?: string | null;
  pronunciation?: string | null;
  part_of_speech_tags?: unknown;
  related_words?: unknown;
  usage_patterns?: unknown;
  word_order_quiz?: unknown;
  custom_sections?: unknown;
};

export type DefaultOfficialWordbookImportWord = {
  english: string;
  japanese: string;
  translations?: WordTranslation[];
  distractors: string[];
  vocabularyType?: 'active' | 'passive' | null;
  japaneseSource?: 'scan' | 'ai';
  lexiconEntryId?: string;
  lexiconSenseId?: string;
  exampleSentence?: string;
  exampleSentenceJa?: string;
  pronunciation?: string;
  partOfSpeechTags?: string[];
  relatedWords?: RelatedWord[];
  usagePatterns?: UsagePattern[];
  wordOrderQuiz?: WordOrderQuizCache;
  customSections?: CustomSection[];
};

export type DefaultOfficialWordbookImportItem = {
  officialWordbookId: string;
  officialSlug?: string;
  title: string;
  sourceLabels: string[];
  iconImage?: string;
  words: DefaultOfficialWordbookImportWord[];
};

export type DefaultOfficialWordbookImportResult = DefaultOfficialWordbookImportItem[] | null;

function isOfficialWordbookSchemaError(error: PostgrestError | null): boolean {
  if (!error) return false;
  const text = `${error.code ?? ''} ${error.message ?? ''} ${error.details ?? ''} ${error.hint ?? ''}`.toLowerCase();
  return (
    error.code === '42P01'
    || error.code === '42703'
    || error.code === 'PGRST200'
    || error.code === 'PGRST204'
  ) && (
    text.includes('official_wordbooks')
    || text.includes('official_wordbook_words')
    || text.includes('schema cache')
    || text.includes('could not find')
    || text.includes('does not exist')
  );
}

function normalizeStringArray(value: unknown, maxItems = 20): string[] {
  if (!Array.isArray(value)) return [];
  const normalized: string[] = [];
  const seen = new Set<string>();

  for (const item of value) {
    if (typeof item !== 'string') continue;
    const trimmed = item.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    normalized.push(trimmed);
    if (normalized.length >= maxItems) break;
  }

  return normalized;
}

function normalizeJsonArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function normalizeNullableJson(value: unknown): unknown | null {
  return value === undefined ? null : value;
}

function normalizeVocabularyType(value: string | null | undefined): 'active' | 'passive' | null {
  return value === 'active' || value === 'passive' ? value : null;
}

function normalizeJapaneseSource(value: string | null | undefined): 'scan' | 'ai' | undefined {
  return value === 'scan' || value === 'ai' ? value : undefined;
}

async function fetchOfficialWordbookForLocalImport(
  supabase: SupabaseClient,
  eikenLevel: OfficialWordbookEikenLevel,
  officialWordbook: OfficialWordbookRow,
): Promise<DefaultOfficialWordbookImportItem | null> {
  const { data: sourceRows, error: wordsError } = await supabase
    .from('official_wordbook_words')
    .select([
      'id',
      'english',
      'japanese',
      'translations',
      'distractors',
      'vocabulary_type',
      'japanese_source',
      'lexicon_entry_id',
      'lexicon_sense_id',
      'example_sentence',
      'example_sentence_ja',
      'pronunciation',
      'part_of_speech_tags',
      'related_words',
      'usage_patterns',
      'word_order_quiz',
      'custom_sections',
      'sort_order',
      'created_at',
    ].join(','))
    .eq('official_wordbook_id', officialWordbook.id)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })
    .order('id', { ascending: true });

  if (wordsError) {
    if (isOfficialWordbookSchemaError(wordsError)) return null;
    throw new Error(`Failed to fetch official wordbook words: ${wordsError.message}`);
  }

  const sourceWords = (sourceRows ?? []) as unknown as OfficialWordbookWordRow[];
  if (sourceWords.length === 0) return null;

  const words = sourceWords.map((word): DefaultOfficialWordbookImportWord => {
    const normalizedWord = normalizeWordForTranslationPersistence({
      english: word.english,
      japanese: word.japanese ?? '',
      translations: normalizeJsonArray(word.translations),
      distractors: normalizeStringArray(word.distractors, 10),
      vocabularyType: normalizeVocabularyType(word.vocabulary_type),
      japaneseSource: normalizeJapaneseSource(word.japanese_source),
      lexiconEntryId: word.lexicon_entry_id ?? undefined,
      lexiconSenseId: word.lexicon_sense_id ?? undefined,
      exampleSentence: word.example_sentence ?? undefined,
      exampleSentenceJa: word.example_sentence_ja ?? undefined,
      pronunciation: word.pronunciation ?? undefined,
      partOfSpeechTags: normalizeStringArray(word.part_of_speech_tags, 10),
      relatedWords: normalizeNullableJson(word.related_words) as RelatedWord[] | undefined,
      usagePatterns: normalizeNullableJson(word.usage_patterns) as UsagePattern[] | undefined,
      wordOrderQuiz: normalizeNullableJson(word.word_order_quiz) as WordOrderQuizCache | undefined,
      customSections: normalizeJsonArray(word.custom_sections) as CustomSection[],
    });

    return {
      english: normalizedWord.english,
      japanese: normalizedWord.japanese,
      ...(normalizedWord.translations ? { translations: normalizedWord.translations } : {}),
      distractors: normalizedWord.distractors,
      ...(normalizedWord.vocabularyType ? { vocabularyType: normalizedWord.vocabularyType } : {}),
      ...(normalizedWord.japaneseSource ?? normalizeJapaneseSource(word.japanese_source)
        ? { japaneseSource: normalizedWord.japaneseSource ?? normalizeJapaneseSource(word.japanese_source) }
        : {}),
      ...(normalizedWord.lexiconEntryId ? { lexiconEntryId: normalizedWord.lexiconEntryId } : {}),
      ...(normalizedWord.lexiconSenseId ? { lexiconSenseId: normalizedWord.lexiconSenseId } : {}),
      ...(normalizedWord.exampleSentence ? { exampleSentence: normalizedWord.exampleSentence } : {}),
      ...(normalizedWord.exampleSentenceJa ? { exampleSentenceJa: normalizedWord.exampleSentenceJa } : {}),
      ...(normalizedWord.pronunciation ? { pronunciation: normalizedWord.pronunciation } : {}),
      ...(normalizedWord.partOfSpeechTags.length > 0 ? { partOfSpeechTags: normalizedWord.partOfSpeechTags } : {}),
      ...(normalizedWord.relatedWords ? { relatedWords: normalizedWord.relatedWords } : {}),
      ...(normalizedWord.usagePatterns ? { usagePatterns: normalizedWord.usagePatterns } : {}),
      ...(normalizedWord.wordOrderQuiz ? { wordOrderQuiz: normalizedWord.wordOrderQuiz } : {}),
      ...(normalizedWord.customSections ? { customSections: normalizedWord.customSections } : {}),
    };
  });

  const sourceLabels = normalizeStringArray(officialWordbook.source_labels, 20);
  return {
    officialWordbookId: officialWordbook.id,
    officialSlug: officialWordbook.slug,
    title: officialWordbook.title,
    sourceLabels: sourceLabels.length > 0 ? sourceLabels : ['official', `eiken:${eikenLevel}`],
    ...(officialWordbook.icon_image ? { iconImage: officialWordbook.icon_image } : {}),
    words,
  };
}

export async function fetchDefaultOfficialWordbooksForLocalImport(
  supabase: SupabaseClient,
  eikenLevel: OfficialWordbookEikenLevel | null | undefined,
): Promise<DefaultOfficialWordbookImportResult> {
  if (!eikenLevel) return null;

  const { data: officialWordbooks, error: wordbookError } = await supabase
    .from('official_wordbooks')
    .select('id,slug,title,source_labels,icon_image,is_default')
    .eq('eiken_level', eikenLevel)
    .eq('is_active', true)
    .order('is_default', { ascending: false })
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });

  if (wordbookError) {
    if (isOfficialWordbookSchemaError(wordbookError)) return null;
    throw new Error(`Failed to fetch official wordbooks: ${wordbookError.message}`);
  }

  const activeWordbooks = (officialWordbooks ?? []) as unknown as OfficialWordbookRow[];
  if (activeWordbooks.length === 0) return null;

  const defaultWordbooks = activeWordbooks.filter((wordbook) => wordbook.is_default);
  const wordbooksToImport = defaultWordbooks.length > 0 ? defaultWordbooks : activeWordbooks.slice(0, 1);
  const imported: DefaultOfficialWordbookImportItem[] = [];

  for (const officialWordbook of wordbooksToImport) {
    const result = await fetchOfficialWordbookForLocalImport(supabase, eikenLevel, officialWordbook);
    if (result) imported.push(result);
  }

  return imported.length > 0 ? imported : null;
}

function newId(): string {
  return globalThis.crypto.randomUUID();
}

/**
 * Persist default official wordbooks directly into the user's Supabase rows
 * (projects + words + word_translations) at signup time, instead of only
 * writing them to the browser's IndexedDB. This uses the service-role admin
 * client, so it runs server-side and bypasses RLS; the DB triggers
 * (set_word_user_id, enforce_free_project_limit) still apply. The client
 * hydrates its local cache from these rows on the next full sync.
 *
 * Existing projects are de-duplicated by imported_from_official_slug so a
 * re-run (or a mixed local/remote history) never creates duplicate wordbooks.
 */
export async function persistDefaultOfficialWordbooksToDb(
  adminClient: SupabaseClient,
  userId: string,
  wordbooks: DefaultOfficialWordbookImportItem[],
): Promise<void> {
  if (wordbooks.length === 0) return;

  const { data: existingProjects, error: existingError } = await adminClient
    .from('projects')
    .select('imported_from_official_slug')
    .eq('user_id', userId);
  if (existingError) {
    throw new Error(`Failed to read existing projects: ${existingError.message}`);
  }
  const importedSlugs = new Set(
    (existingProjects ?? [])
      .map((row) => (row as { imported_from_official_slug?: string | null }).imported_from_official_slug?.trim())
      .filter((slug): slug is string => Boolean(slug)),
  );

  const nowIso = new Date().toISOString();
  const srDefaults = getDefaultSpacedRepetitionFields();

  for (const wordbook of wordbooks) {
    const officialSlug = wordbook.officialSlug?.trim();
    if (officialSlug && importedSlugs.has(officialSlug)) {
      continue;
    }

    const projectId = newId();
    const project: Project = {
      id: projectId,
      userId,
      title: wordbook.title,
      sourceLabels: wordbook.sourceLabels,
      createdAt: nowIso,
      ...(wordbook.iconImage ? { iconImage: wordbook.iconImage } : {}),
      ...(officialSlug ? { importedFromOfficialSlug: officialSlug } : {}),
    };

    const { error: projectError } = await adminClient
      .from('projects')
      .insert(mapProjectToInsertWithId(project));
    if (projectError) {
      throw new Error(`Failed to insert default wordbook project: ${projectError.message}`);
    }
    if (officialSlug) importedSlugs.add(officialSlug);

    if (wordbook.words.length === 0) continue;

    const wordIds = wordbook.words.map(() => newId());
    const wordRows = wordbook.words.map((word, index) => mapWordToInsertWithId({
      id: wordIds[index],
      projectId,
      english: word.english,
      japanese: word.japanese,
      japaneseSource: word.japaneseSource,
      vocabularyType: word.vocabularyType ?? undefined,
      lexiconEntryId: word.lexiconEntryId,
      lexiconSenseId: word.lexiconSenseId,
      distractors: word.distractors ?? [],
      exampleSentence: word.exampleSentence,
      exampleSentenceJa: word.exampleSentenceJa,
      pronunciation: word.pronunciation,
      partOfSpeechTags: word.partOfSpeechTags,
      relatedWords: word.relatedWords,
      usagePatterns: word.usagePatterns,
      wordOrderQuiz: word.wordOrderQuiz,
      customSections: word.customSections,
      status: 'new',
      createdAt: nowIso,
      isFavorite: false,
      ...srDefaults,
    } as Word));

    const { error: wordsError } = await adminClient.from('words').insert(wordRows);
    if (wordsError) {
      throw new Error(`Failed to insert default wordbook words: ${wordsError.message}`);
    }

    const translationRows = buildWordTranslationInsertRows(wordbook.words, wordIds);
    if (translationRows.length > 0) {
      const { error: translationError } = await adminClient
        .from('word_translations')
        .upsert(translationRows, { onConflict: 'word_id,normalized_translation_ja' });
      // Translations are a non-critical enrichment: never fail the whole signup
      // import if the child table is unavailable or momentarily out of sync.
      if (translationError && !isWordTranslationsSchemaError(translationError)) {
        console.error('[import-default] Failed to insert word translations:', translationError.message);
      }
    }
  }
}
