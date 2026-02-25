import { z } from 'zod';
import type { RelatedWord, UsagePattern } from '@/types';
import { AI_CONFIG } from '@/lib/ai/config';
import { getProviderFromConfig } from '@/lib/ai/providers';

export interface WordInsightWordInput {
  id: string;
  english: string;
  japanese: string;
}

export interface WordInsightPayload {
  partOfSpeechTags: string[];
  relatedWords: RelatedWord[];
  usagePatterns: UsagePattern[];
  insightsGeneratedAt: string;
  insightsVersion: number;
}

export interface WordInsightSuccess {
  wordId: string;
  insight: WordInsightPayload;
}

export interface WordInsightSkipped {
  wordId: string;
  reason: string;
}

export interface WordInsightFailed {
  wordId: string;
  error: string;
}

export interface GenerateWordInsightsResult {
  successes: WordInsightSuccess[];
  skipped: WordInsightSkipped[];
  failed: WordInsightFailed[];
}

const DICTIONARY_TIMEOUT_MS = 10_000;
const INSIGHTS_SCHEMA_VERSION = 1;

const relatedWordSchema = z.object({
  term: z.string().trim().min(1).max(80),
  relation: z.string().trim().min(1).max(40),
  noteJa: z.string().trim().max(200).optional(),
});

const usagePatternSchema = z.object({
  pattern: z.string().trim().min(1).max(120),
  meaningJa: z.string().trim().min(1).max(200),
  example: z.string().trim().max(240).optional(),
  exampleJa: z.string().trim().max(240).optional(),
  register: z.string().trim().max(40).optional(),
});

const aiResponseSchema = z.object({
  partOfSpeechTags: z.array(z.string().trim().min(1).max(32)).max(10).default([]),
  relatedWords: z.array(relatedWordSchema).max(10).default([]),
  usagePatterns: z.array(usagePatternSchema).max(8).default([]),
});

type DictionaryDefinition = {
  definition?: string;
  example?: string;
  synonyms?: string[];
  antonyms?: string[];
};

type DictionaryMeaning = {
  partOfSpeech?: string;
  definitions?: DictionaryDefinition[];
  synonyms?: string[];
  antonyms?: string[];
};

type DictionaryEntry = {
  word?: string;
  phonetic?: string;
  origin?: string;
  meanings?: DictionaryMeaning[];
};

function normalizeText(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, ' ');
}

function uniqueStrings(values: string[], maxCount: number): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const value of values) {
    const text = normalizeText(value);
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(text);
    if (normalized.length >= maxCount) break;
  }

  return normalized;
}

