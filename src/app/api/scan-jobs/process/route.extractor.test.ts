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
        distractors: ['ばなな', 'ぶどう', 'もも'],
      },
    ],
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
  }
});

test('scan-jobs highlighted mode resolves provider from highlighted config', () => {
  const providers = __internal.getProvidersForMode('highlighted');
  assert.deepEqual(providers, [AI_CONFIG.extraction.highlighted.provider]);
});
