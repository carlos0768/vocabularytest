export type {
  WordStatus,
  VocabularyType,
  ProjectShareScope,
  RelatedWord,
  UsagePattern,
  Word,
  Project,
  AIWordExtraction,
  AIResponse,
  QuizQuestion,
  QuizResult,
  WordRepository,
  ProgressStep,
  ScanProgress,
  SubscriptionStatus,
  SubscriptionPlan,
  Subscription,
  AuthUser,
  UserState,
  EikenGrammarLevel,
  GrammarPattern,
  GrammarQuizQuestion,
  AIGrammarExtraction,
  AIGrammarResponse,
  SentenceQuestionType,
  BlankSlot,
  EnhancedBlankSlot,
  FillInBlankQuestion,
  WordOrderQuestion,
  MultiFillInBlankQuestion,
  SentenceQuizQuestion,
} from '../shared/types';

// ---------- Tab-level navigation ----------

import type { NavigatorScreenParams } from '@react-navigation/native';

export type HomeStackParamList = {
  Home: undefined;
  ProjectList: undefined;
  Project: { projectId: string };
  WordDetail: { word: import('../shared/types').Word };
  Quiz: { projectId: string };
  Flashcard: { projectId: string; favoritesOnly?: boolean };
  Grammar: { projectId: string };
  Favorites: undefined;
  FavoritesFlashcard: undefined;
  FavoritesQuiz: undefined;
  WrongAnswers: undefined;
  WrongAnswersQuiz: undefined;
  ScanConfirm: {
    words: import('../shared/types').AIWordExtraction[];
    projectName?: string;
    projectId?: string;
  };
};

export type SharedStackParamList = {
  SharedProjects: undefined;
  SharedProjectDetail: { projectId: string };
};

export type StatsStackParamList = {
  Stats: undefined;
};

export type SettingsStackParamList = {
  Settings: undefined;
  Subscription: undefined;
  Login: undefined;
  Signup: undefined;
};

export type TabParamList = {
  HomeTab: NavigatorScreenParams<HomeStackParamList>;
  SharedTab: NavigatorScreenParams<SharedStackParamList>;
  StatsTab: NavigatorScreenParams<StatsStackParamList>;
  SettingsTab: NavigatorScreenParams<SettingsStackParamList>;
};

// Legacy flat param list (still used in some screens for convenience)
export type RootStackParamList = {
  Main: undefined;
  Login: undefined;
  Signup: undefined;
  Settings: undefined;
  Subscription: undefined;
  ScanConfirm: {
    words: import('../shared/types').AIWordExtraction[];
    projectName?: string;
    projectId?: string;
  };
  Project: { projectId: string };
  Quiz: { projectId: string };
  Flashcard: { projectId: string; favoritesOnly?: boolean };
  Grammar: { projectId: string };
  Favorites: undefined;
  FavoritesFlashcard: undefined;
  FavoritesQuiz: undefined;
  WrongAnswers: undefined;
  WrongAnswersQuiz: undefined;
  Stats: undefined;
  SharedProjects: undefined;
  SharedProjectDetail: { projectId: string };
};
