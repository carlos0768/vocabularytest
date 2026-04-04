import test from 'node:test';
import assert from 'node:assert/strict';

import { __internal } from '@/app/api/scan-jobs/process/route';
import type { ExtractMode } from '@/app/api/extract/route';
import { AI_CONFIG } from '@/lib/ai/config';
import type { ExampleGenerationSummary } from '@/lib/ai/generate-example-sentences';

const successWords = {
  success: true as const,
  data: {
    words: [
      {
        english: 'apple',
        japanese: 'りんご',
        japaneseSource: 'scan',
        distractors: ['ばなな', 'ぶどう', 'もも'],
        partOfSpeechTags: ['noun'],
        exampleSentence: undefined,
        exampleSentenceJa: undefined,
      },
    ],
    sourceLabels: ['鉄壁'],
  },
};

test('extractFromImage succeeds for all scan modes with mocked handlers', async () => {
  type Handlers = Parameters<typeof __internal.extractFromImage>[4];

  const handlers: Handlers = {
    extractWordsFromImage: async () => successWords,
    extractCircledWordsFromImage: async () => successWords,
    extractEikenWordsFromImage: async () => ({
      success: true,
      extractedText: 'mock ocr',
      data: successWords.data,
    }),
    extractIdiomsFromImage: async () => successWords,
  };

  const modes: ExtractMode[] = ['all', 'circled', 'eiken', 'idiom'];

  for (const mode of modes) {
    const eikenLevel = mode === 'eiken' ? '3' : null;
    const { result } = await __internal.extractFromImage(
      'data:image/png;base64,ZmFrZQ==',
      mode,
      eikenLevel,
      { gemini: 'test-key' },
      handlers
    );

    assert.equal(result.success, true, `mode=${mode}`);
    if (result.success) {
      assert.deepEqual(result.data.sourceLabels, ['鉄壁'], `mode=${mode}`);
      assert.equal((result.data.words[0] as { japaneseSource?: string } | undefined)?.japaneseSource, 'scan', `mode=${mode}`);
    }
  }
});

test('scan-jobs idiom mode resolves provider from idioms config', () => {
  const providers = __internal.getProvidersForMode('idiom');
  assert.deepEqual(providers, [AI_CONFIG.extraction.idioms.provider]);
});

test('scan-jobs parser preserves japaneseSource and prefers scan during dedupe', () => {
  const parsed = __internal.parseExtractedWords([
    {
      english: 'experiment',
      japanese: '実験',
      japaneseSource: 'ai',
      distractors: [],
      partOfSpeechTags: ['noun'],
    },
    {
      english: 'experiment',
      japanese: '実験',
      japaneseSource: 'scan',
      distractors: ['試験'],
      partOfSpeechTags: ['noun'],
    },
  ]);

  const deduped = __internal.dedupeExtractedWords(parsed);

  assert.equal(deduped.length, 1);
  assert.equal(deduped[0]?.japaneseSource, 'scan');
});

test('scan-jobs marks partial example generation with warning and payload summary', () => {
  const summary: ExampleGenerationSummary = {
    requested: 5,
    generated: 3,
    failed: 2,
    retried: 2,
    retryRecovered: 0,
    failureKinds: {
      provider: 0,
      parse: 1,
      validation: 1,
      empty: 0,
    },
  };

  const warningSet = new Set<string>();
  const payload = __internal.applyExampleGenerationSummary(
    { saveMode: 'server_cloud' as const, wordCount: 5 },
    warningSet,
    summary,
  );

  assert.equal(__internal.getExampleGenerationWarning(summary), 'example_generation_partial_failure');
  assert.deepEqual(payload.exampleGeneration, summary);
  assert.deepEqual(Array.from(warningSet), ['example_generation_partial_failure']);
});

test('scan-jobs marks total example generation failure with failed warning', () => {
  const summary = __internal.buildFailedExampleGenerationSummary(4, 'parse');

  assert.equal(summary.failed, 4);
  assert.equal(summary.failureKinds.parse, 4);
  assert.equal(__internal.getExampleGenerationWarning(summary), 'example_generation_failed');
});
