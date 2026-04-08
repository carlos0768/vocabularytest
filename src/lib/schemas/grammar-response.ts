import { z } from 'zod';

const GrammarWordOptionSchema = z.object({
  word: z.string(),
  isCorrect: z.boolean(),
  isDistractor: z.boolean(),
});

const GrammarQuizQuestionSchema = z.object({
  questionType: z.enum(['single_select', 'word_tap', 'sentence_build']),
  question: z.string(),
  questionJa: z.string().default(''),
  wordOptions: z.array(GrammarWordOptionSchema).optional(),
  sentenceWords: z.array(z.string()).optional(),
  extraWords: z.array(z.string()).optional(),
  correctAnswer: z.string(),
  explanation: z.string().default(''),
  grammarPoint: z.string().default(''),
});

const GrammarPatternSchema = z.object({
  patternName: z.string(),
  patternNameEn: z.string().default(''),
  originalSentence: z.string().default(''),
  explanation: z.string().default(''),
  structure: z.string().default(''),
  example: z.string().default(''),
  exampleJa: z.string().default(''),
  level: z.enum(['pre1', '1']).default('pre1'),
  quizQuestions: z.array(GrammarQuizQuestionSchema).default([]),
});

export const GrammarResponseSchema = z.object({
  grammarPatterns: z.array(GrammarPatternSchema).default([]),
});

export type ValidatedGrammarResponse = z.infer<typeof GrammarResponseSchema>;
export type ValidatedGrammarPattern = z.infer<typeof GrammarPatternSchema>;

export function parseGrammarResponse(data: unknown): {
  success: boolean;
  data?: ValidatedGrammarResponse;
  error?: string;
} {
  const result = GrammarResponseSchema.safeParse(data);

  if (result.success) {
    const count = result.data.grammarPatterns.length;
    if (count === 0) {
      console.warn('parseGrammarResponse: no grammar patterns extracted');
    } else {
      console.log(`parseGrammarResponse success: extracted ${count} grammar patterns`);
    }
    return { success: true, data: result.data };
  }

  const errorMessages = result.error.issues
    .map((e) => `${e.path.join('.')}: ${e.message}`)
    .join(', ');

  console.error('parseGrammarResponse error:', errorMessages);
  return { success: false, error: '文法データの解析に失敗しました。もう一度お試しください。' };
}
