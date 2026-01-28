// Types for WordSnap Mobile
// Re-exports shared types and adds mobile-specific types

// ============ Shared Types (from /shared/types) ============
export type {
  WordStatus,
  Word,
  Project,
  AIWordExtraction,
  AIResponse,
  QuizQuestion,
  QuizResult,
  WordRepository,
  ScanProgress,
  ProgressStep,
  SubscriptionStatus,
  SubscriptionPlan,
  Subscription,
  UserState,
  AuthUser,
  // Grammar types
  EikenGrammarLevel,
  GrammarPattern,
  GrammarQuizQuestion,
  AIGrammarExtraction,
  AIGrammarResponse,
  // Sentence Quiz types
  SentenceQuestionType,
  BlankSlot,
  EnhancedBlankSlot,
  FillInBlankQuestion,
  WordOrderQuestion,
  MultiFillInBlankQuestion,
  SentenceQuizQuestion,
} from '../shared/types';

// ============ Mobile-Specific Types ============

// Navigation types (React Navigation)
export type RootStackParamList = {
  Main: undefined;
  Login: undefined;
  Signup: undefined;
  Settings: undefined;
  Subscription: undefined;
  SubscriptionSuccess: undefined;
  SubscriptionCancel: undefined;
  ScanConfirm: { words: import('../shared/types').AIWordExtraction[]; projectName?: string; projectId?: string };
  Project: { projectId: string };
  Quiz: { projectId: string };
  Flashcard: { projectId: string; favoritesOnly?: boolean };
  Grammar: { projectId: string };
  GrammarScan: { projectId: string };
  GrammarQuiz: { projectId: string };
  Favorites: undefined;
  FavoritesFlashcard: undefined;
  FavoritesQuiz: undefined;
  WrongAnswers: undefined;
  WrongAnswersQuiz: undefined;
};

export type MainTabParamList = {
  Home: undefined;
  Settings: undefined;
};
