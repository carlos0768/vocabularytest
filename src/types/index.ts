// Types for WordSnap Web
// Re-exports shared types and adds web-specific types

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
  // Sentence Quiz types (Duolingo-style)
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
} from '../../shared/types';

// ============ Web-Specific Types ============

// KOMOJU Payment types (Web only - payment handled on web)
export interface KomojuSubscriptionPlan {
  id: string;
  name: string;
  price: number;
  currency: string;
  interval: 'month' | 'year';
}

export interface KomojuPaymentSession {
  sessionId: string;
  paymentUrl: string;
}

