import { normalizePartOfSpeechTags } from '@/lib/ai/part-of-speech';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import type { AIWordExtraction, LexiconEntry } from '@/types';
import type { SupabaseClient } from '@supabase/supabase-js';

import {
  buildLexiconKey,
  translateWithAI,
  translateWordsWithAI,
} from './ai';
import {
  normalizeHeadword,
  normalizeLexiconTranslation,
  resolvePrimaryLexiconPos,
  type LexiconPos,
  type LexiconTranslationSource,
} from '../../../shared/lexicon';

interface LexiconEntryRow {
  id: string;
  headword: string;
  normalized_headword: string;
  pos: string;
  cefr_level: string | null;
  dataset_sources: string[] | null;
  translation_ja: string | null;
  translation_source: string | null;
  created_at: string;
  updated_at: string;
}

export interface LexiconLookupKey {
  normalizedHeadword: string;
  pos: LexiconPos;
}

interface ImmediateWordInput extends Omit<
  AIWordExtraction,
  'japaneseSource'
> {
  japaneseSource?: string;
}

export type ResolvedImmediateWord<T extends ImmediateWordInput = ImmediateWordInput> = Omit<
  T,
  'english' | 'japanese' | 'japaneseSource' | 'lexiconEntryId' | 'cefrLevel' | 'partOfSpeechTags'
> & {
  english: string;
  japanese: string;
  japaneseSource?: LexiconTranslationSource;
  lexiconEntryId?: string;
  cefrLevel?: string;
  partOfSpeechTags?: string[];
};

export interface MasterFirstScanMetrics {
  lookupKeyCount: number;
  masterHitCount: number;
  masterTranslationHitCount: number;
  aiMissCount: number;
  lookupElapsedMs: number;
  translationElapsedMs: number;
  totalElapsedMs: number;
}

export interface ResolveImmediateWordsDeps {
  supabaseAdmin?: SupabaseClient;
  lookupEntries?: (keys: LexiconLookupKey[]) => Promise<LexiconEntry[]>;
  translateWords?: (
    inputs: Array<{ english: string; pos: LexiconPos }>
  ) => Promise<Map<string, string | null>>;
  translateWord?: (english: string, pos: LexiconPos) => Promise<string | null>;
}

interface PreparedWord<T extends ImmediateWordInput> {
  original: T;
  english: string;
  japanese: string;
  japaneseSource?: LexiconTranslationSource;
  partOfSpeechTags: string[];
  pos: LexiconPos;
  key: string | null;
}

interface PreferredJapaneseValue {
  japanese: string;
  japaneseSource?: LexiconTranslationSource;
}

