/**
 * IPA pronunciation generation.
 *
 * 発音記号は外部辞書APIではなくAIで生成する。
 * scan-jobs/process の after() でバッチ実行し、words.pronunciation に保存する。
 */

import { z } from 'zod';
import { AI_CONFIG, type ResponseSchema } from '@/lib/ai/config';
import { getProviderFromConfig } from '@/lib/ai/providers';
import { parseJsonResponse } from '@/lib/ai/utils/json';
import {
  fetchLexiconQuizContent,
  saveQuizContentToLexicon,
} from '@/lib/lexicon/quiz-content-lexicon';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

const BATCH_SIZE = 20;
const MAX_PRONUNCIATION_LENGTH = 120;

const pronunciationResponseSchema = z.object({
  results: z.array(z.object({
    id: z.string().trim().min(1),
    pronunciation: z.string().trim().max(MAX_PRONUNCIATION_LENGTH).optional().default(''),
  })).default([]),
});

/** Gemini Controlled Generation schema mirroring `pronunciationResponseSchema`. */
export const PRONUNCIATION_RESPONSE_SCHEMA: ResponseSchema = {
  type: 'OBJECT',
  properties: {
    results: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          id: { type: 'STRING' },
          pronunciation: { type: 'STRING' },
        },
        required: ['id', 'pronunciation'],
        propertyOrdering: ['id', 'pronunciation'],
      },
    },
  },
  required: ['results'],
};

const PRONUNCIATION_PROMPT = `あなたは英語発音辞典の編集者です。
与えられた英単語または英語フレーズについて、標準的なIPA発音記号を生成してください。

ルール:
- pronunciation は必ず "/.../" 形式のIPAで返す
- 英単語ではない、または発音を確定できない場合は空文字にする
- アメリカ英語の一般的な発音を優先する
- 説明文やMarkdownは出さない
- JSONのみ返す

出力形式:
{
  "results": [
    { "id": "word-id", "pronunciation": "/əˈdæpt/" }
  ]
}`;

export interface PronunciationResult {
  wordId: string;
  pronunciation: string;
}

interface PronunciationWordInput {
  id: string;
  english: string;
}

function normalizePronunciation(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  let text = value.trim();
  if (!text) return null;

  const lower = text.toLowerCase();
  if (['n/a', 'na', 'unknown', '不明', '-', '---'].includes(lower)) return null;

  if (text.length > MAX_PRONUNCIATION_LENGTH) return null;
  if (text.startsWith('[') && text.endsWith(']')) {
    text = `/${text.slice(1, -1).trim()}/`;
  }
  if (!text.startsWith('/')) text = `/${text}`;
  if (!text.endsWith('/')) text = `${text}/`;

  return text.length <= MAX_PRONUNCIATION_LENGTH ? text : null;
}

function buildPronunciationPrompt(words: PronunciationWordInput[]): string {
  const wordList = words
    .map((word, index) => `${index + 1}. ID: ${word.id} / English: ${word.english}`)
    .join('\n');

  return `${PRONUNCIATION_PROMPT}\n\n対象:\n${wordList}`;
}

async function generatePronunciationBatch(
  words: PronunciationWordInput[],
): Promise<PronunciationResult[]> {
  if (words.length === 0) return [];

  const config = {
    ...AI_CONFIG.lexicon.classifyPos,
    temperature: 0,
    maxOutputTokens: 2048,
    responseFormat: 'json' as const,
    responseSchema: PRONUNCIATION_RESPONSE_SCHEMA,
  };
  const provider = getProviderFromConfig(config, {
    gemini: process.env.GOOGLE_AI_API_KEY,
    openai: process.env.OPENAI_API_KEY,
  });

  const result = await provider.generateText(buildPronunciationPrompt(words), config);
  if (!result.success || !result.content?.trim()) {
    throw new Error(result.success ? 'AI pronunciation response is empty' : result.error);
  }

  const parsed = pronunciationResponseSchema.parse(parseJsonResponse(result.content));
  const inputIds = new Set(words.map((word) => word.id));

  return parsed.results
    .filter((item) => inputIds.has(item.id))
    .map((item) => ({
      wordId: item.id,
      pronunciation: normalizePronunciation(item.pronunciation),
    }))
    .filter((item): item is PronunciationResult => Boolean(item.pronunciation));
}

