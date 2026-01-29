import { z } from 'zod';

// Zod schema for validating OpenAI API response
// This ensures robustness against malformed AI outputs

export const AIWordSchema = z.object({
  english: z.string(),
  japanese: z.string(),
  distractors: z.array(z.string()).default([]),
  // Optional example sentence fields (Pro feature)
  exampleSentence: z.string().optional().nullable(),
  exampleSentenceJa: z.string().optional().nullable(),
}).transform((word) => ({
  ...word,
  english: word.english || '---',
  japanese: word.japanese || '---',
  // Keep distractors as-is (empty array if not provided, will be generated on quiz start)
  distractors: word.distractors,
  exampleSentence: word.exampleSentence || undefined,
  exampleSentenceJa: word.exampleSentenceJa || undefined,
}));

export const AIResponseSchema = z.object({
  words: z.array(AIWordSchema).default([]),
});

export type ValidatedAIResponse = z.infer<typeof AIResponseSchema>;
export type ValidatedAIWord = z.infer<typeof AIWordSchema>;

// Safe parser that returns result with error info
export function parseAIResponse(data: unknown): {
  success: boolean;
  data?: ValidatedAIResponse;
  error?: string;
} {
  console.log('parseAIResponse input:', JSON.stringify(data, null, 2));

  const result = AIResponseSchema.safeParse(data);

  if (result.success) {
    console.log('parseAIResponse success:', JSON.stringify(result.data, null, 2));
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
