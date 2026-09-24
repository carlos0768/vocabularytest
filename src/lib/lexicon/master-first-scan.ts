import { shouldSkipEnglishEnrichment } from '@/lib/classical/is-classical';
import { normalizePartOfSpeechTags } from '@/lib/ai/part-of-speech';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import type { AIWordExtraction, LexiconEntry } from '@/types';
import type { SupabaseClient } from '@supabase/supabase-js';

import {
  buildLexiconKey,
  translateWithAI,
  translateWordsWithAI,
} from './ai';
import { normalizeReusableDistractors } from './quiz-content-lexicon';
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
  primary_sense_id?: string | null;
  translation_ja: string | null;
  normalized_translation_ja?: string | null;
  distinct_key?: string | null;
  meaning_summary?: string | null;
  usage_notes?: string | null;
  translation_source: string | null;
  example_sentence: string | null;
  example_sentence_ja: string | null;
  pronunciation?: string | null;
  distractors?: unknown;
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
  'english' | 'japanese' | 'japaneseSource' | 'lexiconEntryId' | 'lexiconSenseId' | 'cefrLevel' | 'partOfSpeechTags' | 'pronunciation'
> & {
  english: string;
  japanese: string;
  japaneseSource?: LexiconTranslationSource;
  lexiconEntryId?: string;
  lexiconSenseId?: string;
  lexiconDistinctKey?: string;
  lexiconSenseIsPrimary?: boolean;
  cefrLevel?: string;
  partOfSpeechTags?: string[];
  pronunciation?: string;
};

export interface MasterFirstScanMetrics {
  lookupKeyCount: number;
  masterHitCount: number;
  masterTranslationHitCount: number;
  masterPronunciationHitCount: number;
  masterDistractorHitCount: number;
  /** 見出し語フォールバック（品詞不一致）でマスターに当たった語数 */
  masterHeadwordFallbackHitCount: number;
  aiMissCount: number;
  lookupElapsedMs: number;
  translationElapsedMs: number;
  totalElapsedMs: number;
}

export interface ResolveImmediateWordsDeps {
  supabaseAdmin?: SupabaseClient;
  lookupEntries?: (keys: LexiconLookupKey[]) => Promise<LexiconEntry[]>;
  lookupEntriesByHeadwords?: (normalizedHeadwords: string[]) => Promise<LexiconEntry[]>;
  translateWords?: (
    inputs: Array<{ english: string; pos: LexiconPos }>
  ) => Promise<Map<string, string | null>>;
  translateWord?: (english: string, pos: LexiconPos) => Promise<string | null>;
}