/**
 * 指定した単語リストの IPA 発音記号をAIで生成する。
 * 生成できた単語のみ結果に含む。
 */
export async function lookupPronunciations(
  words: PronunciationWordInput[],
): Promise<PronunciationResult[]> {
  if (words.length === 0) return [];

  const results: PronunciationResult[] = [];

  for (let i = 0; i < words.length; i += BATCH_SIZE) {
    const chunk = words.slice(i, i + BATCH_SIZE);
    try {
      results.push(...await generatePronunciationBatch(chunk));
    } catch (error) {
      console.error('[pronunciation-lookup] AI generation failed:', error);
    }
  }

  return results;
}

/**
 * pronunciation が null の単語に対して IPA を補完し DB 更新する。
 * lexicon マスターに発音があればAIを呼ばず再利用し、AIで新規生成した
 * 発音はマスターへ書き戻して次回以降使い回せるようにする。
 */
export async function backfillPronunciations(
  wordIds: string[],
): Promise<{ updated: number; errors: number; reusedFromLexicon: number }> {
  if (wordIds.length === 0) return { updated: 0, errors: 0, reusedFromLexicon: 0 };

  const supabaseAdmin = getSupabaseAdmin();

  const { data: words, error: fetchError } = await supabaseAdmin
    .from('words')
    .select('id, english, pronunciation, lexicon_entry_id')
    .in('id', wordIds)
    .is('pronunciation', null);

  if (fetchError || !words || words.length === 0) {
    return { updated: 0, errors: fetchError ? 1 : 0, reusedFromLexicon: 0 };
  }

  const rows = words as Array<{ id: string; english: string; lexicon_entry_id: string | null }>;

  // 1) lexiconマスターに発音があればAI生成をスキップして再利用する。
  const lexicon = await fetchLexiconQuizContent(
    { entryIds: rows.map((row) => row.lexicon_entry_id), senseIds: [] },
    { client: supabaseAdmin },
  );

  const reusedResults: PronunciationResult[] = [];
  const pendingRows: typeof rows = [];
  for (const row of rows) {
    const masterPronunciation = row.lexicon_entry_id
      ? lexicon.pronunciationByEntryId.get(row.lexicon_entry_id)
      : undefined;
    if (masterPronunciation) {
      reusedResults.push({ wordId: row.id, pronunciation: masterPronunciation });
    } else {
      pendingRows.push(row);
    }
  }

  // 2) マスターに無い単語のみAIで生成する。
  const lookupResults = await lookupPronunciations(
    pendingRows.map((row) => ({ id: row.id, english: row.english })),
  );

  const allResults = [...reusedResults, ...lookupResults];
  if (allResults.length === 0) {
    return { updated: 0, errors: 0, reusedFromLexicon: 0 };
  }

  let updated = 0;
  let errors = 0;

  await Promise.all(
    allResults.map(async (result) => {
      const { error } = await supabaseAdmin
        .from('words')
        .update({ pronunciation: result.pronunciation })
        .eq('id', result.wordId)
        .is('pronunciation', null);

      if (error) {
        errors++;
      } else {
        updated++;
      }
    }),
  );

  // 3) AIで生成した発音を lexicon マスターへ書き戻す（ベストエフォート）。
  if (lookupResults.length > 0) {
    const entryIdByWordId = new Map(rows.map((row) => [row.id, row.lexicon_entry_id]));
    try {
      await saveQuizContentToLexicon(
        lookupResults.map((result) => ({
          lexiconEntryId: entryIdByWordId.get(result.wordId),
          pronunciation: result.pronunciation,
        })),
        { supabaseAdmin },
      );
    } catch (lexiconError) {
      console.error('[pronunciation-lookup] Lexicon write-back failed (non-critical):', lexiconError);
    }
  }

  return { updated, errors, reusedFromLexicon: reusedResults.length };
}

export const __internal = {
  normalizePronunciation,
  buildPronunciationPrompt,
};
