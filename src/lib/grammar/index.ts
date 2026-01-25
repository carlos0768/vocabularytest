/**
 * Grammar Quiz Module
 * デュオリンゴ式文法クイズのロジックとフックをエクスポート
 */

// ユーティリティ関数
export {
  // Type Guards
  isLegacyQuestionType,
  isNewQuestionType,
  isLegacyQuizQuestion,

  // Migration
  migrateQuizQuestion,
  migrateGrammarExtraction,
  normalizeGrammarExtraction,

  // Quiz State Management
  createInitialAnswerState,
  selectWord,
  deselectWord,
  deselectWordAtIndex,
  resetAnswerState,

  // Validation
  validateAnswer,
  canSubmitAnswer,

  // Helpers
  shuffleArray,
  getCorrectWordFromOptions,
  getMaxSelectionCount,
  getQuestionTypeLabel,

  // Types
  type AnswerState,
  type ValidationResult,
} from './quiz-utils';

// React Hooks
export {
  useGrammarQuiz,
  useSingleQuestion,
  type UseGrammarQuizReturn,
  type UseSingleQuestionReturn,
  type QuizProgress,
  type QuizPhase,
} from './use-grammar-quiz';
