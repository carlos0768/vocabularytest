import { mergeLexiconEntries } from '../../../shared/lexicon';
import { mergeSourceLabels } from '../../../shared/source-labels';
import type { ScanConfirmResultPayload } from '@/lib/scan/scan-session-storage';
import type { LexiconEntry } from '@/types';

export interface ProjectScanResultAccumulator {
  words: unknown[];
  sourceLabels: string[];
  lexiconEntries: LexiconEntry[];
}

export interface ProjectScanResultInput {
  words?: unknown[] | null;
  sourceLabels?: Iterable<unknown> | null;
  lexiconEntries?: LexiconEntry[] | null;
}

export function createProjectScanResultAccumulator(): ProjectScanResultAccumulator {
  return {
    words: [],
    sourceLabels: [],
    lexiconEntries: [],
  };
}

export function addProjectScanResult(
  accumulator: ProjectScanResultAccumulator,
  result: ProjectScanResultInput,
): ProjectScanResultAccumulator {
  return {
    words: [...accumulator.words, ...(Array.isArray(result.words) ? result.words : [])],
    sourceLabels: mergeSourceLabels(accumulator.sourceLabels, result.sourceLabels),
    lexiconEntries: mergeLexiconEntries(accumulator.lexiconEntries, result.lexiconEntries),
  };
}

export function hasNoProjectScanWords(accumulator: ProjectScanResultAccumulator): boolean {
  return accumulator.words.length === 0;
}

export function buildProjectScanConfirmResultPayload(
  accumulator: ProjectScanResultAccumulator,
): ScanConfirmResultPayload {
  return {
    words: accumulator.words,
    sourceLabels: accumulator.sourceLabels,
    lexiconEntries: accumulator.lexiconEntries,
  };
}
