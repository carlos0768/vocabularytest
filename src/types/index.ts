// Types for WordSnap Web
// Re-exports shared types and adds web-specific types

// ============ Shared Types (from /shared/types) ============

export type {
  VocabularyType,
  WordStatus,
  CustomSection,
  RelatedWord,
  UsagePattern,
  LexiconEntry,
  LexiconSense,
  Word,
  Project,
  ProjectShareScope,
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
  // Sentence Quiz types
  SentenceQuizType,
  BlankSlot,
  FillInBlankQuestion,
  WordOrderQuestion,
  SentenceQuizQuestion,
  AISentenceFillInBlank,
  AISentenceWordOrder,
  SentenceQuizWordInput,
  SentenceQuizResponse,
  // Enhanced Sentence Quiz types (VectorDB)
  BlankSource,
  EnhancedBlankSlot,
  MultiFillInBlankQuestion,
  VectorSearchResult,
  BlankPrediction,
  AIMultiBlankResponse,
  EnhancedSentenceQuizQuestion,
  // Collection types
  Collection,
  CollectionProject,
  // Grammar types
  ProjectType,
  GrammarQuizType,
  GrammarWordOption,
  GrammarQuizQuestion,
  GrammarPattern,
  AIGrammarResponse,
} from '../../shared/types';

// ============ Web-Specific Types ============

// Stripe Payment types (Web only - payment handled on web)
export interface StripeSubscriptionPlan {
  id: string;
  name: string;
  price: number;
  currency: string;
  interval: 'month' | 'year';
}

export interface StripeCheckoutSession {
  sessionId: string;
  checkoutUrl: string;
}
