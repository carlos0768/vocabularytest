import { z } from 'zod';
import { normalizePartOfSpeechTags } from '@/lib/ai/part-of-speech';
import { normalizeSourceLabels } from '../../../shared/source-labels';

// Zod schema for validating OpenAI API response
// This ensures robustness against malformed AI outputs

export const AIWordSchema = z.object({
  english: z.string(),
  japanese: z.string().optional().default(''),
  japaneseSource: z.string().optional(),
  distractors: z.array(z.string()).default([]),
  partOfSpeechTags: z.array(z.string()).nullish().transform((tags) => tags ?? []),
  // Optional example sentence fields (Pro feature)
  exampleSentence: z.string().optional().nullable(),
  exampleSentenceJa: z.string().optional().nullable(),
}).transform((word) => {
  const { japaneseSource: rawJapaneseSource, ...rest } = word;
  // Sanitize japanese: treat "unknown", "不明", empty as missing
  const INVALID_JAPANESE = ['unknown', '不明', 'n/a', 'N/A', '-', '---', ''];
  const sanitizedJapanese = INVALID_JAPANESE.includes(word.japanese?.trim() ?? '')
    ? ''
    : word.japanese;
  const japaneseSource = rawJapaneseSource === 'scan' || rawJapaneseSource === 'ai'
    ? rawJapaneseSource
    : undefined;
  return {
    ...rest,
    english: word.english || '---',
    japanese: sanitizedJapanese,
    // Keep distractors as-is (empty array if not provided, will be generated on quiz start)
    distractors: word.distractors,
    partOfSpeechTags: normalizePartOfSpeechTags(word.partOfSpeechTags),
    exampleSentence: word.exampleSentence || undefined,
    exampleSentenceJa: word.exampleSentenceJa || undefined,
    ...(sanitizedJapanese && japaneseSource ? { japaneseSource } : {}),
  };
});

export const AIResponseSchema = z.object({
  words: z.array(AIWordSchema).default([]),
  sourceLabels: z.array(z.string()).default([]).transform((labels) => normalizeSourceLabels(labels)),
});

export type ValidatedAIResponse = z.infer<typeof AIResponseSchema>;
export type ValidatedAIWord = z.infer<typeof AIWordSchema>;

// Safe parser that returns result with error info
export function parseAIResponse(data: unknown): {
  success: boolean;
  data?: ValidatedAIResponse;
  error?: string;
} {
  const result = AIResponseSchema.safeParse(data);

  if (result.success) {
    const count = result.data.words.length;
    if (count === 0) {
      console.warn('parseAIResponse parsed valid JSON but no words were extracted');
    } else {
      console.log(`parseAIResponse success: extracted ${count} words`);
    }
    return { success: true, data: result.data };
  }

  // Format Zod errors for user-friendly display
  const errorMessages = result.error.issues
    .map((e) => `${e.path.join('.')}: ${e.message}`)
    .join(', ');

  console.error('parseAIResponse error:', errorMessages);
  console.error('Zod issues:', JSON.stringify(result.error.issues, null, 2));

  return { success: false, error: 'AIの応答形式が不正です。もう一度お試しください。' };
}
