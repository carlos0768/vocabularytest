// Shared types for WordSnap (Web & Mobile)
// This file contains all common type definitions used across platforms

// ============ Core Domain Types ============

export type WordStatus = 'new' | 'review' | 'mastered';

export interface Word {
  id: string;
  projectId: string;
  english: string;
  japanese: string;
  distractors: string[]; // 3 wrong answers for quiz
  exampleSentence?: string; // Example sentence using the word (Pro feature)
  exampleSentenceJa?: string; // Japanese translation of example sentence
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
}

export interface Project {
  id: string;
  userId: string;
  title: string;
  createdAt: string; // ISO string
  isSynced?: boolean; // Local-only flag for cloud sync status
  shareId?: string; // Unique share ID for URL sharing (null = private)
}

// ============ AI Response Types ============

export interface AIWordExtraction {
  english: string;
  japanese: string;
  distractors: string[];
  exampleSentence?: string;
  exampleSentenceJa?: string;
}

export interface AIResponse {
  words: AIWordExtraction[];
}

// ============ Quiz Types ============

export interface QuizQuestion {
  word: Word;
  options: string[]; // Shuffled: 1 correct + 3 distractors
  correctIndex: number;
}

export interface QuizResult {
  wordId: string;
  isCorrect: boolean;
  selectedIndex: number;
}

// ============ Repository Interface ============

export interface WordRepository {
  // Projects
  createProject(project: Omit<Project, 'id' | 'createdAt'>): Promise<Project>;
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
  komojuSubscriptionId?: string;
  komojuCustomerId?: string;
  currentPeriodStart?: string;
  currentPeriodEnd?: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserState {
  id: string;
  email: string;
  subscriptionStatus: SubscriptionStatus;
  subscriptionPlan: SubscriptionPlan;
  dailyScanCount: number;
  lastScanDate: string;
}

// ============ Auth Types ============

export interface AuthUser {
  id: string;
  email: string;
  subscription?: Subscription;
}

// ============ Grammar Types ============

export type EikenGrammarLevel = '5' | '4' | '3' | 'pre2' | '2' | 'pre1' | '1' | null;

export interface GrammarPattern {
  id: string;
  projectId: string;
  patternName: string; // e.g., "現在完了形", "関係代名詞"
  patternNameEn: string; // e.g., "Present Perfect", "Relative Pronouns"
  originalSentence: string; // Original sentence from the image
  explanation: string; // Japanese explanation of the grammar
  structure: string; // e.g., "have/has + 過去分詞"
  example: string; // Example sentence demonstrating the pattern
  exampleJa: string; // Japanese translation of example
  level: EikenGrammarLevel; // EIKEN level association
  createdAt: string;
}

export interface GrammarQuizQuestion {
  id: string;
  patternId: string;
  questionType: 'fill_blank' | 'choice' | 'reorder';
  question: string; // The question text
  questionJa?: string; // Japanese hint/translation
  correctAnswer: string;
  options?: string[]; // For choice type
  explanation: string; // Why this is correct
  createdAt: string;
}

export interface AIGrammarExtraction {
  patternName: string;
  patternNameEn: string;
  originalSentence: string;
  explanation: string;
  structure: string;
  example: string;
  exampleJa: string;
  level: EikenGrammarLevel;
  quizQuestions: {
    questionType: 'fill_blank' | 'choice' | 'reorder';
    question: string;
    questionJa?: string;
    correctAnswer: string;
    options?: string[];
    explanation: string;
  }[];
}

export interface AIGrammarResponse {
  extractedText: string; // Full text extracted from image
  grammarPatterns: AIGrammarExtraction[];
}
