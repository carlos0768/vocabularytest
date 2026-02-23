import test from 'node:test';
import assert from 'node:assert/strict';

import { extractHighlightedWordsFromImage } from '@/lib/ai/extract-highlighted-words';
import type { AIProvider } from '@/lib/ai/providers';

function createProvider(generate: AIProvider['generate']): AIProvider {
  return {
    name: 'mock-provider',
    generate,
    generateText: async () => ({ success: false, error: 'not used in tests' }),
  };
}

test('extractHighlightedWordsFromImage keeps only strict underline candidates and intersects verification output', async () => {
  let generateCalls = 0;

  const provider = createProvider(async () => {
    generateCalls += 1;

    if (generateCalls === 1) {
      return {
        success: true,
        content: JSON.stringify({
          words: [
            {
              english: 'prospective',
              japanese: '見込みのある',
              confidence: 0.95,
              markType: 'underline',
              isHandDrawn: true,
              markerColor: 'blue',
              wordBoundingBox: { y_min: 200, x_min: 100, y_max: 260, x_max: 300 },
              markBoundingBox: { y_min: 250, x_min: 120, y_max: 280, x_max: 280 },
            },
            {
              english: 'wrong-below-line',
              japanese: '下行',
              confidence: 0.95,
              markType: 'underline',
              isHandDrawn: true,
              markerColor: 'blue',
              wordBoundingBox: { y_min: 200, x_min: 350, y_max: 260, x_max: 520 },
              markBoundingBox: { y_min: 360, x_min: 350, y_max: 380, x_max: 520 },
            },
            {
              english: 'not-hand-drawn',
              japanese: '印刷',
              confidence: 0.95,
              markType: 'highlight',
              isHandDrawn: false,
              markerColor: 'red',
            },
            {
              english: 'missing-mark-bbox',
              japanese: 'bboxなし',
              confidence: 0.95,
              markType: 'underline',
              isHandDrawn: true,
              markerColor: 'blue',
              wordBoundingBox: { y_min: 400, x_min: 100, y_max: 460, x_max: 260 },
            },
            {
              english: 'low-confidence',
              japanese: '信頼度低',
              confidence: 0.79,
              markType: 'highlight',
              isHandDrawn: true,
              markerColor: 'yellow',
            },
          ],
        }),
      };
    }

    return {
      success: true,
      content: JSON.stringify({
        words: [
          { english: 'prospective', japanese: '見込みのある' },
          { english: 'new-word-not-in-candidates', japanese: '追加禁止' },
        ],
      }),
    };
  });

  const result = await extractHighlightedWordsFromImage(
    'data:image/png;base64,ZmFrZQ==',
    { gemini: 'test-key' },
    {
      dependencies: {
        getProviderFromConfig: () => provider,
      },
    }
  );

  assert.equal(generateCalls, 2);
  assert.equal(result.success, true);

  if (result.success) {
    assert.equal(result.data.words.length, 1);
    assert.equal(result.data.words[0].english, 'prospective');
  }
});

test('extractHighlightedWordsFromImage rejects underline candidate without markBoundingBox', async () => {
  let generateCalls = 0;

  const provider = createProvider(async () => {
    generateCalls += 1;

    return {
      success: true,
      content: JSON.stringify({
        words: [
          {
            english: 'inspect',
            japanese: '調べる',
            confidence: 0.95,
            markType: 'underline',
            isHandDrawn: true,
            markerColor: 'blue',
            wordBoundingBox: { y_min: 300, x_min: 100, y_max: 360, x_max: 220 },
          },
        ],
      }),
    };
  });

  const result = await extractHighlightedWordsFromImage(
    'data:image/png;base64,ZmFrZQ==',
    { gemini: 'test-key' },
    {
      dependencies: {
        getProviderFromConfig: () => provider,
      },
    }
  );

  assert.equal(generateCalls, 1);
  assert.equal(result.success, false);
  if (!result.success) {
    assert.match(result.error, /厳密判定/);
  }
});

test('extractHighlightedWordsFromImage returns error when verification response adds no approved candidate', async () => {
  let generateCalls = 0;

  const provider = createProvider(async () => {
    generateCalls += 1;

    if (generateCalls === 1) {
      return {
        success: true,
        content: JSON.stringify({
          words: [
            {
              english: 'concede',
              japanese: '認める',
              confidence: 0.96,
              markType: 'underline',
              isHandDrawn: true,
              markerColor: 'blue',
              wordBoundingBox: { y_min: 500, x_min: 140, y_max: 560, x_max: 300 },
              markBoundingBox: { y_min: 550, x_min: 150, y_max: 580, x_max: 290 },
            },
          ],
        }),
      };
    }

    return {
      success: true,
      content: JSON.stringify({ words: [] }),
    };
  });

  const result = await extractHighlightedWordsFromImage(
    'data:image/png;base64,ZmFrZQ==',
    { gemini: 'test-key' },
    {
      dependencies: {
        getProviderFromConfig: () => provider,
      },
    }
  );

  assert.equal(generateCalls, 2);
  assert.equal(result.success, false);
  if (!result.success) {
    assert.match(result.error, /条件を満たす単語/);
  }
});
