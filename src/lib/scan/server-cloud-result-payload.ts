import type { ExampleGenerationSummary } from '@/lib/ai/generate-example-sentences';
import { getExampleGenerationWarning } from '@/lib/scan/job-result-payload';

export interface ServerCloudQuizPrefillResult {
  requested: number;
  succeeded: number;
  failed: number;
}

export interface ServerCloudScanJobResultPayload {
  wordCount: number;
  warnings?: string[];
  saveMode: 'server_cloud';
  targetProjectId: string;
  sourceLabels: string[];
  quizPrefillRequested?: number;
  quizPrefillSucceeded?: number;
  quizPrefillFailed?: number;
  exampleGeneration?: ExampleGenerationSummary;
}

export function buildServerCloudScanJobResultPayload(params: {
  wordCount: number;
  targetProjectId: string;
  sourceLabels: string[];
  warnings?: Iterable<string>;
  exampleGeneration?: ExampleGenerationSummary;
  quizPrefill?: ServerCloudQuizPrefillResult;
}): ServerCloudScanJobResultPayload {
  const warningSet = new Set(params.warnings ?? []);
  const payload: ServerCloudScanJobResultPayload = {
    wordCount: params.wordCount,
    saveMode: 'server_cloud',
    targetProjectId: params.targetProjectId,
    sourceLabels: params.sourceLabels,
  };

  if (params.exampleGeneration) {
    payload.exampleGeneration = params.exampleGeneration;
    const warning = getExampleGenerationWarning(params.exampleGeneration);
    if (warning) {
      warningSet.add(warning);
    }
  }

  if (params.quizPrefill) {
    payload.quizPrefillRequested = params.quizPrefill.requested;
    payload.quizPrefillSucceeded = params.quizPrefill.succeeded;
    payload.quizPrefillFailed = params.quizPrefill.failed;
  }

  if (warningSet.size > 0) {
    payload.warnings = Array.from(warningSet);
  }

  return payload;
}
