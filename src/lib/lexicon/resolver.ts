import { AI_CONFIG, type AIModelConfig, getAPIKeys } from '@/lib/ai/config';
import { getProviderFromConfig, isCloudRunConfigured } from '@/lib/ai/providers';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import type { AIWordExtraction, LexiconEntry } from '@/types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import {
  normalizeHeadword,
  normalizeLexiconTranslation,
  resolvePrimaryLexiconPos,
  type LexiconPos,
  type LexiconTranslationSource,
} from '../../../shared/lexicon';

const TRANSLATION_PROMPT = `あなたは英和辞典です。与えられた英単語・フレーズの日本語訳を返してください。

ルール:
- 出力はJSONのみで返してください
- 複数の意味がある場合は最も一般的な訳を1つ返す
- 動詞の場合は「〜する」の形を優先する
- 不要な説明や引用符は付けない

出力形式:
{
  "japanese": "日本語訳"
}`;

const TRANSLATION_HINT_VALIDATION_PROMPT = `あなたは英和辞典の品質チェッカーです。
与えられた英語・品詞・日本語候補について、その日本語候補を共有語彙マスタへ保存してよいか厳密に判定してください。

判定ルール:
- useHint は、その日本語候補が英語の主要で自然な訳として妥当な場合にだけ true
- OCRノイズ、誤読、無関係、品詞不一致、不自然、意味がズレている場合は false
- useHint=true のとき normalizedJapanese に保存用の簡潔な日本語訳を入れる
- useHint=false のとき normalizedJapanese は null
- useHint=false でも、より自然な主要訳が分かるなら suggestedJapanese に入れる
- suggestedJapanese が不明な場合は null
- 出力はJSONのみ

出力形式:
{
  "useHint": true,
  "normalizedJapanese": "保存してよい日本語訳 or null",
  "suggestedJapanese": "hintを使わない場合の代替訳 or null"
}`;

const translationHintValidationSchema = z.object({
  useHint: z.boolean(),
  normalizedJapanese: z.string().trim().nullable().optional(),
  suggestedJapanese: z.string().trim().nullable().optional(),
}).strict();

const translationResponseSchema = z.object({
  japanese: z.string().trim().min(1),
}).strict();

export interface LexiconResolverInput {
  english: string;
  japaneseHint?: string | null;
  partOfSpeechTags?: string[];
}

export type ResolvedLexiconWord<T extends AIWordExtraction = AIWordExtraction> = Omit<
  T,
  'english' | 'japanese' | 'lexiconEntryId' | 'cefrLevel'
> & {
  english: string;
  japanese: string;
  lexiconEntryId?: string;
  cefrLevel?: string;
};

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

export interface ResolveLexiconDeps {
  supabaseAdmin?: SupabaseClient;
  translateWord?: (english: string, pos: LexiconPos) => Promise<string | null>;
  validateTranslationCandidate?: (
    english: string,
    pos: LexiconPos,
    japaneseHint: string,
  ) => Promise<ValidatedTranslationCandidate | null>;
}