function uniqueRelatedWords(values: RelatedWord[], maxCount: number): RelatedWord[] {
  const seen = new Set<string>();
  const normalized: RelatedWord[] = [];

  for (const value of values) {
    const term = normalizeText(value.term);
    const relation = normalizeText(value.relation);
    if (!term || !relation) continue;

    const key = `${term.toLowerCase()}::${relation.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);

    normalized.push({
      term,
      relation,
      noteJa: value.noteJa ? normalizeText(value.noteJa) : undefined,
    });

    if (normalized.length >= maxCount) break;
  }

  return normalized;
}

function uniqueUsagePatterns(values: UsagePattern[], maxCount: number): UsagePattern[] {
  const seen = new Set<string>();
  const normalized: UsagePattern[] = [];

  for (const value of values) {
    const pattern = normalizeText(value.pattern);
    const meaningJa = normalizeText(value.meaningJa);
    if (!pattern || !meaningJa) continue;

    const key = pattern.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    normalized.push({
      pattern,
      meaningJa,
      example: value.example ? normalizeText(value.example) : undefined,
      exampleJa: value.exampleJa ? normalizeText(value.exampleJa) : undefined,
      register: value.register ? normalizeText(value.register) : undefined,
    });

    if (normalized.length >= maxCount) break;
  }

  return normalized;
}

function toDictionaryContext(entry: DictionaryEntry) {
  const meanings = (entry.meanings ?? []).slice(0, 6).map((meaning) => {
    const definitions = (meaning.definitions ?? []).slice(0, 4).map((definition) => ({
      definition: definition.definition ?? '',
      example: definition.example ?? '',
      synonyms: (definition.synonyms ?? []).slice(0, 8),
      antonyms: (definition.antonyms ?? []).slice(0, 8),
    }));

    return {
      partOfSpeech: meaning.partOfSpeech ?? '',
      synonyms: (meaning.synonyms ?? []).slice(0, 12),
      antonyms: (meaning.antonyms ?? []).slice(0, 12),
      definitions,
    };
  });

  const partOfSpeechTags = uniqueStrings(
    meanings.map((meaning) => meaning.partOfSpeech).filter(Boolean),
    8,
  );

  return {
    word: entry.word ?? '',
    phonetic: entry.phonetic ?? '',
    origin: entry.origin ?? '',
    partOfSpeechTags,
    meanings,
  };
}

function extractJsonContent(content: string): string {
  const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    return jsonMatch[1].trim();
  }

  const jsonStartIndex = content.indexOf('{');
  const jsonEndIndex = content.lastIndexOf('}');
  if (jsonStartIndex !== -1 && jsonEndIndex !== -1) {
    return content.slice(jsonStartIndex, jsonEndIndex + 1);
  }

  return content;
}

async function fetchDictionaryEntry(english: string): Promise<DictionaryEntry | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DICTIONARY_TIMEOUT_MS);

  try {
    const response = await fetch(
      `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(english.toLowerCase())}`,
      {
        method: 'GET',
        signal: controller.signal,
      },
    );

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as unknown;
    if (!Array.isArray(data) || data.length === 0) {
      return null;
    }

    const entry = data[0] as DictionaryEntry;
    if (!entry || typeof entry !== 'object') {
      return null;
    }

    if (!Array.isArray(entry.meanings) || entry.meanings.length === 0) {
      return null;
    }

    return entry;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function buildInsightFromDictionary(
  word: WordInsightWordInput,
  entry: DictionaryEntry,
): Promise<WordInsightPayload> {
  const context = toDictionaryContext(entry);
  const openaiApiKey = process.env.OPENAI_API_KEY?.trim() || '';
  const config = {
    ...AI_CONFIG.defaults.openai,
    temperature: 0.3,
    maxOutputTokens: 1800,
  };
  const provider = getProviderFromConfig(config, { openai: openaiApiKey });

  const prompt = `あなたは英語辞書編集者です。与えられた辞書情報だけを根拠に、英語学習アプリ向けの「関連語」と「語法」を整理してください。

制約:
- 辞書情報から裏取りできる内容だけを書く
- 不明な情報は捏造せず空配列にする
- 語法は A/B を使った学習向けパターン表現を優先する（例: attach A to B, be attached to A）
- 日本語説明は短く自然に

出力はJSONのみ:
{
  "partOfSpeechTags": ["verb", "adjective"],
  "relatedWords": [
    {"term": "attachment", "relation": "noun", "noteJa": "関連名詞"}
  ],
  "usagePatterns": [
    {"pattern": "attach A to B", "meaningJa": "AをBに取り付ける", "example": "Attach the label to the box.", "exampleJa": "ラベルを箱に貼り付けて。", "register": "neutral"}
  ]
}

対象単語:
- 英語: ${word.english}
- 日本語: ${word.japanese}

辞書データ:
${JSON.stringify(context)}`;

  const generated = await provider.generateText(prompt, {
    ...config,
    responseFormat: 'json',
  });

  if (!generated.success || !generated.content?.trim()) {
    throw new Error(generated.success ? 'AI response is empty' : generated.error);
  }

  const parsed = aiResponseSchema.parse(JSON.parse(extractJsonContent(generated.content)));

  return {
    partOfSpeechTags: uniqueStrings(
      [...context.partOfSpeechTags, ...parsed.partOfSpeechTags],
      8,
    ),
    relatedWords: uniqueRelatedWords(parsed.relatedWords, 10),
    usagePatterns: uniqueUsagePatterns(parsed.usagePatterns, 8),
    insightsGeneratedAt: new Date().toISOString(),
    insightsVersion: INSIGHTS_SCHEMA_VERSION,
  };
}

export async function generateWordInsightsForWords(
  words: WordInsightWordInput[],
): Promise<GenerateWordInsightsResult> {
  const successes: WordInsightSuccess[] = [];
  const skipped: WordInsightSkipped[] = [];
  const failed: WordInsightFailed[] = [];

  for (const word of words) {
    const english = normalizeText(word.english);
    const japanese = normalizeText(word.japanese);

    if (!english || !japanese) {
      skipped.push({ wordId: word.id, reason: 'invalid_word' });
      continue;
    }

    const entry = await fetchDictionaryEntry(english);
    if (!entry) {
      skipped.push({ wordId: word.id, reason: 'dictionary_not_found' });
      continue;
    }

    try {
      const insight = await buildInsightFromDictionary(
        {
          id: word.id,
          english,
          japanese,
        },
        entry,
      );

      successes.push({ wordId: word.id, insight });
    } catch (error) {
      failed.push({
        wordId: word.id,
        error: error instanceof Error ? error.message : 'insight_generation_failed',
      });
    }
  }

  return {
    successes,
    skipped,
    failed,
  };
}
