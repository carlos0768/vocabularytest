import { z } from 'zod';

// Zod schema for validating OpenAI API response
// This ensures robustness against malformed AI outputs

export const AIWordSchema = z.object({
  english: z.string().min(1, 'English word is required'),
  japanese: z.string().min(1, 'Japanese translation is required'),
  distractors: z
    .array(z.string().min(1))
    .length(3, 'Exactly 3 distractors required'),
});

export const AIResponseSchema = z.object({
  words: z.array(AIWordSchema).min(1, 'At least one word is required'),
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
