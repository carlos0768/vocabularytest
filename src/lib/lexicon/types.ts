import type { LexiconPos } from '../../../shared/lexicon';

export interface ValidatedTranslationCandidate {
  useHint: boolean;
  normalizedJapanese?: string | null;
  suggestedJapanese?: string | null;
}

/** AI訳生成の1つの意味（多義語対応）。 */
export interface TranslatedSense {
  japanese: string;
  meaningSummary: string | null;
  /** 語義識別キー。非primary語義に付与すると、その語義が個別のクイズ対象になる。 */
  distinctKey?: string | null;
  /** その語義単体のCEFRレベル（A1〜C2）。英検レベルでの出題フィルタに使う。 */
  cefrLevel?: string | null;
  isPrimary: boolean;
}

export interface PendingLexiconEnrichmentCandidate {
  lexiconEntryId: string;
  english: string;
  pos: LexiconPos;
  japaneseHint: string;
}

export interface LexiconResolveMetrics {
  syncTranslationCount: number;
  queuedHintValidationCount: number;
  posInferredCount: number;
  olpReusedCount: number;
  runtimeCreatedCount: number;
  resolverElapsedMs: number;
}

export type LexiconEnrichmentJobSource = 'scan' | 'manual';
