import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';
import { normalizeWordForTranslationPersistence } from '@/lib/words/translation-persistence';
import type {
  CustomSection,
  RelatedWord,
  UsagePattern,
  WordOrderQuizCache,
  WordTranslation,
} from '@/types';

export type OfficialWordbookEikenLevel = '5' | '4' | '3' | 'pre2' | '2' | 'pre1' | '1';

type OfficialProjectRow = {
  id: string;
  title: string;
  official_title?: string | null;
  official_slug?: string | null;
  icon_image?: string | null;
  official_is_default?: boolean | null;
};

type SourceWordRow = {
  id: string;
  english: string;
  japanese?: string | null;
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

type SourceWordTranslationRow = {
  word_id: string;
  translation_ja: string;
  normalized_translation_ja?: string | null;
  source?: 'scan' | 'ai' | 'user' | null;
  lexicon_sense_id?: string | null;
  meaning_rank?: number | null;
  position?: number | null;
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

function isOfficialProjectSchemaError(error: PostgrestError | null): boolean {
  if (!error) return false;
  const text = `${error.code ?? ''} ${error.message ?? ''} ${error.details ?? ''} ${error.hint ?? ''}`.toLowerCase();
  return (
    error.code === '42P01'
    || error.code === '42703'
    || error.code === 'PGRST200'
    || error.code === 'PGRST204'
  ) && (
    text.includes('projects')
    || text.includes('words')
    || text.includes('word_translations')
    || text.includes('official_')
    || text.includes('schema cache')
    || text.includes('could not find')
    || text.includes('does not exist')
  );
}

function isWordTranslationsSchemaError(error: PostgrestError | null): boolean {
  if (!error) return false;
  const text = `${error.code ?? ''} ${error.message ?? ''} ${error.details ?? ''} ${error.hint ?? ''}`.toLowerCase();
  return (
    error.code === '42P01'
    || error.code === '42703'
    || error.code === 'PGRST200'
    || error.code === 'PGRST204'
  ) && (
    text.includes('word_translations')
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

function getOfficialProjectTitle(project: OfficialProjectRow): string {
  const officialTitle = project.official_title?.trim();
  return officialTitle || project.title;
}

function buildSourceTranslationPayload(translations: readonly SourceWordTranslationRow[]): unknown[] {
  return translations.map((translation) => ({
    translationJa: translation.translation_ja,
    normalizedTranslationJa: translation.normalized_translation_ja ?? translation.translation_ja,
    source: translation.source ?? undefined,
    lexiconSenseId: translation.lexicon_sense_id ?? undefined,
    meaningRank: translation.meaning_rank ?? undefined,
  }));
}

async function fetchSourceTranslations(
  supabase: SupabaseClient,
  wordIds: readonly string[],
): Promise<Map<string, SourceWordTranslationRow[]>> {
  const translationsByWordId = new Map<string, SourceWordTranslationRow[]>();
  if (wordIds.length === 0) return translationsByWordId;

  const { data, error } = await supabase
    .from('word_translations')
    .select([
      'word_id',
      'translation_ja',
      'normalized_translation_ja',
      'source',
      'lexicon_sense_id',
      'meaning_rank',
      'position',
    ].join(','))
    .in('word_id', wordIds)
    .order('position', { ascending: true })
    .order('meaning_rank', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) {
    if (isWordTranslationsSchemaError(error)) return translationsByWordId;
    throw new Error(`Failed to fetch official project translations: ${error.message}`);
  }

  for (const translation of (data ?? []) as unknown as SourceWordTranslationRow[]) {
    const list = translationsByWordId.get(translation.word_id) ?? [];
    list.push(translation);
    translationsByWordId.set(translation.word_id, list);
  }

  return translationsByWordId;
}

async function fetchOfficialProjectForLocalImport(
  supabase: SupabaseClient,
  eikenLevel: OfficialWordbookEikenLevel,
  officialProject: OfficialProjectRow,
): Promise<DefaultOfficialWordbookImportItem | null> {
  const { data: sourceRows, error: wordsError } = await supabase
    .from('words')
    .select([
      'id',
      'english',
      'japanese',
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
      'created_at',
    ].join(','))
    .eq('project_id', officialProject.id)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true });

  if (wordsError) {
    if (isOfficialProjectSchemaError(wordsError)) return null;
    throw new Error(`Failed to fetch official project words: ${wordsError.message}`);
  }

  const sourceWords = (sourceRows ?? []) as unknown as SourceWordRow[];
  if (sourceWords.length === 0) return null;

  const translationsByWordId = await fetchSourceTranslations(
    supabase,
    sourceWords.map((word) => word.id),
  );

  const words = sourceWords.map((word): DefaultOfficialWordbookImportWord => {
    const normalizedWord = normalizeWordForTranslationPersistence({
      english: word.english,
      japanese: word.japanese ?? '',
      translations: buildSourceTranslationPayload(translationsByWordId.get(word.id) ?? []),
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

  return {
    officialWordbookId: officialProject.id,
    ...(officialProject.official_slug ? { officialSlug: officialProject.official_slug } : {}),
    title: getOfficialProjectTitle(officialProject),
    sourceLabels: ['official', `eiken:${eikenLevel}`],
    ...(officialProject.icon_image ? { iconImage: officialProject.icon_image } : {}),
    words,
  };
}

export async function fetchDefaultOfficialWordbooksForLocalImport(
  supabase: SupabaseClient,
  eikenLevel: OfficialWordbookEikenLevel | null | undefined,
): Promise<DefaultOfficialWordbookImportResult> {
  if (!eikenLevel) return null;

  const { data: officialProjects, error: projectError } = await supabase
    .from('projects')
    .select('id,title,official_title,official_slug,icon_image,official_is_default')
    .eq('official_eiken_level', eikenLevel)
    .eq('official_is_active', true)
    .order('official_is_default', { ascending: false })
    .order('official_sort_order', { ascending: true })
    .order('created_at', { ascending: true });

  if (projectError) {
    if (isOfficialProjectSchemaError(projectError)) return null;
    throw new Error(`Failed to fetch official projects: ${projectError.message}`);
  }

  const activeProjects = (officialProjects ?? []) as unknown as OfficialProjectRow[];
  if (activeProjects.length === 0) return null;

  const defaultProjects = activeProjects.filter((project) => project.official_is_default);
  const projectsToImport = defaultProjects.length > 0 ? defaultProjects : activeProjects.slice(0, 1);
  const imported: DefaultOfficialWordbookImportItem[] = [];

  for (const officialProject of projectsToImport) {
    const result = await fetchOfficialProjectForLocalImport(supabase, eikenLevel, officialProject);
    if (result) imported.push(result);
  }

  return imported.length > 0 ? imported : null;
}
