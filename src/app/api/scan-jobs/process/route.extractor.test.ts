import test from 'node:test';
import assert from 'node:assert/strict';

import { __internal } from '@/app/api/scan-jobs/process/route';
import { getProvidersForMode, type ExtractMode } from '@/lib/scan/mode-provider';
import { AI_CONFIG } from '@/lib/ai/config';
import type { ExampleGenerationSummary } from '@/lib/ai/generate-example-sentences';

const successWords = {
  success: true as const,
  data: {
    words: [
      {
        english: 'apple',
        japanese: 'りんご',
        japaneseSource: 'scan' as const,
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
    extractCompositeWordsFromImage: async () => successWords,
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
      assert.deepEqual((result.data.words[0] as { sourceModes?: string[] } | undefined)?.sourceModes, [mode], `mode=${mode}`);
    }
  }
});

test('extractFromImage uses one composite extraction call for multiple modes', async () => {
  type Handlers = Parameters<typeof __internal.extractFromImage>[4];
  const calls: string[] = [];

  const handlers: Handlers = {
    extractWordsFromImage: async () => {
      calls.push('extractWordsFromImage');
      return successWords;
    },
    extractCircledWordsFromImage: async () => {
      calls.push('extractCircledWordsFromImage');
      return successWords;
    },
    extractEikenWordsFromImage: async () => {
      calls.push('extractEikenWordsFromImage');
      return {
        success: true,
        extractedText: 'mock ocr',
        data: successWords.data,
      };
    },
    extractIdiomsFromImage: async () => {
      calls.push('extractIdiomsFromImage');
      return successWords;
    },
    extractCompositeWordsFromImage: async (_image, _apiKeys, options) => {
      calls.push(`extractCompositeWordsFromImage:${options.modes.join(',')}:${options.eikenLevel ?? ''}`);
      return {
        success: true,
        data: {
          words: [
            {
              english: 'look forward to',
              japanese: '楽しみに待つ',
              japaneseSource: 'scan' as const,
              sourceModes: ['idiom'],
              distractors: [],
              partOfSpeechTags: ['idiom'],
            },
          ],
          sourceLabels: ['鉄壁'],
        },
      };
    },
  };

  const { result } = await __internal.extractFromImage(
    'data:image/png;base64,ZmFrZQ==',
    ['all', 'idiom', 'eiken'],
    '2',
    { gemini: 'test-key' },
    handlers,
  );

  assert.deepEqual(calls, ['extractCompositeWordsFromImage:all,idiom,eiken:2']);
  assert.equal(result.success, true);
  if (result.success) {
    assert.deepEqual((result.data.words[0] as { sourceModes?: string[] }).sourceModes, ['all', 'idiom', 'eiken']);
  }
});

test('scan-jobs idiom mode resolves provider from idioms config', () => {
  const providers = getProvidersForMode('idiom');
  assert.deepEqual(providers, [AI_CONFIG.extraction.idioms.provider]);
});

test('scan-jobs parser preserves japaneseSource and prefers scan during dedupe', () => {
  const parsed = __internal.parseExtractedWords([
    {
      english: 'experiment',
      japanese: '実験',
      japaneseSource: 'ai',
      sourceModes: ['all'],
      distractors: [],
      partOfSpeechTags: ['noun'],
    },
    {
      english: 'experiment',
      japanese: '実験',
      japaneseSource: 'scan',
      sourceModes: ['circled'],
      distractors: ['試験'],
      partOfSpeechTags: ['noun'],
    },
  ]);

  const deduped = __internal.dedupeExtractedWords(parsed, ['all', 'idiom', 'eiken']);

  assert.equal(deduped.length, 1);
  assert.equal(deduped[0]?.japaneseSource, 'scan');
  assert.deepEqual(deduped[0]?.sourceModes, ['all', 'idiom', 'eiken']);
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
  const payloadBase: {
    saveMode: 'server_cloud';
    wordCount: number;
    exampleGeneration?: ExampleGenerationSummary;
  } = { saveMode: 'server_cloud', wordCount: 5 };
  const payload = __internal.applyExampleGenerationSummary(
    payloadBase,
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
