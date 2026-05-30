// Shared types for WordSnap (Web & Mobile)
// This file contains all common type definitions used across platforms

// ============ Core Domain Types ============

export type WordStatus = 'new' | 'review' | 'mastered';
export type VocabularyType = 'active' | 'passive';
export type ProjectShareScope = 'private' | 'public';

export interface RelatedWord {
  term: string;
  relation: string;
  noteJa?: string;
}

export interface UsagePattern {
  pattern: string;
  meaningJa: string;
  example?: string;
  exampleJa?: string;
  register?: string;
}

export interface WordOrderQuizCache {
  version: 1;
  sourceEnglish: string;
  sourceJapanese: string;
  sentenceTokens: string[];
  answerTokens: string[];
  decoyTokens: string[];
  generatedAt: string;
}

export interface LexiconSense {
  id: string;
  lexiconEntryId: string;
  translationJa: string;
  normalizedTranslationJa: string;
  meaningSummary?: string;
  usageNotes?: string;
  exampleSentence?: string;
  exampleSentenceJa?: string;
  translationSource?: string;
  isPrimary: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface LexiconEntry {
  id: string;
  headword: string;
  normalizedHeadword: string;
  pos: string;
  cefrLevel?: string;
  datasetSources: string[];
  primarySense?: LexiconSense;
  senses?: LexiconSense[];
  translationJa?: string;
  translationSource?: string;
  exampleSentence?: string;
  exampleSentenceJa?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CustomSection {
  id: string;
  title: string;
  content: string;
}

// Project-level column definition used by the word list table.
// The column `id` matches the Word.customSections entry `id` so cell values
// flow through the existing per-word custom sections storage.
export type CustomColumnType = 'text' | 'number' | 'date';

export interface CustomColumn {
  id: string;
  title: string;
  type: CustomColumnType;
}

// ============ Project Block Types (Notion-like) ============

export type ProjectBlockType = 'richText' | 'wordList' | 'database';

/** Serialised AI passage-word match stored alongside the rich text block. */
export interface CachedPassageMatch {
  id: string;
  matchedText: string;
}

export interface RichTextBlockData {
  html: string;
  /**
   * Cached results from `/api/passage-word-matches`. Stored so highlights
   * appear instantly on page load instead of waiting for a fresh AI call.
   * The component still refreshes in the background and overwrites when
   * the passage or word list changes.
   */
  cachedAiMatches?: CachedPassageMatch[];
}

/** Reserved for future per-block config (filters, view mode, etc.). */
export type WordListBlockData = Record<string, never>;

/** Reserved for future nested database support. */
export type DatabaseBlockData = Record<string, never>;

export type ProjectBlockData =
  | RichTextBlockData
  | WordListBlockData
  | DatabaseBlockData;

export interface ProjectBlock {
  id: string;
  type: ProjectBlockType;
  position: number;
  data: ProjectBlockData;
}

export interface Word {
  id: string;
  projectId: string;
  english: string;
  japanese: string;
  vocabularyType?: VocabularyType | null;
  japaneseSource?: 'scan' | 'ai';
  lexiconEntryId?: string;
  lexiconSenseId?: string;
  cefrLevel?: string;
  distractors: string[]; // 3 wrong answers for quiz
  exampleSentence?: string; // Example sentence using the word (Pro feature)
  exampleSentenceJa?: string; // Japanese translation of example sentence
  pronunciation?: string; // IPA pronunciation e.g. "/ɪˈlæb.ər.ət/"
  status: WordStatus;
  createdAt: string; // ISO string
  // Spaced repetition fields (SM-2 algorithm)
  lastReviewedAt?: string; // ISO string - when last reviewed
  nextReviewAt?: string; // ISO string - when to review next
  easeFactor: number; // SM-2 ease factor (default 2.5)
  intervalDays: number; // Days until next review (default 0)
  repetition: number; // Number of successful repetitions (default 0)
  // Favorite marking
  isFavorite: boolean; // User marked as difficult/important
  // Lexical insights (Pro feature)
  partOfSpeechTags?: string[];
  relatedWords?: RelatedWord[];
  usagePatterns?: UsagePattern[];
  insightsGeneratedAt?: string; // ISO string
  insightsVersion?: number; // Schema version
  wordOrderQuiz?: WordOrderQuizCache;
  // User-created custom sections
  customSections?: CustomSection[];
}

export interface Project {
  id: string;
  userId: string;
  title: string;
  description?: string; // Optional free-form description shown on the detail page
  sourceLabels: string[]; // Physical source labels extracted from scans
  iconImage?: string; // Base64 data URL icon shown on project cards
  createdAt: string; // ISO string
  isSynced?: boolean; // Local-only flag for cloud sync status
  shareId?: string; // Unique share ID for URL sharing (null = private)
  shareScope?: ProjectShareScope; // Whether the shared project is listed publicly
  /** Set when this project was created by importing a copy from /share/[shareId] */
  importedFromShareId?: string;
  isFavorite?: boolean; // User bookmarked this project (defaults to false)
  /** User-defined extra columns shown in the project word list table. */
  customColumns?: CustomColumn[];
  /** Notion-like block layout. When undefined, treat as a single implicit wordList block. */
  blocks?: ProjectBlock[];
}

// ============ Collection Types ============

export interface Collection {
  id: string;
  userId: string;
  name: string;
  description?: string;
  createdAt: string; // ISO string
  updatedAt: string; // ISO string
}

export interface CollectionProject {
  collectionId: string;
  projectId: string;
  sortOrder: number;
  addedAt: string; // ISO string
}

// ============ AI Response Types ============

export interface AIWordExtraction {
  english: string;
  japanese: string;
  japaneseSource?: 'scan' | 'ai';
  sourceModes?: Array<'all' | 'circled' | 'eiken' | 'idiom'>;
  lexiconEntryId?: string;
  lexiconSenseId?: string;
  cefrLevel?: string;
  distractors: string[];
  partOfSpeechTags?: string[];
  pronunciation?: string;
  exampleSentence?: string;
  exampleSentenceJa?: string;
}

export interface AIResponse {
  words: AIWordExtraction[];
  sourceLabels: string[];
  lexiconEntries?: LexiconEntry[];
}

// ============ Quiz Types ============

export interface MultipleChoiceQuizQuestion {
  type?: 'multiple-choice';
  word: Word;
  options: string[]; // Shuffled: 1 correct + 3 distractors
  correctIndex: number;
}

export interface WordOrderQuizQuestion {
  type: 'word-order';
  word: Word;
  sentenceTokens: string[];
  answerTokens: string[];
  decoyTokens: string[];
  options: string[];
  correctIndex?: never;
}

export type QuizQuestion = MultipleChoiceQuizQuestion | WordOrderQuizQuestion;

export interface QuizResult {
  wordId: string;
  isCorrect: boolean;
  selectedIndex: number;
}

// ============ Repository Interface ============

export interface WordRepository {
  // Projects
  createProject(project: Omit<Project, 'id' | 'createdAt' | 'sourceLabels'> & { sourceLabels?: string[] }): Promise<Project>;
  getProjects(userId: string): Promise<Project[]>;
  getProject(id: string): Promise<Project | undefined>;
  updateProject(id: string, updates: Partial<Project>): Promise<void>;
  deleteProject(id: string): Promise<void>;

  // Words
  createWords(words: Omit<Word, 'id' | 'createdAt' | 'easeFactor' | 'intervalDays' | 'repetition' | 'isFavorite' | 'lastReviewedAt' | 'nextReviewAt' | 'status'>[]): Promise<Word[]>;
  getWords(projectId: string): Promise<Word[]>;
  getWord(id: string): Promise<Word | undefined>;
  updateWord(id: string, updates: Partial<Word>): Promise<void>;
  deleteWord(id: string): Promise<void>;
  deleteWordsByProject(projectId: string): Promise<void>;
}

// ============ App State Types ============

export interface ScanProgress {
  step: 'uploading' | 'analyzing' | 'generating' | 'complete' | 'error';
  message: string;
}

export interface ProgressStep {
  id: string;
  label: string;
  status: 'pending' | 'active' | 'complete' | 'error';
}

// ============ Subscription Types ============

export type SubscriptionStatus = 'free' | 'active' | 'cancelled' | 'past_due';
export type SubscriptionPlan = 'free' | 'pro';

export interface Subscription {
  id: string;
  userId: string;
  status: SubscriptionStatus;
  plan: SubscriptionPlan;
  proSource: 'none' | 'billing' | 'test' | 'appstore';
  testProExpiresAt: string | null;
  stripeSubscriptionId?: string;
  stripeCustomerId?: string;
  currentPeriodStart?: string;
  currentPeriodEnd?: string;
  cancelAtPeriodEnd?: boolean;
  cancelRequestedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserState {
  id: string;
  email: string;
  username?: string | null;
  subscriptionStatus: SubscriptionStatus;
  subscriptionPlan: SubscriptionPlan;
  dailyScanCount: number;
  lastScanDate: string;
}

// ============ Profile Types ============

export interface Profile {
  userId: string;
  username: string | null;
}

// ============ Auth Types ============

export interface AuthUser {
  id: string;
  email: string;
  username?: string | null;
  subscription?: Subscription;
}
