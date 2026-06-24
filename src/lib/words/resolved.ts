import { normalizeLexiconTranslation } from '../../../shared/lexicon';

export const LEXICON_ENTRY_SELECT_COLUMNS =
  'id, headword, normalized_headword, pos, cefr_level, dataset_sources, translation_ja, translation_source, created_at, updated_at' as const;

export const LEXICON_SENSE_SELECT_COLUMNS =
  'id, lexicon_entry_id, translation_ja, normalized_translation_ja, distinct_key, meaning_summary, usage_notes, example_sentence, example_sentence_ja, translation_source, is_primary, created_at, updated_at' as const;

export const WORD_TRANSLATION_SELECT_COLUMNS =
  'id, word_id, lexicon_sense_id, translation_ja, normalized_translation_ja, source, meaning_rank, position, is_primary, created_at, updated_at' as const;

export const RESOLVED_WORD_SELECT_COLUMNS =
  `id, project_id, english, japanese, japanese_source, vocabulary_type, lexicon_entry_id, lexicon_sense_id, distractors, example_sentence, example_sentence_ja, pronunciation, part_of_speech_tags, related_words, usage_patterns, insights_generated_at, insights_version, word_order_quiz, status, created_at, last_reviewed_at, next_review_at, ease_factor, interval_days, repetition, is_favorite, custom_sections, word_translations(${WORD_TRANSLATION_SELECT_COLUMNS}), lexicon_entries(${LEXICON_ENTRY_SELECT_COLUMNS}), lexicon_senses(${LEXICON_SENSE_SELECT_COLUMNS})` as const;

export const RESOLVED_WORD_TEXT_SELECT_COLUMNS =
  `id, project_id, english, japanese, japanese_source, vocabulary_type, lexicon_entry_id, lexicon_sense_id, word_translations(${WORD_TRANSLATION_SELECT_COLUMNS}), lexicon_entries(${LEXICON_ENTRY_SELECT_COLUMNS}), lexicon_senses(${LEXICON_SENSE_SELECT_COLUMNS})` as const;

export const SHARE_VIEW_WORD_SELECT_COLUMNS =
  `id, project_id, english, japanese, japanese_source, vocabulary_type, lexicon_entry_id, lexicon_sense_id, distractors, example_sentence, example_sentence_ja, pronunciation, part_of_speech_tags, word_order_quiz, created_at, word_translations(${WORD_TRANSLATION_SELECT_COLUMNS}), lexicon_entries(${LEXICON_ENTRY_SELECT_COLUMNS}), lexicon_senses(${LEXICON_SENSE_SELECT_COLUMNS})` as const;

export const RESOLVED_WORD_WITH_EMBEDDING_SELECT_COLUMNS =
  `${RESOLVED_WORD_TEXT_SELECT_COLUMNS}, embedding` as const;

type LexiconJoinRow = {
  headword?: string | null;
  translation_ja?: string | null;
  cefr_level?: string | null;
};

export type ResolvableWordRow = {
  english: string;
  japanese: string;
  lexicon_entry_id?: string | null;
  lexicon_sense_id?: string | null;
  lexicon_entries?: LexiconJoinRow | LexiconJoinRow[] | null;
  lexicon_senses?: LexiconJoinRow | LexiconJoinRow[] | null;
};

function firstLexiconJoinRow(value: ResolvableWordRow['lexicon_entries']): LexiconJoinRow | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }
  return value ?? null;
}

function firstLexiconSenseJoinRow(value: ResolvableWordRow['lexicon_senses']): LexiconJoinRow | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }
  return value ?? null;
}

function firstNonEmpty(value: string | null | undefined): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function firstNormalizedJapanese(value: string | null | undefined): string | undefined {
  return normalizeLexiconTranslation(value) ?? undefined;
}

export function resolveSelectedWordTexts<T extends ResolvableWordRow>(
  row: T,
): Omit<T, 'english' | 'japanese'> & {
  english: string;
  japanese: string;
  lexiconEntryId?: string;
  lexiconSenseId?: string;
  cefrLevel?: string;
} {
  const lexicon = firstLexiconJoinRow(row.lexicon_entries);
  const sense = firstLexiconSenseJoinRow(row.lexicon_senses);

  return {
    ...row,
    english: firstNonEmpty(lexicon?.headword) ?? row.english,
    japanese: firstNormalizedJapanese(sense?.translation_ja)
      ?? firstNormalizedJapanese(lexicon?.translation_ja)
      ?? row.japanese,
    lexiconEntryId: row.lexicon_entry_id ?? undefined,
    lexiconSenseId: row.lexicon_sense_id ?? undefined,
    cefrLevel: firstNonEmpty(lexicon?.cefr_level),
  };
}
