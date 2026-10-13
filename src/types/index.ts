// Types for WordSnap Web
// Re-exports shared types and adds web-specific types

// ============ Shared Types (from /shared/types) ============

export type {
  VocabularyType,
  WordStatus,
  CustomSection,
  CustomColumn,
  RelatedWord,
  UsagePattern,
  WordMorphology,
  WordTranslation,
  WordTranslationSource,
  LexiconEntry,
  Word,
  Project,
  ProjectShareScope,
  ProjectKind,
  AIWordExtraction,
  MultipleChoiceQuizQuestion,
  QuizQuestion,
  WordOrderQuizCache,
  WordOrderQuizQuestion,
  WordRepository,
  SubscriptionStatus,
  SubscriptionPlan,
  Subscription,
  // Collection types
  Collection,
  CollectionProject,
} from '../../shared/types';

// ============ Web-Specific Types ============

// Stripe Payment types (Web only - payment handled on web)
// 値の再輸出（上のブロックは type-only なので別立てにする）。
export { PROJECT_KINDS, normalizeProjectKind } from '../../shared/types';
