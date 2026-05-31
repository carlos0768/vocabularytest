import { z } from 'zod';
import type { WordOrderQuizCache } from '@/types';
import { AI_CONFIG } from '@/lib/ai/config';
import { getProviderFromConfig } from '@/lib/ai/providers';
import { parseJsonResponse } from '@/lib/ai/utils/json';
import {
  WORD_ORDER_BLANK_TOKEN,
  WORD_ORDER_CACHE_VERSION,
  WORD_ORDER_MAX_ANSWER_TOKENS,
  normalizeWordOrderQuizCache,
} from '@/lib/quiz/word-order';

export interface WordOrderQuizWordInput {
  id: string;
  english: string;
  japanese: string;
}

export interface GeneratedWordOrderQuizResult {
  wordId: string;
  quiz: WordOrderQuizCache;
}

const wordOrderResponseSchema = z.object({
  results: z.array(z.object({
    id: z.string().trim().min(1),
    sentenceTokens: z.array(z.string().trim().min(1).max(80)).min(1).max(30),
    answerTokens: z.array(z.string().trim().min(1).max(80)).min(1).max(WORD_ORDER_MAX_ANSWER_TOKENS),
    decoyTokens: z.array(z.string().trim().min(1).max(80)).length(3),
  })).default([]),
});

const WORD_ORDER_PROMPT = `あなたは英語学習アプリの語順整序クイズ作成者です。
複数語の英語表現について、下の単語チップを選んで英文を完成させる問題を作ってください。

ルール:
- answerTokens は正解として選ばせる英単語チップ。必ず元の english を構成する全ての語を、元の順番のまま返す
- english が4語以上でも省略せず、4語目以降も answerTokens に含める
- sentenceTokens は表示する英文トークン配列。元の english の各語の位置に必ず "${WORD_ORDER_BLANK_TOKEN}" を入れ、固定語は入れない
- sentenceTokens 内の "${WORD_ORDER_BLANK_TOKEN}" の数は answerTokens の数と完全一致させる
- decoyTokens は誤答チップを3つ返す。日本語訳から連想されやすい雰囲気だが、入れると意味が通らない英単語にする
- decoyTokens は元の english に含まれる語や answerTokens と重複させない
- 説明文やMarkdownは出さず、JSONだけ返す

出力形式:
{
  "results": [
    {
      "id": "word-id",
      "sentenceTokens": ["___", "___", "___"],
      "answerTokens": ["take", "care", "of"],
      "decoyTokens": ["hold", "keep", "make"]
    }
  ]
}`;

export function buildWordOrderPrompt(words: WordOrderQuizWordInput[]): string {
  const wordList = words
    .map((word, index) => `${index + 1}. ID: ${word.id} / English: ${word.english} / Japanese: ${word.japanese}`)
    .join('\n');

  return `${WORD_ORDER_PROMPT}\n\n対象:\n${wordList}`;
}

export function normalizeGeneratedWordOrderResult(
  word: WordOrderQuizWordInput,
  raw: {
    sentenceTokens: string[];
    answerTokens: string[];
    decoyTokens: string[];
  },
  now = new Date().toISOString(),
): GeneratedWordOrderQuizResult | null {
  const quiz = normalizeWordOrderQuizCache(
    word,
    {
      version: WORD_ORDER_CACHE_VERSION,
      sourceEnglish: word.english,
      sourceJapanese: word.japanese,
      sentenceTokens: raw.sentenceTokens,
      answerTokens: raw.answerTokens,
      decoyTokens: raw.decoyTokens,
      generatedAt: now,
    },
    now,
  );

  return quiz ? { wordId: word.id, quiz } : null;
}

export async function generateWordOrderQuizForWords(
  words: WordOrderQuizWordInput[],
): Promise<GeneratedWordOrderQuizResult[]> {
  if (words.length === 0) return [];

  const config = {
    ...AI_CONFIG.defaults.gemini,
    temperature: 0.4,
    maxOutputTokens: 4096,
    responseFormat: 'json' as const,
  };
  const provider = getProviderFromConfig(config, {
    gemini: process.env.GOOGLE_AI_API_KEY,
    openai: process.env.OPENAI_API_KEY,
  });

  const result = await provider.generateText(buildWordOrderPrompt(words), config);
  if (!result.success || !result.content?.trim()) {
    throw new Error(result.success ? 'AI word-order response is empty' : result.error);
  }

  const parsed = wordOrderResponseSchema.parse(parseJsonResponse(result.content));
  const inputById = new Map(words.map((word) => [word.id, word]));
  const generatedAt = new Date().toISOString();

  return parsed.results
    .map((item) => {
      const word = inputById.get(item.id);
      if (!word) return null;
      return normalizeGeneratedWordOrderResult(word, item, generatedAt);
    })
    .filter((item): item is GeneratedWordOrderQuizResult => Boolean(item));
}
