import { z } from 'zod';

// 穴埋め問題の空欄スキーマ
const blankSlotSchema = z.object({
  correctAnswer: z.string(),
  options: z.array(z.string()).length(4), // 4択
});

// 穴埋め問題のAIレスポンススキーマ
export const fillInBlankResponseSchema = z.object({
  sentence: z.string(), // 空欄付き文（"I ___ to school ___ day ___."）
  blanks: z.array(blankSlotSchema).length(3), // 3つの空欄
  japaneseMeaning: z.string(),
});

// 並び替え問題のAIレスポンススキーマ
export const wordOrderResponseSchema = z.object({
  correctOrder: z.array(z.string()).min(3), // 最低3単語
  japaneseMeaning: z.string(),
});

// 単一の問題生成レスポンス（穴埋めまたは並び替え）
export const singleQuestionResponseSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('fill-in-blank'),
    ...fillInBlankResponseSchema.shape,
  }),
  z.object({
    type: z.literal('word-order'),
    ...wordOrderResponseSchema.shape,
  }),
]);

// バッチ生成時のレスポンス（複数問題）
export const batchQuestionsResponseSchema = z.object({
  questions: z.array(
    z.object({
      wordId: z.string(),
      type: z.enum(['fill-in-blank', 'word-order']),
      // 穴埋め問題用
      sentence: z.string().optional(),
      blanks: z.array(blankSlotSchema).optional(),
      // 並び替え問題用
      correctOrder: z.array(z.string()).optional(),
      // 共通
      japaneseMeaning: z.string(),
    })
  ),
});

export type FillInBlankResponse = z.infer<typeof fillInBlankResponseSchema>;
export type WordOrderResponse = z.infer<typeof wordOrderResponseSchema>;
export type BatchQuestionsResponse = z.infer<typeof batchQuestionsResponseSchema>;
