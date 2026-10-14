// 語順クイズ (word-order) の採点・表示まわりの純粋関数。
// クイズ画面 (`/quiz/[projectId]`) とその語順パネルから使う。
import type { MultipleChoiceQuizQuestion, QuizQuestion, WordOrderQuizQuestion } from '@/types';
import { WORD_ORDER_BLANK_TOKEN } from '@/lib/quiz/word-order';

export function isWordOrderQuestion(question: QuizQuestion | undefined): question is WordOrderQuizQuestion {
  return question?.type === 'word-order';
}

export function isMultipleChoiceQuestion(question: QuizQuestion | undefined): question is MultipleChoiceQuizQuestion {
  return question !== undefined && question.type !== 'word-order';
}

export function wordOrderTokenKey(token: string): string {
  return token.trim().toLowerCase();
}

export function wordOrderTokensMatch(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((token, index) => wordOrderTokenKey(token) === wordOrderTokenKey(right[index] ?? ''));
}

export function normalizeDisplayText(value: string | null | undefined): string | null {
  const text = value?.trim().replace(/\s+/g, ' ');
  return text ? text : null;
}

export function buildCompletedWordOrderSentence(question: WordOrderQuizQuestion): string {
  let answerIndex = 0;
  const tokens = question.sentenceTokens
    .map((token) => {
      if (token !== WORD_ORDER_BLANK_TOKEN) return token;
      const answerToken = question.answerTokens[answerIndex];
      answerIndex += 1;
      return answerToken ?? '';
    })
    .filter(Boolean);

  return tokens
    .join(' ')
    .replace(/\s+([.,!?;:])/g, '$1')
    .replace(/\(\s+/g, '(')
    .replace(/\s+\)/g, ')');
}

export function getUsedWordOrderOptionIndexes(options: string[], selectedTokens: string[]): Set<number> {
  const usedIndexes = new Set<number>();
  for (const selectedToken of selectedTokens) {
    const selectedKey = wordOrderTokenKey(selectedToken);
    const optionIndex = options.findIndex((option, index) => (
      !usedIndexes.has(index) && wordOrderTokenKey(option) === selectedKey
    ));
    if (optionIndex >= 0) usedIndexes.add(optionIndex);
  }
  return usedIndexes;
}
