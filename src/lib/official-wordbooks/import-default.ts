import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';
import { getDefaultSpacedRepetitionFields } from '@/lib/spaced-repetition';
import {
  buildWordTranslationInsertRows,
  normalizeWordForTranslationPersistence,
} from '@/lib/words/translation-persistence';

export type OfficialWordbookEikenLevel = '5' | '4' | '3' | 'pre2' | '2' | 'pre1' | '1';

type OfficialWordbookRow = {
  id: string;
  title: string;
  source_labels?: unknown;
  icon_image?: string | null;
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

type CreatedProjectRow = {
  id: string;
};

type CreatedWordRow = {
  id: string;
};

export type DefaultOfficialWordbookImportItem = {
  officialWordbookId: string;
  projectId: string;
  wordCount: number;
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

export async function importDefaultOfficialWordbook(
  supabase: SupabaseClient,
  userId: string,
  eikenLevel: OfficialWordbookEikenLevel | null | undefined,
): Promise<DefaultOfficialWordbookImportResult> {
  if (!eikenLevel) return null;

  const { data: officialWordbooks, error: wordbookError } = await supabase
    .from('official_wordbooks')
    .select('id,title,source_labels,icon_image,is_default')
    .eq('eiken_level', eikenLevel)
    .eq('is_active', true)
    .order('is_default', { ascending: false })
    .order('sort_order', { ascending: true });

  if (wordbookError) {
    if (isOfficialWordbookSchemaError(wordbookError)) return null;
    throw new Error(`Failed to fetch official wordbook: ${wordbookError.message}`);
  }

  const activeWordbooks = (officialWordbooks ?? []) as unknown as OfficialWordbookRow[];
  if (activeWordbooks.length === 0) return null;

  const defaultWordbooks = activeWordbooks.filter((wordbook) => wordbook.is_default);
  const wordbooksToImport = defaultWordbooks.length > 0 ? defaultWordbooks : activeWordbooks.slice(0, 1);
  const createdProjectIds: string[] = [];
  const imported: DefaultOfficialWordbookImportItem[] = [];

  try {
    for (const officialWordbook of wordbooksToImport) {
      const { data: officialWords, error: wordsError } = await supabase
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
        ].join(','))
        .eq('official_wordbook_id', officialWordbook.id)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });

      if (wordsError) {
        if (isOfficialWordbookSchemaError(wordsError)) return imported.length > 0 ? imported : null;
        throw new Error(`Failed to fetch official wordbook words: ${wordsError.message}`);
      }

      const sourceWords = (officialWords ?? []) as unknown as OfficialWordbookWordRow[];
      if (sourceWords.length === 0) continue;

      const sourceLabels = normalizeStringArray(officialWordbook.source_labels);
      const { data: project, error: projectError } = await supabase
        .from('projects')
        .insert({
          user_id: userId,
          title: officialWordbook.title,
          source_labels: sourceLabels.length > 0 ? sourceLabels : ['official', `eiken:${eikenLevel}`],
          ...(officialWordbook.icon_image ? { icon_image: officialWordbook.icon_image } : {}),
        })
        .select('id')
        .single<CreatedProjectRow>();

      if (projectError || !project) {
        throw new Error(`Failed to create imported official wordbook: ${projectError?.message ?? 'missing project row'}`);
      }
      createdProjectIds.push(project.id);

      const defaultSR = getDefaultSpacedRepetitionFields();
      const normalizedWords = sourceWords.map((word) => normalizeWordForTranslationPersistence({
        projectId: project.id,
        english: word.english,
        japanese: word.japanese ?? '',
        translations: word.translations ?? undefined,
        distractors: normalizeStringArray(word.distractors, 10),
        vocabularyType: normalizeVocabularyType(word.vocabulary_type),
        japaneseSource: normalizeJapaneseSource(word.japanese_source),
        lexiconEntryId: word.lexicon_entry_id ?? undefined,
        lexiconSenseId: word.lexicon_sense_id ?? undefined,
        exampleSentence: word.example_sentence ?? undefined,
        exampleSentenceJa: word.example_sentence_ja ?? undefined,
        pronunciation: word.pronunciation ?? undefined,
        partOfSpeechTags: normalizeStringArray(word.part_of_speech_tags, 10),
        relatedWords: normalizeNullableJson(word.related_words),
        usagePatterns: normalizeNullableJson(word.usage_patterns),
        wordOrderQuiz: normalizeNullableJson(word.word_order_quiz),
        customSections: normalizeJsonArray(word.custom_sections),
      }));

      const wordRows = normalizedWords.map((word, index) => ({
        project_id: project.id,
        english: word.english,
        japanese: word.japanese,
        japanese_source: word.japaneseSource ?? normalizeJapaneseSource(sourceWords[index]?.japanese_source) ?? null,
        vocabulary_type: word.vocabularyType ?? null,
        lexicon_entry_id: word.lexiconEntryId ?? null,
        lexicon_sense_id: word.lexiconSenseId ?? null,
        distractors: word.distractors,
        example_sentence: word.exampleSentence ?? null,
        example_sentence_ja: word.exampleSentenceJa ?? null,
        pronunciation: word.pronunciation ?? null,
        part_of_speech_tags: word.partOfSpeechTags.length > 0 ? word.partOfSpeechTags : null,
        related_words: word.relatedWords ?? null,
        usage_patterns: word.usagePatterns ?? null,
        word_order_quiz: word.wordOrderQuiz ?? null,
        custom_sections: word.customSections ?? [],
        status: 'new',
        ease_factor: defaultSR.easeFactor,
        interval_days: defaultSR.intervalDays,
        repetition: defaultSR.repetition,
        is_favorite: false,
      }));

      const { data: createdWords, error: createWordsError } = await supabase
        .from('words')
        .insert(wordRows)
        .select('id');

      if (createWordsError) {
        throw new Error(`Failed to create official wordbook words: ${createWordsError.message}`);
      }

      const createdWordRows = (createdWords ?? []) as CreatedWordRow[];
      const translationRows = buildWordTranslationInsertRows(
        normalizedWords,
        createdWordRows.map((word) => word.id),
      );

      if (translationRows.length > 0) {
        const { error: translationError } = await supabase
          .from('word_translations')
          .upsert(translationRows, { onConflict: 'word_id,normalized_translation_ja' });

        if (translationError) {
          throw new Error(`Failed to create official wordbook translations: ${translationError.message}`);
        }
      }

      imported.push({
        officialWordbookId: officialWordbook.id,
        projectId: project.id,
        wordCount: createdWordRows.length,
      });
    }

    return imported.length > 0 ? imported : null;
  } catch (error) {
    for (const projectId of createdProjectIds) {
      await supabase.from('projects').delete().eq('id', projectId);
    }
    throw error;
  }
}
