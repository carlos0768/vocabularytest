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
  iconImage?: string; // Base64 data URL icon shown on project cards
  createdAt: string; // ISO string
  isSynced?: boolean; // Local-only flag for cloud sync status
  shareId?: string; // Unique share ID for URL sharing (null = private)
  isFavorite?: boolean; // User bookmarked this project (defaults to false)
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
  proSource: 'none' | 'billing' | 'test';
  testProExpiresAt: string | null;
  komojuSubscriptionId?: string;
  komojuCustomerId?: string;
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

// ============ Sentence Quiz Types (Duolingo-style) ============

/**
 * 例文クイズの問題タイプ
 * - fill-in-blank: 穴埋め問題（3箇所空欄）
 * - word-order: 並び替え問題（単語単位）
 */
export type SentenceQuizType = 'fill-in-blank' | 'word-order';

/**
 * 穴埋め問題の空欄情報
 */
export interface BlankSlot {
  index: number;           // 文中の空欄番号（0, 1, 2）
  correctAnswer: string;   // 正解
  options: string[];       // 4択（正解含む、シャッフル済み）
}

/**
 * 穴埋め問題
 */
export interface FillInBlankQuestion {
  type: 'fill-in-blank';
  wordId: string;          // 元の単語ID
  targetWord: string;      // 学習対象の単語
  sentence: string;        // 空欄付き文（"I ___ to school ___ day ___."）
  blanks: BlankSlot[];     // 3つの空欄情報
  japaneseMeaning: string; // 日本語訳
}

/**
 * 並び替え問題
 */
export interface WordOrderQuestion {
  type: 'word-order';
  wordId: string;           // 元の単語ID
  targetWord: string;       // 学習対象の単語
  shuffledWords: string[];  // シャッフルされた単語配列
  correctOrder: string[];   // 正解の順序
  japaneseMeaning: string;  // 日本語訳（ヒントとして表示）
}

/**
 * 例文クイズの問題（穴埋めまたは並び替え）
 */
export type SentenceQuizQuestion = FillInBlankQuestion | WordOrderQuestion;

/**
 * AIから返される穴埋め問題データ
 */
export interface AISentenceFillInBlank {
  sentence: string;        // 空欄付き文
  blanks: {
    correctAnswer: string;
    options: string[];     // 4択（正解含む）
  }[];
  japaneseMeaning: string;
}

/**
 * AIから返される並び替え問題データ
 */
export interface AISentenceWordOrder {
  correctOrder: string[];   // 正解の語順
  japaneseMeaning: string;
}

/**
 * APIリクエスト用の単語情報
 */
export interface SentenceQuizWordInput {
  id: string;
  english: string;
  japanese: string;
  status: WordStatus;
}

/**
 * APIレスポンス
 */
export interface SentenceQuizResponse {
  questions: SentenceQuizQuestion[];
}

// ============ Enhanced Sentence Quiz Types (VectorDB) ============

/**
 * 空欄のソース情報
 * - target: 指定された学習単語
 * - vector-matched: VectorDB検索でマッチした過去学習単語
 * - llm-predicted: LLMが予測した単語（VectorDBでマッチなし）
 * - grammar: 前置詞、副詞、冠詞などの文法要素
 */
export type BlankSource = 'target' | 'vector-matched' | 'llm-predicted' | 'grammar';

/**
 * 拡張版空欄情報（ソース追跡付き）
 */
export interface EnhancedBlankSlot {
  index: number;           // 文中の空欄番号（0, 1, 2...）
  correctAnswer: string;   // 正解
  options: string[];       // 4択（正解含む、シャッフル済み）
  source: BlankSource;     // この空欄の出典
  sourceWordId?: string;   // VectorDB検索でマッチした場合の元wordId
  sourceJapanese?: string; // マッチした単語の日本語訳（復習用表示）
}

/**
 * 複数空欄穴埋め問題（VectorDB統合版）
 */
export interface MultiFillInBlankQuestion {
  type: 'multi-fill-in-blank';
  wordId: string;            // 主となる学習単語ID
  targetWord: string;        // 学習対象の単語
  sentence: string;          // 空欄付き文（"I ___ to the ___ every ___."）
  blanks: EnhancedBlankSlot[]; // 最低3つの空欄情報
  japaneseMeaning: string;   // 日本語訳
  relatedWordIds: string[];  // VectorDB検索で使用された単語ID一覧
}

/**
 * VectorDB検索結果
 */
export interface VectorSearchResult {
  id: string;
  projectId: string;
  english: string;
  japanese: string;
  similarity: number;
}

/**
 * LLMの空欄予測情報
 */
export interface BlankPrediction {
  position: number;                              // 文中の位置（0, 1, 2...）
  word: string;                                  // 予測された単語
  type: 'target' | 'content' | 'grammar';        // 空欄タイプ
  contextHint?: string;                          // 文脈ヒント（「場所」「時間」など）
}

/**
 * AIから返される複数空欄問題データ（Phase 1）
 */
export interface AIMultiBlankResponse {
  sentence: string;          // 空欄付き文
  blanks: BlankPrediction[]; // 各空欄の予測情報
  japaneseMeaning: string;   // 日本語訳
}

/**
 * 例文クイズの問題（穴埋め、複数空欄穴埋め、または並び替え）
 */
export type EnhancedSentenceQuizQuestion =
  | FillInBlankQuestion
  | MultiFillInBlankQuestion
  | WordOrderQuestion;
