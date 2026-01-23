// Core domain types for ScanVocab

export type WordStatus = 'new' | 'review' | 'mastered';

export interface Word {
  id: string;
  projectId: string;
  english: string;
  japanese: string;
  distractors: string[]; // 3 wrong answers for quiz
  status: WordStatus;
  createdAt: string; // ISO string
}

export interface Project {
  id: string;
  userId: string;
  title: string;
  createdAt: string; // ISO string
  isSynced?: boolean; // Local-only flag for cloud sync status
}

// AI Response types
export interface AIWordExtraction {
  english: string;
  japanese: string;
  distractors: string[];
}

export interface AIResponse {
  words: AIWordExtraction[];
}

// Quiz types
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

// Repository interface for hybrid storage pattern
export interface WordRepository {
  // Projects
  createProject(project: Omit<Project, 'id' | 'createdAt'>): Promise<Project>;
  getProjects(userId: string): Promise<Project[]>;
  getProject(id: string): Promise<Project | undefined>;
  updateProject(id: string, updates: Partial<Project>): Promise<void>;
  deleteProject(id: string): Promise<void>;

  // Words
  createWords(words: Omit<Word, 'id' | 'createdAt'>[]): Promise<Word[]>;
  getWords(projectId: string): Promise<Word[]>;
  getWord(id: string): Promise<Word | undefined>;
  updateWord(id: string, updates: Partial<Word>): Promise<void>;
  deleteWord(id: string): Promise<void>;
  deleteWordsByProject(projectId: string): Promise<void>;
}

// App state types
export interface ScanProgress {
  step: 'uploading' | 'analyzing' | 'generating' | 'complete' | 'error';
  message: string;
}

// Subscription types
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

// Auth types
export interface AuthUser {
  id: string;
  email: string;
  subscription?: Subscription;
}

// KOMOJU types
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
