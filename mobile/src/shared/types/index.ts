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

export interface Word {
  id: string;
  projectId: string;
  english: string;
  japanese: string;
  japaneseSource?: 'scan' | 'ai';
  lexiconEntryId?: string;
  cefrLevel?: string;
  distractors: string[];
  exampleSentence?: string;
  exampleSentenceJa?: string;
  pronunciation?: string;
  status: WordStatus;
  createdAt: string;
  lastReviewedAt?: string;
  nextReviewAt?: string;
  easeFactor: number;
  intervalDays: number;
  repetition: number;
  isFavorite: boolean;
  vocabularyType?: VocabularyType;
  partOfSpeechTags?: string[];
  relatedWords?: RelatedWord[];
  usagePatterns?: UsagePattern[];
  insightsGeneratedAt?: string;
  insightsVersion?: number;
}

export interface Project {
  id: string;
  userId: string;
  title: string;
  sourceLabels: string[];
  iconImage?: string;
  createdAt: string;
  isSynced?: boolean;
  shareId?: string;
  shareScope?: ProjectShareScope;
  importedFromShareId?: string;
  isFavorite?: boolean;
}

export interface AIWordExtraction {
  english: string;
  japanese: string;
  japaneseSource?: 'scan' | 'ai';
  lexiconEntryId?: string;
  cefrLevel?: string;
  distractors: string[];
  partOfSpeechTags?: string[];
  exampleSentence?: string;
  exampleSentenceJa?: string;
}

export interface AIResponse {
  words: AIWordExtraction[];
}

export interface QuizQuestion {
  word: Word;
  options: string[];
  correctIndex: number;
}

export interface QuizResult {
  wordId: string;
  isCorrect: boolean;
  selectedIndex: number;
}

export interface WordRepository {
  createProject(
    project: Omit<Project, 'id' | 'createdAt' | 'sourceLabels'> & { sourceLabels?: string[] }
  ): Promise<Project>;
  getProjects(userId: string): Promise<Project[]>;
  getProject(id: string): Promise<Project | undefined>;
  updateProject(id: string, updates: Partial<Project>): Promise<void>;
  deleteProject(id: string): Promise<void>;
  createWords(
    words: Omit<
      Word,
      | 'id'
      | 'createdAt'
      | 'easeFactor'
      | 'intervalDays'
      | 'repetition'
      | 'isFavorite'
      | 'lastReviewedAt'
      | 'nextReviewAt'
      | 'status'
    >[]
  ): Promise<Word[]>;
  getWords(projectId: string): Promise<Word[]>;
  getWord(id: string): Promise<Word | undefined>;
  updateWord(id: string, updates: Partial<Word>): Promise<void>;
  deleteWord(id: string): Promise<void>;
  deleteWordsByProject(projectId: string): Promise<void>;
}

export interface ProgressStep {
  id: string;
  label: string;
  status: 'pending' | 'active' | 'complete' | 'error';
}

export interface ScanProgress {
  step: 'uploading' | 'analyzing' | 'generating' | 'complete' | 'error';
  message: string;
}

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

export interface AuthUser {
  id: string;
  email: string;
  username?: string | null;
  subscription?: Subscription;
}

export interface UserState {
  id: string;
  email: string;
  subscriptionStatus: SubscriptionStatus;
  subscriptionPlan: SubscriptionPlan;
  dailyScanCount: number;
  lastScanDate: string;
}

export type EikenGrammarLevel = '5' | '4' | '3' | 'pre2' | '2' | 'pre1' | '1' | null;

export interface GrammarPattern {
  id: string;
  projectId: string;
  patternName: string;
  patternNameEn: string;
  originalSentence: string;
  explanation: string;
  structure: string;
  example: string;
  exampleJa: string;
  level: EikenGrammarLevel;
  createdAt: string;
}

export interface GrammarQuizQuestion {
  id: string;
  patternId: string;
  questionType: 'fill_blank' | 'choice' | 'reorder';
  question: string;
  questionJa?: string;
  correctAnswer: string;
  options?: string[];
  explanation: string;
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
  extractedText: string;
  grammarPatterns: AIGrammarExtraction[];
}

export type SentenceQuestionType = 'fill-in-blank' | 'word-order' | 'multi-fill-in-blank';

export interface BlankSlot {
  index: number;
  correctAnswer: string;
  options: string[];
}

export interface EnhancedBlankSlot extends BlankSlot {
  source: 'target' | 'vector-matched' | 'llm-predicted' | 'grammar';
  sourceWordId?: string;
  sourceJapanese?: string;
}

export interface FillInBlankQuestion {
  type: 'fill-in-blank';
  wordId: string;
  targetWord: string;
  sentence: string;
  blanks: BlankSlot[];
  japaneseMeaning: string;
}

export interface WordOrderQuestion {
  type: 'word-order';
  wordId: string;
  targetWord: string;
  shuffledWords: string[];
  correctOrder: string[];
  japaneseMeaning: string;
}

export interface MultiFillInBlankQuestion {
  type: 'multi-fill-in-blank';
  wordId: string;
  targetWord: string;
  sentence: string;
  blanks: EnhancedBlankSlot[];
  japaneseMeaning: string;
  relatedWordIds: string[];
}

export type SentenceQuizQuestion =
  | FillInBlankQuestion
  | WordOrderQuestion
  | MultiFillInBlankQuestion;