function mapLexiconEntry(row: LexiconEntryRow): LexiconEntry {
  return {
    id: row.id,
    headword: row.headword,
    normalizedHeadword: row.normalized_headword,
    pos: row.pos,
    cefrLevel: row.cefr_level ?? undefined,
    datasetSources: row.dataset_sources ?? [],
    translationJa: normalizeLexiconTranslation(row.translation_ja) ?? undefined,
    translationSource: row.translation_source ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeJapaneseSource(value: unknown): LexiconTranslationSource | undefined {
  return value === 'scan' || value === 'ai' ? value : undefined;
}

function normalizeUsableJapanese(value: string | null | undefined): string {
  const normalized = normalizeLexiconTranslation(value) ?? '';
  return /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/.test(normalized) ? normalized : '';
}

function preferJapaneseValue(
  current: PreferredJapaneseValue | undefined,
  incoming: PreferredJapaneseValue,
): PreferredJapaneseValue {
  if (!current) {
    return incoming;
  }
  if (current.japaneseSource === 'scan') {
    return current;
  }
  if (incoming.japaneseSource === 'scan') {
    return incoming;
  }
  if (current.japaneseSource === 'ai' && incoming.japaneseSource !== 'ai') {
    return current;
  }
  if (incoming.japaneseSource === 'ai' && current.japaneseSource !== 'ai') {
    return incoming;
  }
  return current.japanese.length >= incoming.japanese.length ? current : incoming;
}

async function lookupLexiconEntriesByKeysDirect(
  supabaseAdmin: SupabaseClient,
  keys: LexiconLookupKey[],
): Promise<LexiconEntry[]> {
  if (keys.length === 0) {
    return [];
  }

  const normalizedHeadwords = Array.from(new Set(keys.map((key) => key.normalizedHeadword)));
  const positions = Array.from(new Set(keys.map((key) => key.pos)));

  const { data, error } = await supabaseAdmin
    .from('lexicon_entries')
    .select('id, headword, normalized_headword, pos, cefr_level, dataset_sources, translation_ja, translation_source, created_at, updated_at')
    .in('normalized_headword', normalizedHeadwords)
    .in('pos', positions);

  if (error) {
    throw new Error(`Failed to load lexicon entries: ${error.message}`);
  }

  const requested = new Set(keys.map((key) => buildLexiconKey(key.normalizedHeadword, key.pos)));
  return ((data ?? []) as LexiconEntryRow[])
    .map(mapLexiconEntry)
    .filter((entry) => requested.has(buildLexiconKey(entry.normalizedHeadword, entry.pos as LexiconPos)));
}

export async function lookupLexiconEntriesByKeys(
  keys: LexiconLookupKey[],
  deps?: Pick<ResolveImmediateWordsDeps, 'lookupEntries' | 'supabaseAdmin'>,
): Promise<LexiconEntry[]> {
  const uniqueKeys = Array.from(
    new Map(
      keys
        .filter((key) => key.normalizedHeadword)
        .map((key) => [`${key.normalizedHeadword}::${key.pos}`, key] as const),
    ).values(),
  );

  if (uniqueKeys.length === 0) {
    return [];
  }

  if (deps?.lookupEntries) {
    return deps.lookupEntries(uniqueKeys);
  }

  const supabaseAdmin = deps?.supabaseAdmin ?? getSupabaseAdmin();
  const payload = uniqueKeys.map((key) => ({
    normalized_headword: key.normalizedHeadword,
    pos: key.pos,
  }));

  const rpcResult = await supabaseAdmin.rpc('get_lexicon_entries_by_keys', {
    p_keys: payload,
  });

  if (!rpcResult.error && Array.isArray(rpcResult.data)) {
    return (rpcResult.data as LexiconEntryRow[]).map(mapLexiconEntry);
  }

  if (rpcResult.error) {
    console.warn('[master-first-scan] Falling back to direct lexicon lookup', {
      error: rpcResult.error.message,
      keyCount: uniqueKeys.length,
    });
  }

  return lookupLexiconEntriesByKeysDirect(supabaseAdmin, uniqueKeys);
}

export async function resolveImmediateWordsWithMasterFirst<T extends ImmediateWordInput>(
  words: T[],
  deps?: ResolveImmediateWordsDeps,
): Promise<{
  words: ResolvedImmediateWord<T>[];
  lexiconEntries: LexiconEntry[];
  metrics: MasterFirstScanMetrics;
}> {
  const startedAt = Date.now();
  const translateWords = deps?.translateWords ?? translateWordsWithAI;
  const translateWord = deps?.translateWord ?? translateWithAI;

  const preparedWords: PreparedWord<T>[] = words.map((word) => {
    const english = word.english.trim();
    const japanese = normalizeUsableJapanese(word.japanese);
    const partOfSpeechTags = normalizePartOfSpeechTags(word.partOfSpeechTags);
    const pos = resolvePrimaryLexiconPos(partOfSpeechTags);
    return {
      original: word,
      english,
      japanese,
      japaneseSource: japanese ? normalizeJapaneseSource(word.japaneseSource) : undefined,
      partOfSpeechTags,
      pos,
      key: english ? buildLexiconKey(english, pos) : null,
    };
  });

  const lookupKeys = Array.from(
    new Map(
      preparedWords
        .filter((word) => word.key)
        .map((word) => [
          word.key as string,
          {
            normalizedHeadword: normalizeHeadword(word.english),
            pos: word.pos,
          },
        ] as const),
    ).values(),
  );

  const preferredJapaneseByKey = new Map<string, PreferredJapaneseValue>();
  for (const word of preparedWords) {
    if (!word.key || !word.japanese) continue;
    preferredJapaneseByKey.set(
      word.key,
      preferJapaneseValue(preferredJapaneseByKey.get(word.key), {
        japanese: word.japanese,
        japaneseSource: word.japaneseSource,
      }),
    );
  }

  const lookupStartedAt = Date.now();
  const lexiconEntries = await lookupLexiconEntriesByKeys(lookupKeys, deps);
  const lookupElapsedMs = Date.now() - lookupStartedAt;
  const entryByKey = new Map(
    lexiconEntries.map((entry) => [
      buildLexiconKey(entry.normalizedHeadword, entry.pos as LexiconPos),
      entry,
    ] as const),
  );

  const translationInputsByKey = new Map<string, { english: string; pos: LexiconPos }>();
  for (const word of preparedWords) {
    if (!word.key || word.japanese) continue;
    const entry = entryByKey.get(word.key);
    if (entry?.translationJa) {
      continue;
    }
    if (preferredJapaneseByKey.has(word.key)) {
      continue;
    }
    if (!translationInputsByKey.has(word.key)) {
      translationInputsByKey.set(word.key, {
        english: word.english,
        pos: word.pos,
      });
    }
  }

  const translationStartedAt = Date.now();
  const batchTranslations = translationInputsByKey.size > 0
    ? await translateWords(Array.from(translationInputsByKey.values()))
    : new Map<string, string | null>();
  const aiTranslationsByKey = new Map<string, string>();

  for (const [key, input] of translationInputsByKey.entries()) {
    const normalizedBatchTranslation = normalizeUsableJapanese(batchTranslations.get(key));
    if (normalizedBatchTranslation) {
      aiTranslationsByKey.set(key, normalizedBatchTranslation);
      continue;
    }

    const fallbackTranslation = normalizeUsableJapanese(
      await translateWord(input.english, input.pos),
    );
    if (fallbackTranslation) {
      aiTranslationsByKey.set(key, fallbackTranslation);
    }
  }
  const translationElapsedMs = Date.now() - translationStartedAt;

  let masterHitCount = 0;
  let masterTranslationHitCount = 0;
  let aiMissCount = 0;

  const resolvedWords = preparedWords.map((word) => {
    const entry = word.key ? entryByKey.get(word.key) : undefined;
    const masterTranslation = normalizeUsableJapanese(entry?.translationJa);
    const preferredJapanese = word.key ? preferredJapaneseByKey.get(word.key) : undefined;
    const aiTranslation = word.key ? aiTranslationsByKey.get(word.key) : undefined;

    let japanese = word.japanese;
    let japaneseSource = word.japaneseSource;

    if (!japanese) {
      if (masterTranslation) {
        japanese = masterTranslation;
        japaneseSource = undefined;
        masterTranslationHitCount += 1;
      } else if (preferredJapanese) {
        japanese = preferredJapanese.japanese;
        japaneseSource = preferredJapanese.japaneseSource;
      } else if (aiTranslation) {
        japanese = aiTranslation;
        japaneseSource = 'ai';
        aiMissCount += 1;
      }
    }

    if (entry?.id) {
      masterHitCount += 1;
    }

    return {
      ...word.original,
      english: word.english,
      japanese,
      japaneseSource,
      lexiconEntryId: entry?.id ?? word.original.lexiconEntryId,
      cefrLevel: entry?.cefrLevel ?? word.original.cefrLevel,
      partOfSpeechTags: word.partOfSpeechTags,
    };
  });

  return {
    words: resolvedWords,
    lexiconEntries,
    metrics: {
      lookupKeyCount: lookupKeys.length,
      masterHitCount,
      masterTranslationHitCount,
      aiMissCount,
      lookupElapsedMs,
      translationElapsedMs,
      totalElapsedMs: Date.now() - startedAt,
    },
  };
}
