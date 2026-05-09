import { mergeLexiconEntries } from '../../../shared/lexicon';
import { mergeSourceLabels } from '../../../shared/source-labels';
import type { LexiconEntry } from '@/types';
import type { ScanConfirmResultPayload } from '@/lib/scan/scan-session-storage';

export interface HomeImmediateScanResultAccumulator {
  words: unknown[];
  sourceLabels: string[];
  lexiconEntries: LexiconEntry[];
}

export interface HomeImmediateScanResultInput {
  words?: unknown[] | null;
  sourceLabels?: Iterable<unknown> | null;
  lexiconEntries?: LexiconEntry[] | null;
}

export function createHomeImmediateScanResultAccumulator(): HomeImmediateScanResultAccumulator {
  return {
    words: [],
    sourceLabels: [],
    lexiconEntries: [],
  };
}

export function addHomeImmediateScanResult(
  accumulator: HomeImmediateScanResultAccumulator,
  result: HomeImmediateScanResultInput,
): HomeImmediateScanResultAccumulator {
  return {
    words: [...accumulator.words, ...(Array.isArray(result.words) ? result.words : [])],
    sourceLabels: mergeSourceLabels(accumulator.sourceLabels, result.sourceLabels),
    lexiconEntries: mergeLexiconEntries(accumulator.lexiconEntries, result.lexiconEntries),
  };
}

export function hasNoHomeImmediateScanWords(accumulator: HomeImmediateScanResultAccumulator): boolean {
  return accumulator.words.length === 0;
}

export function buildHomeImmediateScanConfirmResultPayload(
  accumulator: HomeImmediateScanResultAccumulator,
): ScanConfirmResultPayload {
  return {
    words: accumulator.words,
    sourceLabels: accumulator.sourceLabels,
    lexiconEntries: accumulator.lexiconEntries,
  };
}