export interface ResolveImmediateWordsOptions {
  /**
   * trueの場合、マスター（lexicon_entries）の例文を単語へprefillしない。
   * ジャンル指定ユーザはマスターの汎用例文を使わず、毎回ジャンル別に
   * 例文を生成するために使う（訳語・lexiconEntryIdの解決は通常通り行う）。
   */
  skipMasterExamples?: boolean;
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
  const translationJa = normalizeLexiconTranslation(row.translation_ja) ?? undefined;
  return {
    id: row.id,
    headword: row.headword,
    normalizedHeadword: row.normalized_headword,
    pos: row.pos,
    cefrLevel: row.cefr_level ?? undefined,
    datasetSources: row.dataset_sources ?? [],
    primarySense: row.primary_sense_id && translationJa
      ? {
          id: row.primary_sense_id,
          lexiconEntryId: row.id,
          translationJa,
          normalizedTranslationJa: row.normalized_translation_ja ?? translationJa,
          distinctKey: row.distinct_key ?? undefined,
          meaningSummary: row.meaning_summary ?? undefined,
          usageNotes: row.usage_notes ?? undefined,
          exampleSentence: row.example_sentence ?? undefined,
          exampleSentenceJa: row.example_sentence_ja ?? undefined,
          translationSource: row.translation_source ?? undefined,
          distractors: normalizeReusableDistractors(row.distractors) ?? undefined,
          isPrimary: true,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        }
      : undefined,
    translationJa,
    translationSource: row.translation_source ?? undefined,
    exampleSentence: row.example_sentence ?? undefined,
    exampleSentenceJa: row.example_sentence_ja ?? undefined,
    pronunciation: typeof row.pronunciation === 'string' && row.pronunciation.trim()
      ? row.pronunciation.trim()
      : undefined,
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
    .from('lexicon_entry_resolved_rows')
    .select('id, headword, normalized_headword, pos, cefr_level, dataset_sources, primary_sense_id, translation_ja, normalized_translation_ja, distinct_key, meaning_summary, usage_notes, translation_source, example_sentence, example_sentence_ja, pronunciation, distractors, created_at, updated_at')
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

async function lookupLexiconEntriesByHeadwordsDirect(
  supabaseAdmin: SupabaseClient,
  normalizedHeadwords: string[],
): Promise<LexiconEntry[]> {
  const { data, error } = await supabaseAdmin
    .from('lexicon_entry_resolved_rows')
    .select('id, headword, normalized_headword, pos, cefr_level, dataset_sources, primary_sense_id, translation_ja, normalized_translation_ja, distinct_key, meaning_summary, usage_notes, translation_source, example_sentence, example_sentence_ja, pronunciation, distractors, created_at, updated_at')
    .in('normalized_headword', normalizedHeadwords);

  if (error) {
    throw new Error(`Failed to load lexicon entries by headword: ${error.message}`);
  }

  return ((data ?? []) as LexiconEntryRow[]).map(mapLexiconEntry);
}

/**
 * 見出し語だけでマスター候補を引く（品詞は問わない）。
 * `lookupLexiconEntriesByKeys` が (見出し語, 品詞) で外したときの second pass 専用。
 */
export async function lookupLexiconEntriesByHeadwords(
  normalizedHeadwords: string[],
  deps?: Pick<ResolveImmediateWordsDeps, 'lookupEntriesByHeadwords' | 'supabaseAdmin'>,
): Promise<LexiconEntry[]> {
  const uniqueHeadwords = Array.from(
    new Set(normalizedHeadwords.filter((headword) => headword.length > 0)),
  );

  if (uniqueHeadwords.length === 0) {
    return [];
  }

  if (deps?.lookupEntriesByHeadwords) {
    return deps.lookupEntriesByHeadwords(uniqueHeadwords);
  }

  const supabaseAdmin = deps?.supabaseAdmin ?? getSupabaseAdmin();
  const rpcResult = await supabaseAdmin.rpc('get_lexicon_entries_by_headwords', {
    p_headwords: uniqueHeadwords,
  });

  if (!rpcResult.error && Array.isArray(rpcResult.data)) {
    return (rpcResult.data as LexiconEntryRow[]).map(mapLexiconEntry);
  }

  if (rpcResult.error) {
    console.warn('[master-first-scan] Falling back to direct headword lexicon lookup', {
      error: rpcResult.error.message,
      headwordCount: uniqueHeadwords.length,
    });
  }

  return lookupLexiconEntriesByHeadwordsDirect(supabaseAdmin, uniqueHeadwords);
}

/**
 * 品詞が一致しないマスター行を流用してよいか。
 *
 * `'other'` は「品詞不明」を意味する（AIが partOfSpeechTags を返さなかった語も
 * マスター側で分類できなかった行もここに落ちる）ので、片側が不明なら同じ見出し語の
 * 語義とみなして流用する。双方が別々の品詞を明言している場合（noun と verb など）は
 * 語義が違うため流用しない — 誤訳を単語帳に混ぜるより AI を呼ぶほうがましである。
 */
function isPosCompatibleForHeadwordFallback(wordPos: LexiconPos, entryPos: string): boolean {
  return wordPos === 'other' || entryPos === 'other' || wordPos === entryPos;
}

/**
 * 使い回せる中身が多い候補ほど高スコア。0 のままの候補は流用しても
 * AI 呼び出しを1つも減らせないので採用しない。
 */
function scoreHeadwordFallbackEntry(entry: LexiconEntry): number {
  let score = 0;
  if (normalizeUsableJapanese(entry.translationJa)) score += 8;
  if (typeof entry.exampleSentence === 'string' && entry.exampleSentence.trim()) score += 4;
  if (typeof entry.pronunciation === 'string' && entry.pronunciation.trim()) score += 2;
  if (entry.pos !== 'other') score += 1;
  return score;
}

function pickHeadwordFallbackEntry(
  candidates: LexiconEntry[],
  wordPos: LexiconPos,
): LexiconEntry | undefined {
  let best: { entry: LexiconEntry; score: number } | undefined;

  for (const entry of candidates) {
    if (!isPosCompatibleForHeadwordFallback(wordPos, entry.pos)) continue;
    const score = scoreHeadwordFallbackEntry(entry);
    if (score === 0) continue;
    // 同点は id 昇順で決める（同じスキャンを2回投げても同じ行を選ぶため）。
    if (!best || score > best.score || (score === best.score && entry.id < best.entry.id)) {
      best = { entry, score };
    }
  }

  return best?.entry;
}

export async function resolveImmediateWordsWithMasterFirst<T extends ImmediateWordInput>(
  words: T[],
  deps?: ResolveImmediateWordsDeps,
  options?: ResolveImmediateWordsOptions,
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
      // 古典語は key を立てない。key が null の語はこの関数のすべての段
      // （マスター参照・見出し語フォールバック・AI訳生成）から外れる。
      // これを外すと、古典語の見出し語が英日翻訳AIに投げ込まれ、さらに
      // 日本語をキーにした lexicon_entries 行が量産される。
      key: english && !shouldSkipEnglishEnrichment(word) ? buildLexiconKey(english, pos) : null,
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

  // --- second pass: 見出し語フォールバック ---
  // (見出し語, 品詞) で外した語は、同じ見出し語のマスター行を品詞不明時に限り流用する。
  // これがないと、AIが品詞を返さなかった語（pos='other' に落ちる）はマスターに
  // あっても毎回 訳語・例文・発音記号・誤答選択肢をAIで作り直すことになる。
  const missedWordPosByHeadword = new Map<string, Set<LexiconPos>>();
  for (const word of preparedWords) {
    if (!word.key || entryByKey.has(word.key)) continue;
    const headword = normalizeHeadword(word.english);
    if (!headword) continue;
    const positions = missedWordPosByHeadword.get(headword) ?? new Set<LexiconPos>();
    positions.add(word.pos);
    missedWordPosByHeadword.set(headword, positions);
  }

  // フォールバックは費用削減のための最適化なので、失敗してもスキャンは止めない
  // （AI呼び出しに落ちるだけで、ユーザから見た結果は変わらない）。
  let fallbackCandidates: LexiconEntry[] = [];
  if (missedWordPosByHeadword.size > 0) {
    try {
      fallbackCandidates = await lookupLexiconEntriesByHeadwords(
        Array.from(missedWordPosByHeadword.keys()),
        deps,
      );
    } catch (error) {
      console.warn('[master-first-scan] Headword fallback lookup failed; falling back to AI', {
        error: error instanceof Error ? error.message : String(error),
        headwordCount: missedWordPosByHeadword.size,
      });
    }
  }

  const candidatesByHeadword = new Map<string, LexiconEntry[]>();
  for (const entry of fallbackCandidates) {
    const bucket = candidatesByHeadword.get(entry.normalizedHeadword);
    if (bucket) {
      bucket.push(entry);
    } else {
      candidatesByHeadword.set(entry.normalizedHeadword, [entry]);
    }
  }

  const fallbackEntryByKey = new Map<string, LexiconEntry>();
  for (const [headword, positions] of missedWordPosByHeadword.entries()) {
    const candidates = candidatesByHeadword.get(headword);
    if (!candidates || candidates.length === 0) continue;
    for (const pos of positions) {
      const picked = pickHeadwordFallbackEntry(candidates, pos);
      if (picked) {
        fallbackEntryByKey.set(buildLexiconKey(headword, pos), picked);
      }
    }
  }

  const resolveEntryForKey = (key: string | null): LexiconEntry | undefined => {
    if (!key) return undefined;
    return entryByKey.get(key) ?? fallbackEntryByKey.get(key);
  };

  const translationInputsByKey = new Map<string, { english: string; pos: LexiconPos }>();
  for (const word of preparedWords) {
    if (!word.key || word.japanese) continue;
    const entry = resolveEntryForKey(word.key);
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
  let masterPronunciationHitCount = 0;
  let masterDistractorHitCount = 0;
  let masterHeadwordFallbackHitCount = 0;
  let aiMissCount = 0;
  const usedFallbackEntriesById = new Map<string, LexiconEntry>();

  const resolvedWords = preparedWords.map((word) => {
    const entry = resolveEntryForKey(word.key);
    if (entry && word.key && !entryByKey.has(word.key)) {
      masterHeadwordFallbackHitCount += 1;
      usedFallbackEntriesById.set(entry.id, entry);
    }
    const masterTranslation = normalizeUsableJapanese(entry?.translationJa);
    const masterExampleSentence = !options?.skipMasterExamples && typeof entry?.exampleSentence === 'string'
      ? entry.exampleSentence.trim()
      : '';
    const masterExampleSentenceJa = !options?.skipMasterExamples && typeof entry?.exampleSentenceJa === 'string'
      ? entry.exampleSentenceJa.trim()
      : '';
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
    const primarySense = entry?.primarySense;
    const usesPrimarySense = Boolean(
      primarySense?.id &&
      normalizeUsableJapanese(primarySense.translationJa) === normalizeUsableJapanese(japanese),
    );

    // 発音記号・誤答選択肢はマスターから使い回す（既に値がある場合は優先）。
    // 誤答選択肢は正解訳に依存するため、マスターの primary sense を
    // そのまま使う場合のみ再利用する。
    const originalPronunciation = typeof word.original.pronunciation === 'string' && word.original.pronunciation.trim()
      ? word.original.pronunciation
      : undefined;
    let pronunciation = originalPronunciation;
    if (!pronunciation && entry?.pronunciation) {
      pronunciation = entry.pronunciation;
      masterPronunciationHitCount += 1;
    }

    const originalDistractors = normalizeReusableDistractors(word.original.distractors);
    let distractors = word.original.distractors;
    if (!originalDistractors && usesPrimarySense && primarySense?.distractors) {
      distractors = primarySense.distractors;
      masterDistractorHitCount += 1;
    }

    // 品詞タグが無い語はマスターの品詞で埋める。埋めておくと保存後の
    // 語彙解決ジョブが品詞判定のAI呼び出し（classifyPartOfSpeechBatchWithAI）を
    // 省けるうえ、次回以降は (見出し語, 品詞) の完全一致で当たるようになる。
    const partOfSpeechTags = word.partOfSpeechTags.length === 0 && entry?.pos && entry.pos !== 'other'
      ? normalizePartOfSpeechTags([entry.pos])
      : word.partOfSpeechTags;

    return {
      ...word.original,
      english: word.english,
      japanese,
      japaneseSource,
      lexiconEntryId: entry?.id ?? word.original.lexiconEntryId,
      lexiconSenseId: usesPrimarySense ? primarySense?.id : word.original.lexiconSenseId,
      lexiconDistinctKey: usesPrimarySense ? primarySense?.distinctKey : word.original.lexiconDistinctKey,
      lexiconSenseIsPrimary: usesPrimarySense ? true : word.original.lexiconSenseIsPrimary,
      cefrLevel: entry?.cefrLevel ?? word.original.cefrLevel,
      partOfSpeechTags,
      pronunciation,
      distractors,
      exampleSentence: word.original.exampleSentence ?? (masterExampleSentence || undefined),
      exampleSentenceJa: word.original.exampleSentenceJa ?? (masterExampleSentenceJa || undefined),
    };
  });

  return {
    words: resolvedWords,
    // 実際に採用したフォールバック行だけを足す（同じ見出し語の未採用候補まで
    // 返すと、呼び出し側が見出し語でマスターを引き当てる処理を誤らせる）。
    lexiconEntries: usedFallbackEntriesById.size > 0
      ? [...lexiconEntries, ...usedFallbackEntriesById.values()]
      : lexiconEntries,
    metrics: {
      lookupKeyCount: lookupKeys.length,
      masterHitCount,
      masterTranslationHitCount,
      masterPronunciationHitCount,
      masterDistractorHitCount,
      masterHeadwordFallbackHitCount,
      aiMissCount,
      lookupElapsedMs,
      translationElapsedMs,
      totalElapsedMs: Date.now() - startedAt,
    },
  };
}
