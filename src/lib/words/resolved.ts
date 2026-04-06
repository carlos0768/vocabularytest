import { normalizeLexiconTranslation } from '../../../shared/lexicon';

export const LEXICON_SENSE_SELECT_COLUMNS =
  'id, lexicon_entry_id, translation_ja, normalized_translation_ja, meaning_summary, usage_notes, example_sentence, example_sentence_ja, translation_source, is_primary, created_at, updated_at' as const;

export const LEXICON_ENTRY_SELECT_COLUMNS =
  `id, headword, normalized_headword, pos, cefr_level, dataset_sources, created_at, updated_at, lexicon_senses(${LEXICON_SENSE_SELECT_COLUMNS})` as const;

const LINKED_LEXICON_SENSE_SELECT_COLUMNS = LEXICON_SENSE_SELECT_COLUMNS;

export const RESOLVED_WORD_SELECT_COLUMNS =
  `id, project_id, english, japanese, vocabulary_type, lexicon_entry_id, lexicon_sense_id, distractors, example_sentence, example_sentence_ja, pronunciation, part_of_speech_tags, related_words, usage_patterns, insights_generated_at, insights_version, status, created_at, last_reviewed_at, next_review_at, ease_factor, interval_days, repetition, is_favorite, lexicon_entries(${LEXICON_ENTRY_SELECT_COLUMNS}), linked_lexicon_sense:lexicon_senses(${LINKED_LEXICON_SENSE_SELECT_COLUMNS})` as const;

export const RESOLVED_WORD_TEXT_SELECT_COLUMNS =
  `id, project_id, english, japanese, vocabulary_type, lexicon_entry_id, lexicon_sense_id, lexicon_entries(${LEXICON_ENTRY_SELECT_COLUMNS}), linked_lexicon_sense:lexicon_senses(${LINKED_LEXICON_SENSE_SELECT_COLUMNS})` as const;

export const SHARE_VIEW_WORD_SELECT_COLUMNS =
  `id, project_id, english, japanese, vocabulary_type, lexicon_entry_id, lexicon_sense_id, distractors, example_sentence, example_sentence_ja, pronunciation, part_of_speech_tags, status, created_at, lexicon_entries(${LEXICON_ENTRY_SELECT_COLUMNS}), linked_lexicon_sense:lexicon_senses(${LINKED_LEXICON_SENSE_SELECT_COLUMNS})` as const;

export const RESOLVED_WORD_WITH_EMBEDDING_SELECT_COLUMNS =
  `${RESOLVED_WORD_TEXT_SELECT_COLUMNS}, embedding` as const;

type LexiconSenseJoinRow = {
  translation_ja?: string | null;
  example_sentence?: string | null;
  example_sentence_ja?: string | null;
  is_primary?: boolean | null;
};

type LexiconJoinRow = {
  headword?: string | null;
  cefr_level?: string | null;
  lexicon_senses?: LexiconSenseJoinRow[] | null;
};

export type ResolvableWordRow = {
  english: string;
  japanese: string;
  lexicon_entry_id?: string | null;
  lexicon_sense_id?: string | null;
  lexicon_entries?: LexiconJoinRow | LexiconJoinRow[] | null;
  linked_lexicon_sense?: LexiconSenseJoinRow | LexiconSenseJoinRow[] | null;
};

function firstLexiconJoinRow(value: ResolvableWordRow['lexicon_entries']): LexiconJoinRow | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }
  return value ?? null;
}

function firstLexiconSenseRow(
  value: ResolvableWordRow['linked_lexicon_sense'] | LexiconJoinRow['lexicon_senses'],
): LexiconSenseJoinRow | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }
  return value ?? null;
}

function primaryLexiconSenseRow(value: LexiconJoinRow['lexicon_senses']): LexiconSenseJoinRow | null {
  if (!Array.isArray(value) || value.length === 0) {
    return null;
  }
  return value.find((sense) => sense?.is_primary) ?? value[0] ?? null;
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
  const linkedSense = firstLexiconSenseRow(row.linked_lexicon_sense);
  const primarySense = primaryLexiconSenseRow(lexicon?.lexicon_senses);

  return {
    ...row,
    english: firstNonEmpty(lexicon?.headword) ?? row.english,
    japanese: firstNormalizedJapanese(linkedSense?.translation_ja)
      ?? firstNormalizedJapanese(primarySense?.translation_ja)
      ?? row.japanese,
    lexiconEntryId: row.lexicon_entry_id ?? undefined,
    lexiconSenseId: row.lexicon_sense_id ?? undefined,
    cefrLevel: firstNonEmpty(lexicon?.cefr_level),
  };
}