export interface ValidatedTranslationCandidate {
  useHint: boolean;
  normalizedJapanese?: string | null;
  suggestedJapanese?: string | null;
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

async function translateWithAI(english: string, _pos: LexiconPos): Promise<string | null> {
  const aiClient = getLexiconTextGenerationClient();
  if (!aiClient) {
    return null;
  }

  const result = await aiClient.provider.generateText(`${TRANSLATION_PROMPT}\n\n英語: ${english}`, {
    ...aiClient.config,
    maxOutputTokens: 256,
    responseFormat: 'json',
  });
  if (!result.success) {
    return null;
  }

  try {
    const parsed = translationResponseSchema.parse(JSON.parse(result.content));
    return normalizeLexiconTranslation(parsed.japanese);
  } catch {
    // Fall back to heuristic sanitization if the provider ignored JSON mode.
  }

  return normalizeLexiconTranslation(result.content);
}

function getLexiconTextGenerationClient():
  | { provider: ReturnType<typeof getProviderFromConfig>; config: AIModelConfig }
  | null {
  const apiKeys = getAPIKeys();

  let config: AIModelConfig | null = null;
  if (isCloudRunConfigured()) {
    config = AI_CONFIG.defaults.openai;
  } else if (apiKeys[AI_CONFIG.defaults.openai.provider]) {
    config = AI_CONFIG.defaults.openai;
  } else if (apiKeys[AI_CONFIG.defaults.gemini.provider]) {
    config = AI_CONFIG.defaults.gemini;
  } else if (apiKeys.openai) {
    config = AI_CONFIG.defaults.openai;
  }

  if (!config) {
    return null;
  }

  return {
    provider: getProviderFromConfig(config, apiKeys),
    config,
  };
}

function looksLikeJapaneseTranslation(text: string, english: string): boolean {
  const normalizedEnglish = normalizeHeadword(english);
  const normalizedText = normalizeHeadword(text);
  if (!normalizedText || normalizedText === normalizedEnglish) {
    return false;
  }

  return /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/.test(text);
}

async function validateTranslationCandidateWithAI(
  english: string,
  pos: LexiconPos,
  japaneseHint: string,
): Promise<ValidatedTranslationCandidate | null> {
  if (!looksLikeJapaneseTranslation(japaneseHint, english)) {
    return {
      useHint: false,
      normalizedJapanese: null,
      suggestedJapanese: null,
    };
  }

  const aiClient = getLexiconTextGenerationClient();
  if (!aiClient) {
    return null;
  }

  const prompt = `${TRANSLATION_HINT_VALIDATION_PROMPT}

英語: ${english}
品詞: ${pos}
日本語候補: ${japaneseHint}`;

  const result = await aiClient.provider.generateText(prompt, {
    ...aiClient.config,
    maxOutputTokens: 256,
    responseFormat: 'json',
  });
  if (!result.success) {
    return null;
  }

  try {
    const parsed = translationHintValidationSchema.parse(JSON.parse(result.content));
    return {
      useHint: parsed.useHint,
      normalizedJapanese: normalizeLexiconTranslation(parsed.normalizedJapanese),
      suggestedJapanese: normalizeLexiconTranslation(parsed.suggestedJapanese),
    };
  } catch (error) {
    console.warn('Failed to parse translation hint validation response:', error);
    return null;
  }
}

function getResolverDeps(deps?: ResolveLexiconDeps) {
  return {
    supabaseAdmin: deps?.supabaseAdmin ?? getSupabaseAdmin(),
    translateWord: deps?.translateWord ?? translateWithAI,
    validateTranslationCandidate: deps?.validateTranslationCandidate ?? validateTranslationCandidateWithAI,
  };
}

async function resolveTranslationForMaster(
  english: string,
  pos: LexiconPos,
  japaneseHint: string | null,
  deps?: ResolveLexiconDeps,
): Promise<{ translation: string | null; translationSource: LexiconTranslationSource | null }> {
  const { translateWord, validateTranslationCandidate } = getResolverDeps(deps);

  if (japaneseHint) {
    const validation = await validateTranslationCandidate(english, pos, japaneseHint);
    if (validation?.useHint) {
      const normalizedHint = normalizeLexiconTranslation(validation.normalizedJapanese ?? japaneseHint);
      if (normalizedHint) {
        return {
          translation: normalizedHint,
          translationSource: 'scan',
        };
      }
    }

    const suggestedTranslation = normalizeLexiconTranslation(validation?.suggestedJapanese);
    if (suggestedTranslation) {
      return {
        translation: suggestedTranslation,
        translationSource: 'ai',
      };
    }
  }

  const translation = await translateWord(english, pos);
  return {
    translation,
    translationSource: translation ? 'ai' : null,
  };
}

async function updateTranslationIfMissing(
  row: LexiconEntryRow,
  japaneseHint: string | null,
  deps?: ResolveLexiconDeps,
): Promise<LexiconEntry> {
  if (row.translation_ja) {
    return mapLexiconEntry(row);
  }

  const { supabaseAdmin } = getResolverDeps(deps);
  const { translation, translationSource } = await resolveTranslationForMaster(
    row.headword,
    row.pos as LexiconPos,
    japaneseHint,
    deps,
  );
  if (!translation) {
    return mapLexiconEntry(row);
  }

  const { data, error } = await supabaseAdmin
    .from('lexicon_entries')
    .update({
      translation_ja: translation,
      translation_source: translationSource,
    })
    .eq('id', row.id)
    .select('*')
    .single<LexiconEntryRow>();

  if (error || !data) {
    throw new Error(error?.message || 'Failed to update lexicon translation');
  }

  return mapLexiconEntry(data);
}

export async function resolveOrCreateLexiconEntry(
  input: LexiconResolverInput,
  deps?: ResolveLexiconDeps,
): Promise<LexiconEntry | null> {
  const { supabaseAdmin } = getResolverDeps(deps);
  const headword = input.english.trim();
  const normalizedHeadword = normalizeHeadword(headword);
  if (!normalizedHeadword) return null;

  const pos = resolvePrimaryLexiconPos(input.partOfSpeechTags);
  const japaneseHint = normalizeLexiconTranslation(input.japaneseHint);

  const { data: existingRow, error: existingError } = await supabaseAdmin
    .from('lexicon_entries')
    .select('*')
    .eq('normalized_headword', normalizedHeadword)
    .eq('pos', pos)
    .maybeSingle<LexiconEntryRow>();

  if (existingError) {
    throw new Error(`Failed to load lexicon entry: ${existingError.message}`);
  }

  if (existingRow) {
    return updateTranslationIfMissing(existingRow, japaneseHint, deps);
  }

  const { translation, translationSource } = await resolveTranslationForMaster(
    headword,
    pos,
    japaneseHint,
    deps,
  );

  const insertPayload = {
    headword,
    normalized_headword: normalizedHeadword,
    pos,
    cefr_level: null,
    dataset_sources: ['runtime'],
    translation_ja: translation,
    translation_source: translationSource,
  };

  const { data: insertedRow, error: insertError } = await supabaseAdmin
    .from('lexicon_entries')
    .insert(insertPayload)
    .select('*')
    .single<LexiconEntryRow>();

  if (!insertError && insertedRow) {
    return mapLexiconEntry(insertedRow);
  }

  const { data: conflictedRow, error: conflictedError } = await supabaseAdmin
    .from('lexicon_entries')
    .select('*')
    .eq('normalized_headword', normalizedHeadword)
    .eq('pos', pos)
    .maybeSingle<LexiconEntryRow>();

  if (conflictedError || !conflictedRow) {
    throw new Error(insertError?.message || conflictedError?.message || 'Failed to create lexicon entry');
  }

  return updateTranslationIfMissing(conflictedRow, japaneseHint, deps);
}

export async function resolveWordsWithLexicon<T extends AIWordExtraction>(
  words: T[],
  deps?: ResolveLexiconDeps,
): Promise<{ words: ResolvedLexiconWord<T>[]; lexiconEntries: LexiconEntry[] }> {
  const resolverInputs = new Map<string, LexiconResolverInput>();

  for (const word of words) {
    const normalizedHeadword = normalizeHeadword(word.english);
    if (!normalizedHeadword) continue;
    const pos = resolvePrimaryLexiconPos(word.partOfSpeechTags);
    const key = `${normalizedHeadword}::${pos}`;
    const japaneseHint = normalizeLexiconTranslation(word.japanese);
    const existing = resolverInputs.get(key);

    if (!existing) {
      resolverInputs.set(key, {
        english: word.english,
        japaneseHint,
        partOfSpeechTags: word.partOfSpeechTags,
      });
      continue;
    }

    if (!existing.japaneseHint && japaneseHint) {
      existing.japaneseHint = japaneseHint;
    }

    if ((!existing.partOfSpeechTags || existing.partOfSpeechTags.length === 0) && word.partOfSpeechTags?.length) {
      existing.partOfSpeechTags = word.partOfSpeechTags;
    }
  }

  const resolvedEntryMap = new Map<string, LexiconEntry>();
  for (const [key, input] of resolverInputs.entries()) {
    const entry = await resolveOrCreateLexiconEntry(input, deps);
    if (entry) {
      resolvedEntryMap.set(key, entry);
    }
  }

  const resolvedWords = words.map((word) => {
    const normalizedHeadword = normalizeHeadword(word.english);
    const pos = resolvePrimaryLexiconPos(word.partOfSpeechTags);
    const entry = resolvedEntryMap.get(`${normalizedHeadword}::${pos}`);
    return {
      ...word,
      english: entry?.headword ?? word.english,
      japanese: entry?.translationJa ?? normalizeLexiconTranslation(word.japanese) ?? '',
      lexiconEntryId: entry?.id,
      cefrLevel: entry?.cefrLevel,
    };
  });

  return {
    words: resolvedWords,
    lexiconEntries: Array.from(resolvedEntryMap.values()),
  };
}
