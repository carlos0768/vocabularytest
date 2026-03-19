import test from 'node:test';
import assert from 'node:assert/strict';

import { __internal } from '@/app/api/scan-jobs/process/route';
import type { ExtractMode } from '@/app/api/extract/route';
import { AI_CONFIG } from '@/lib/ai/config';

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
    extractHighlightedWordsFromImage: async () => successWords,
    extractEikenWordsFromImage: async () => ({
      success: true,
      extractedText: 'mock ocr',
      data: successWords.data,
    }),
    extractIdiomsFromImage: async () => successWords,
    extractWrongAnswersFromImage: async () => ({
      success: true,
      ocrData: {
        testType: 'mixed',
        questions: [],
        totalQuestions: 0,
        detectedCorrectCount: 0,
        detectedWrongCount: 1,
        notes: 'mock',
      },
      data: successWords.data,
      summary: {
        totalWrong: 1,
        testType: 'mixed',
      },
    }),
  };

  const modes: ExtractMode[] = ['all', 'circled', 'highlighted', 'eiken', 'idiom', 'wrong'];

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

test('scan-jobs highlighted mode resolves provider from highlighted config', () => {
  const providers = __internal.getProvidersForMode('highlighted');
  assert.deepEqual(providers, [AI_CONFIG.extraction.highlighted.provider]);
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
