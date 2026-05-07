import type { ExampleGenerationSummary } from '@/lib/ai/generate-example-sentences';
import type { AIWordExtraction, LexiconEntry } from '@/types';

export type ScanJobResultWarningCode =
  | 'grammar_not_found'
  | 'example_generation_partial_failure'
  | 'example_generation_failed';

export interface ClientLocalScanJobResultPayload {
  wordCount: number;
  warnings?: string[];
  saveMode: 'client_local';
  extractedWords: AIWordExtraction[];
  sourceLabels: string[];
  lexiconEntries: LexiconEntry[];
  exampleGeneration?: ExampleGenerationSummary;
}

export function getExampleGenerationWarning(
  summary?: ExampleGenerationSummary,
): ScanJobResultWarningCode | null {
  if (!summary || summary.failed === 0) {
    return null;
  }

  return summary.generated === 0
    ? 'example_generation_failed'
    : 'example_generation_partial_failure';
}

function applyExampleGenerationSummary<T extends { exampleGeneration?: ExampleGenerationSummary }>(
  payload: T,
  warningSet: Set<string>,
  summary?: ExampleGenerationSummary,
): T {
  if (!summary) {
    return payload;
  }

  payload.exampleGeneration = summary;
  const warning = getExampleGenerationWarning(summary);
  if (warning) {
    warningSet.add(warning);
  }

  return payload;
}

export function buildClientLocalScanJobResultPayload(params: {
  extractedWords: AIWordExtraction[];
  sourceLabels: string[];
  lexiconEntries?: LexiconEntry[];
  warnings?: Iterable<string>;
  exampleGeneration?: ExampleGenerationSummary;
}): ClientLocalScanJobResultPayload {
  const warningSet = new Set(params.warnings ?? []);
  const payload: ClientLocalScanJobResultPayload = {
    wordCount: params.extractedWords.length,
    saveMode: 'client_local',
    extractedWords: params.extractedWords,
    sourceLabels: params.sourceLabels,
    lexiconEntries: params.lexiconEntries ?? [],
  };

  applyExampleGenerationSummary(payload, warningSet, params.exampleGeneration);
  if (warningSet.size > 0) {
    payload.warnings = Array.from(warningSet);
  }

  return payload;
}
