// Types for WordSnap Web
// Re-exports shared types and adds web-specific types

// ============ Shared Types (from /shared/types) ============
// Import for local use
import type { AIWordExtraction as AIWordExtractionType } from '../../shared/types';

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

// ============ Scan Job Types (Background Processing) ============

export type ScanJobStatus = 'pending' | 'processing' | 'completed' | 'failed';
export type ScanMode = 'all' | 'circled' | 'eiken' | 'idiom' | 'highlighted';

export interface ScanJob {
  id: string;
  user_id: string;
  status: ScanJobStatus;
  scan_mode: ScanMode;
  eiken_level: string | null;
  project_id: string | null;
  project_title: string | null;
  image_path: string;
  result: AIWordExtractionType[] | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateScanJobRequest {
  image: string; // base64
  scanMode: ScanMode;
  eikenLevel?: string;
  projectId?: string; // 既存プロジェクトに追加する場合
  projectTitle?: string; // 新規プロジェクトの場合
}

export interface ScanJobResponse {
  success: boolean;
  jobId?: string;
  job?: ScanJob;
  error?: string;
}
