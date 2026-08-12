import { normalizeLexiconTranslation } from '../../../shared/lexicon';

export const LEXICON_ENTRY_SELECT_COLUMNS =
  'id, headword, normalized_headword, pos, cefr_level, dataset_sources, translation_ja, translation_source, created_at, updated_at' as const;

export const LEXICON_SENSE_SELECT_COLUMNS =
  'id, lexicon_entry_id, translation_ja, normalized_translation_ja, distinct_key, meaning_summary, usage_notes, example_sentence, example_sentence_ja, translation_source, is_primary, created_at, updated_at' as const;

export const WORD_TRANSLATION_SELECT_COLUMNS =
  'id, word_id, lexicon_sense_id, translation_ja, normalized_translation_ja, source, meaning_rank, position, is_primary, status, last_reviewed_at, next_review_at, ease_factor, interval_days, repetition, created_at, updated_at' as const;

export const WORD_TRANSLATION_WITH_SENSE_SELECT_COLUMNS =
  `${WORD_TRANSLATION_SELECT_COLUMNS}, lexicon_senses(${LEXICON_SENSE_SELECT_COLUMNS})` as const;

export const RESOLVED_WORD_BASE_SELECT_COLUMNS =
  'id, project_id, english, japanese, japanese_source, vocabulary_type, lexicon_entry_id, lexicon_sense_id, distractors, example_sentence, example_sentence_ja, pronunciation, part_of_speech_tags, related_words, usage_patterns, insights_generated_at, insights_version, word_order_quiz, morphology, derived_words, status, created_at, last_reviewed_at, next_review_at, ease_factor, interval_days, repetition, is_favorite, custom_sections' as const;

export const RESOLVED_WORD_TEXT_BASE_SELECT_COLUMNS =
  'id, project_id, english, japanese, japanese_source, vocabulary_type, lexicon_entry_id, lexicon_sense_id' as const;

export const SHARE_VIEW_WORD_BASE_SELECT_COLUMNS =
  'id, project_id, english, japanese, japanese_source, vocabulary_type, lexicon_entry_id, lexicon_sense_id, distractors, example_sentence, example_sentence_ja, pronunciation, part_of_speech_tags, word_order_quiz, morphology, derived_words, created_at' as const;

export const RESOLVED_WORD_DISPLAY_WITH_PRONUNCIATION_SELECT_COLUMNS =
  'id, project_id, english, japanese, distractors, example_sentence, example_sentence_ja, pronunciation, part_of_speech_tags, status, created_at, last_reviewed_at, next_review_at, ease_factor, interval_days, repetition, is_favorite' as const;

export const RESOLVED_WORD_DISPLAY_SELECT_COLUMNS =
  'id, project_id, english, japanese, distractors, example_sentence, example_sentence_ja, part_of_speech_tags, status, created_at, last_reviewed_at, next_review_at, ease_factor, interval_days, repetition, is_favorite' as const;

export const RESOLVED_WORD_EXAMPLE_SELECT_COLUMNS =
  'id, project_id, english, japanese, distractors, example_sentence, example_sentence_ja, status, created_at, last_reviewed_at, next_review_at, ease_factor, interval_days, repetition, is_favorite' as const;

export const RESOLVED_WORD_MINIMAL_SELECT_COLUMNS =
  'id, project_id, english, japanese, distractors, status, created_at' as const;

export const RESOLVED_WORD_SELECT_COLUMNS =
  `${RESOLVED_WORD_BASE_SELECT_COLUMNS}, word_translations(${WORD_TRANSLATION_WITH_SENSE_SELECT_COLUMNS}), lexicon_entries(${LEXICON_ENTRY_SELECT_COLUMNS}), lexicon_senses(${LEXICON_SENSE_SELECT_COLUMNS})` as const;

export const RESOLVED_WORD_SELECT_COLUMNS_WITHOUT_SENSES =
  `${RESOLVED_WORD_BASE_SELECT_COLUMNS}, word_translations(${WORD_TRANSLATION_SELECT_COLUMNS}), lexicon_entries(${LEXICON_ENTRY_SELECT_COLUMNS})` as const;

export const RESOLVED_WORD_SELECT_COLUMNS_BASIC =
  RESOLVED_WORD_BASE_SELECT_COLUMNS;

export const RESOLVED_WORD_TEXT_SELECT_COLUMNS =
  `${RESOLVED_WORD_TEXT_BASE_SELECT_COLUMNS}, word_translations(${WORD_TRANSLATION_WITH_SENSE_SELECT_COLUMNS}), lexicon_entries(${LEXICON_ENTRY_SELECT_COLUMNS}), lexicon_senses(${LEXICON_SENSE_SELECT_COLUMNS})` as const;

