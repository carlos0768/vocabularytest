export type QuizResults = {
  correct: number;
  total: number;
};

export type QuizQuestionCountInput = {
  parsedInput: number;
  isValidInput: boolean;
};

export function calculateQuizScorePercentage(results: QuizResults): number {
  return Math.round((results.correct / results.total) * 100);
}

export function getQuizCompletionMessage(percentage: number): string {
  if (percentage === 100) {
    return 'パーフェクト! 素晴らしい!';
  }

  if (percentage >= 80) {
    return 'よくできました!';
  }

  if (percentage >= 60) {
    return 'もう少し! 復習しましょう';
  }

  return '繰り返し練習しましょう!';
}

export function calculateQuizProgressPercentage(currentIndex: number, questionCount: number): number {
  return ((currentIndex + 1) / questionCount) * 100;
}

export function parseQuizQuestionCountInput(
  inputCount: string,
  maxQuestions: number,
): QuizQuestionCountInput {
  const parsedInput = parseInt(inputCount, 10);
  const isValidInput = !isNaN(parsedInput) && parsedInput >= 1 && parsedInput <= maxQuestions;

  return {
    parsedInput,
    isValidInput,
  };
}
