import test from 'node:test';
import assert from 'node:assert/strict';

import { buildServerCloudScanJobResultPayload } from '@/lib/scan/server-cloud-result-payload';
import type { ExampleGenerationSummary } from '@/lib/ai/generate-example-sentences';

function exampleGenerationSummary(overrides: Partial<ExampleGenerationSummary>): ExampleGenerationSummary {
  return {
    requested: 1,
    generated: 1,
    failed: 0,
    retried: 0,
    retryRecovered: 0,
    failureKinds: {
      provider: 0,
      parse: 0,
      validation: 0,
      empty: 0,
    },
    ...overrides,
  };
}

test('buildServerCloudScanJobResultPayload fixes base completed result fields', () => {
  const payload = buildServerCloudScanJobResultPayload({
    wordCount: 2,
    targetProjectId: 'project-1',
    sourceLabels: ['鉄壁', 'ノート'],
  });

  assert.deepEqual(payload, {
    wordCount: 2,
    saveMode: 'server_cloud',
    targetProjectId: 'project-1',
    sourceLabels: ['鉄壁', 'ノート'],
  });
  assert.equal('warnings' in payload, false);
  assert.equal('exampleGeneration' in payload, false);
  assert.equal('quizPrefillRequested' in payload, false);
  assert.equal('quizPrefillSucceeded' in payload, false);
  assert.equal('quizPrefillFailed' in payload, false);
});

test('buildServerCloudScanJobResultPayload preserves explicit warnings', () => {
  const payload = buildServerCloudScanJobResultPayload({
    wordCount: 1,
    targetProjectId: 'project-1',
    sourceLabels: ['鉄壁'],
    warnings: new Set(['grammar_not_found']),
  });

  assert.deepEqual(payload.warnings, ['grammar_not_found']);
  assert.equal('exampleGeneration' in payload, false);
});

test('buildServerCloudScanJobResultPayload includes successful example summary without warning', () => {
  const summary = exampleGenerationSummary({
    requested: 2,
    generated: 2,
    failed: 0,
  });

  const payload = buildServerCloudScanJobResultPayload({
    wordCount: 2,
    targetProjectId: 'project-1',
    sourceLabels: ['鉄壁'],
    exampleGeneration: summary,
  });

  assert.deepEqual(payload.exampleGeneration, summary);
  assert.equal('warnings' in payload, false);
});

test('buildServerCloudScanJobResultPayload appends partial example-generation warning', () => {
  const summary = exampleGenerationSummary({
    requested: 3,
    generated: 2,
    failed: 1,
    failureKinds: {
      provider: 0,
      parse: 1,
      validation: 0,
      empty: 0,
    },
  });

  const payload = buildServerCloudScanJobResultPayload({
    wordCount: 3,
    targetProjectId: 'project-1',
    sourceLabels: ['鉄壁'],
    warnings: ['grammar_not_found'],
    exampleGeneration: summary,
  });

  assert.deepEqual(payload.warnings, [
    'grammar_not_found',
    'example_generation_partial_failure',
  ]);
  assert.deepEqual(payload.exampleGeneration, summary);
});

test('buildServerCloudScanJobResultPayload appends total example-generation failure warning', () => {
  const summary = exampleGenerationSummary({
    requested: 2,
    generated: 0,
    failed: 2,
    failureKinds: {
      provider: 0,
      parse: 2,
      validation: 0,
      empty: 0,
    },
  });

  const payload = buildServerCloudScanJobResultPayload({
    wordCount: 2,
    targetProjectId: 'project-1',
    sourceLabels: ['鉄壁'],
    exampleGeneration: summary,
  });

  assert.deepEqual(payload.warnings, ['example_generation_failed']);
  assert.deepEqual(payload.exampleGeneration, summary);
});

test('buildServerCloudScanJobResultPayload includes quiz prefill result fields when provided', () => {
  const payload = buildServerCloudScanJobResultPayload({
    wordCount: 4,
    targetProjectId: 'project-1',
    sourceLabels: ['鉄壁'],
    quizPrefill: {
      requested: 4,
      succeeded: 3,
      failed: 1,
    },
  });

  assert.equal(payload.quizPrefillRequested, 4);
  assert.equal(payload.quizPrefillSucceeded, 3);
  assert.equal(payload.quizPrefillFailed, 1);
  assert.equal('warnings' in payload, false);
  assert.equal('exampleGeneration' in payload, false);
});
