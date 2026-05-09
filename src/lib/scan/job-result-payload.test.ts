import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildClientLocalScanJobResultPayload,
  getExampleGenerationWarning,
} from '@/lib/scan/job-result-payload';
import type { ExampleGenerationSummary } from '@/lib/ai/generate-example-sentences';
import type { AIWordExtraction, LexiconEntry } from '@/types';

const extractedWords: AIWordExtraction[] = [
  {
    english: 'apple',
    japanese: 'りんご',
    japaneseSource: 'scan',
    distractors: ['ばなな', 'ぶどう', 'もも'],
    partOfSpeechTags: ['noun'],
  },
];

const lexiconEntries: LexiconEntry[] = [
  {
    id: 'lexicon-apple',
    headword: 'apple',
    normalizedHeadword: 'apple',
    pos: 'noun',
    datasetSources: ['鉄壁'],
    createdAt: '2026-05-07T00:00:00.000Z',
    updatedAt: '2026-05-07T00:00:00.000Z',
  },
];

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

test('buildClientLocalScanJobResultPayload omits optional fields when there are no warnings or example summary', () => {
  const payload = buildClientLocalScanJobResultPayload({
    extractedWords,
    sourceLabels: ['鉄壁'],
    lexiconEntries,
  });

  assert.deepEqual(payload, {
    wordCount: 1,
    saveMode: 'client_local',
    extractedWords,
    sourceLabels: ['鉄壁'],
    lexiconEntries,
  });
  assert.equal('warnings' in payload, false);
  assert.equal('exampleGeneration' in payload, false);
});

test('buildClientLocalScanJobResultPayload defaults lexiconEntries to an empty array', () => {
  const payload = buildClientLocalScanJobResultPayload({
    extractedWords,
    sourceLabels: ['ノート'],
  });

  assert.equal(payload.wordCount, 1);
  assert.deepEqual(payload.lexiconEntries, []);
  assert.equal('warnings' in payload, false);
});

test('buildClientLocalScanJobResultPayload preserves existing warnings without example warning', () => {
  const summary = exampleGenerationSummary({
    requested: 1,
    generated: 1,
    failed: 0,
  });

  const payload = buildClientLocalScanJobResultPayload({
    extractedWords,
    sourceLabels: ['鉄壁'],
    lexiconEntries,
    warnings: ['grammar_not_found'],
    exampleGeneration: summary,
  });

  assert.deepEqual(payload.warnings, ['grammar_not_found']);
  assert.deepEqual(payload.exampleGeneration, summary);
});

test('buildClientLocalScanJobResultPayload appends partial example-generation warning', () => {
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

  const payload = buildClientLocalScanJobResultPayload({
    extractedWords,
    sourceLabels: ['鉄壁'],
    lexiconEntries,
    warnings: new Set(['grammar_not_found']),
    exampleGeneration: summary,
  });

  assert.equal(getExampleGenerationWarning(summary), 'example_generation_partial_failure');
  assert.deepEqual(payload.warnings, [
    'grammar_not_found',
    'example_generation_partial_failure',
  ]);
  assert.deepEqual(payload.exampleGeneration, summary);
});

test('buildClientLocalScanJobResultPayload appends total example-generation failure warning', () => {
  const summary = exampleGenerationSummary({
    requested: 2,
    generated: 0,
    failed: 2,
    failureKinds: {
      provider: 2,
      parse: 0,
      validation: 0,
      empty: 0,
    },
  });

  const payload = buildClientLocalScanJobResultPayload({
    extractedWords,
    sourceLabels: ['鉄壁'],
    lexiconEntries,
    exampleGeneration: summary,
  });

  assert.equal(getExampleGenerationWarning(summary), 'example_generation_failed');
  assert.deepEqual(payload.warnings, ['example_generation_failed']);
  assert.deepEqual(payload.exampleGeneration, summary);
});
