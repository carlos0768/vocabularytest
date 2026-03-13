import type { LexiconPos } from '../../../shared/lexicon';

export interface ValidatedTranslationCandidate {
  useHint: boolean;
  normalizedJapanese?: string | null;
  suggestedJapanese?: string | null;
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
  resolverElapsedMs: number;
}

export type LexiconEnrichmentJobSource = 'scan' | 'manual';
