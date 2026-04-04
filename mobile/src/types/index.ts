export type {
  WordStatus,
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
};
