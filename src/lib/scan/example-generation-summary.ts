// スキャン後の例文生成の結果集計・警告・ログ。
import type { ScanJobProcessSaveMode } from '@/lib/scan/job-processing-input';
import type {
  ExampleGenerationFailureKind,
  ExampleGenerationSummary,
} from '@/lib/ai/generate-example-sentences';

export type ExtractionWarningCode =
  | 'grammar_not_found'
  | 'example_generation_partial_failure'
  | 'example_generation_failed';

type ScanJobSaveMode = ScanJobProcessSaveMode;

function createExampleGenerationFailureKinds(): Record<ExampleGenerationFailureKind, number> {
  return {
    provider: 0,
    parse: 0,
    validation: 0,
    empty: 0,
  };
}

export function buildFailedExampleGenerationSummary(
  requested: number,
  kind: ExampleGenerationFailureKind = 'provider',
): ExampleGenerationSummary {
  const failureKinds = createExampleGenerationFailureKinds();
  failureKinds[kind] = requested;

  return {
    requested,
    generated: 0,
    failed: requested,
    retried: 0,
    retryRecovered: 0,
    failureKinds,
  };
}

export function getExampleGenerationWarning(
  summary?: ExampleGenerationSummary,
): ExtractionWarningCode | null {
  if (!summary || summary.failed === 0) {
    return null;
  }

  return summary.generated === 0
    ? 'example_generation_failed'
    : 'example_generation_partial_failure';
}

export function applyExampleGenerationSummary<T extends { exampleGeneration?: ExampleGenerationSummary }>(
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

export function classifyUnexpectedExampleGenerationFailure(
  error: unknown,
): ExampleGenerationFailureKind {
  const message = error instanceof Error ? error.message : String(error ?? '');

  if (message.includes('AI generation failed')) return 'provider';
  if (message.includes('Empty example sentence')) return 'empty';
  if (message.includes('parse') || message.includes('JSON')) return 'parse';
  return 'validation';
}

export function logExampleGenerationOutcome(params: {
  jobId: string;
  saveMode: ScanJobSaveMode;
  summary: ExampleGenerationSummary;
  errors: string[];
  elapsedMs: number;
}) {
  const { jobId, saveMode, summary, errors, elapsedMs } = params;
  console.log('[scan-jobs/process] Example generation completed', {
    jobId,
    saveMode,
    requested: summary.requested,
    generated: summary.generated,
    failed: summary.failed,
    retried: summary.retried,
    retryRecovered: summary.retryRecovered,
    failureKinds: summary.failureKinds,
    elapsedMs,
  });

  if (errors.length > 0) {
    console.warn('[scan-jobs/process] Example generation terminal errors', {
      jobId,
      saveMode,
      errors,
    });
  }
}
