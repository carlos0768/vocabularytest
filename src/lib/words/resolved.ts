import { normalizeLexiconTranslation } from '../../../shared/lexicon';

export const LEXICON_ENTRY_SELECT_COLUMNS =
  'id, headword, normalized_headword, pos, cefr_level, dataset_sources, translation_ja, translation_source, created_at, updated_at' as const;

export const RESOLVED_WORD_SELECT_COLUMNS =
  `id, project_id, english, japanese, lexicon_entry_id, english_override, japanese_override, distractors, example_sentence, example_sentence_ja, pronunciation, part_of_speech_tags, related_words, usage_patterns, insights_generated_at, insights_version, status, created_at, last_reviewed_at, next_review_at, ease_factor, interval_days, repetition, is_favorite, lexicon_entries(${LEXICON_ENTRY_SELECT_COLUMNS})` as const;

export const RESOLVED_WORD_TEXT_SELECT_COLUMNS =
  `id, project_id, english, japanese, lexicon_entry_id, english_override, japanese_override, lexicon_entries(${LEXICON_ENTRY_SELECT_COLUMNS})` as const;

// Minimal lexicon columns needed only for text resolution (headword, translation, cefr)
const SHARE_VIEW_LEXICON_SELECT_COLUMNS = 'headword, translation_ja, cefr_level' as const;

// Minimal SELECT for share page: covers display + import, omits heavy/unused fields
// Excluded: related_words, usage_patterns, insights_*, ease_factor, interval_days, repetition,
//           is_favorite, last_reviewed_at, next_review_at (none needed for view/import)
export const SHARE_VIEW_WORD_SELECT_COLUMNS =
  `id, project_id, english, japanese, lexicon_entry_id, english_override, japanese_override, distractors, example_sentence, example_sentence_ja, pronunciation, part_of_speech_tags, status, created_at, lexicon_entries(${SHARE_VIEW_LEXICON_SELECT_COLUMNS})` as const;

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
  english_override?: string | null;
  japanese_override?: string | null;
  lexicon_entries?: LexiconJoinRow | LexiconJoinRow[] | null;
};

function firstLexiconJoinRow(value: ResolvableWordRow['lexicon_entries']): LexiconJoinRow | null {
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
  cefrLevel?: string;
} {
  const lexicon = firstLexiconJoinRow(row.lexicon_entries);
  return {
    ...row,
    english: firstNonEmpty(row.english_override) ?? firstNonEmpty(lexicon?.headword) ?? row.english,
    japanese: firstNormalizedJapanese(row.japanese_override)
      ?? firstNormalizedJapanese(lexicon?.translation_ja)
      ?? firstNormalizedJapanese(row.japanese)
      ?? row.japanese,
    lexiconEntryId: row.lexicon_entry_id ?? undefined,
    cefrLevel: firstNonEmpty(lexicon?.cefr_level),
  };
}
