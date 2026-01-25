import { z } from 'zod';

// Zod schema for validating OpenAI API response
// This ensures robustness against malformed AI outputs

export const AIWordSchema = z.object({
  english: z.string().min(1, '英単語が必要です'),
  japanese: z.string().min(1, '日本語訳が必要です'),
  distractors: z
    .array(z.string())
    .min(3, '誤答が3つ必要です')
    .max(4, '誤答が多すぎます')
    .transform((arr) => arr.slice(0, 3).map(s => s || '---')), // Ensure 3 items, replace empty with placeholder
  // Optional example sentence fields (Pro feature)
  exampleSentence: z.string().optional(),
  exampleSentenceJa: z.string().optional(),
});

export const AIResponseSchema = z.object({
  words: z.array(AIWordSchema).min(1, '単語が見つかりませんでした'),
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
    return { success: true, data: result.data };
  }

  // Format Zod errors for user-friendly display
  const errorMessages = result.error.issues
    .map((e) => `${e.path.join('.')}: ${e.message}`)
    .join(', ');

  return { success: false, error: errorMessages };
}