export const RESOLVED_WORD_TEXT_SELECT_COLUMNS_WITHOUT_SENSES =
  `${RESOLVED_WORD_TEXT_BASE_SELECT_COLUMNS}, word_translations(${WORD_TRANSLATION_SELECT_COLUMNS}), lexicon_entries(${LEXICON_ENTRY_SELECT_COLUMNS})` as const;

export const RESOLVED_WORD_TEXT_SELECT_COLUMNS_BASIC =
  RESOLVED_WORD_TEXT_BASE_SELECT_COLUMNS;

export const RESOLVED_WORD_TEXT_SELECT_COLUMNS_MINIMAL =
  RESOLVED_WORD_MINIMAL_SELECT_COLUMNS;

export const SHARE_VIEW_WORD_SELECT_COLUMNS =
  `${SHARE_VIEW_WORD_BASE_SELECT_COLUMNS}, word_translations(${WORD_TRANSLATION_WITH_SENSE_SELECT_COLUMNS}), lexicon_entries(${LEXICON_ENTRY_SELECT_COLUMNS}), lexicon_senses(${LEXICON_SENSE_SELECT_COLUMNS})` as const;

export const SHARE_VIEW_WORD_SELECT_COLUMNS_WITHOUT_SENSES =
  `${SHARE_VIEW_WORD_BASE_SELECT_COLUMNS}, word_translations(${WORD_TRANSLATION_SELECT_COLUMNS}), lexicon_entries(${LEXICON_ENTRY_SELECT_COLUMNS})` as const;

export const SHARE_VIEW_WORD_SELECT_COLUMNS_BASIC =
  SHARE_VIEW_WORD_BASE_SELECT_COLUMNS;

export const SHARE_VIEW_WORD_SELECT_COLUMNS_DISPLAY_WITH_PRONUNCIATION =
  RESOLVED_WORD_DISPLAY_WITH_PRONUNCIATION_SELECT_COLUMNS;

export const SHARE_VIEW_WORD_SELECT_COLUMNS_DISPLAY =
  RESOLVED_WORD_DISPLAY_SELECT_COLUMNS;

export const SHARE_VIEW_WORD_SELECT_COLUMNS_EXAMPLE =
  RESOLVED_WORD_EXAMPLE_SELECT_COLUMNS;

export const SHARE_VIEW_WORD_SELECT_COLUMNS_MINIMAL =
  RESOLVED_WORD_MINIMAL_SELECT_COLUMNS;

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

// ============ derived_words 列の後方互換 ============
//
// derived_words は後から足した列なので、マイグレーション未適用のDBでは
// SELECT 自体が 42703 / PGRST204 で失敗する。全単語取得のカラム定数に
// 含めている以上、列が無い環境でも単語一覧・共有単語帳が壊れないように
// 「derived_words だけ落として1回だけ再試行する」ラッパを通す。
//
// scan_jobs.include_derived_words / words insert 側の同種フォールバックは
// scan-jobs-compat.ts と server-cloud-persistence.ts にある。

const DERIVED_WORDS_COLUMN_FRAGMENT = ', derived_words';

type MaybeColumnError = {
  code?: unknown;
  message?: unknown;
  details?: unknown;
  hint?: unknown;
} | null;

export function isMissingDerivedWordsColumnError(error: MaybeColumnError): boolean {
  if (!error) return false;
  const { code } = error;
  if (code !== '42703' && code !== 'PGRST204') return false;
  const text = `${error.message ?? ''} ${error.details ?? ''} ${error.hint ?? ''}`.toLowerCase();
  return text.includes('derived_words');
}

export function stripDerivedWordsColumn(columns: string): string {
  return columns.replace(DERIVED_WORDS_COLUMN_FRAGMENT, '');
}

/**
 * カラム文字列を受け取るクエリを実行し、derived_words 列が無いDBだった場合だけ
 * その列を外して1回再試行する。列がある環境では余分なクエリを一切投げない。
 */
export async function withDerivedWordsColumnFallback<T extends { error: MaybeColumnError }>(
  run: (columns: string) => PromiseLike<T>,
  columns: string,
): Promise<T> {
  const first = await run(columns);
  if (!isMissingDerivedWordsColumnError(first.error)) return first;

  const stripped = stripDerivedWordsColumn(columns);
  if (stripped === columns) return first;
  console.warn('[words] derived_words column compatibility fallback used');
  return run(stripped);
}
