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

test('extractHighlightedWordsFromImage recovers underline candidate without markBoundingBox via relaxed fallback', async () => {
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

  assert.equal(generateCalls, 2);
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.words.length, 1);
    assert.equal(result.data.words[0].english, 'inspect');
  }
});

test('extractHighlightedWordsFromImage keeps strict candidates when verification returns empty', async () => {
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
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.words.length, 1);
    assert.equal(result.data.words[0].english, 'concede');
  }
});

test('extractHighlightedWordsFromImage rejects highlight candidate when mark box does not overlap word', async () => {
  let generateCalls = 0;

  const provider = createProvider(async () => {
    generateCalls += 1;

    if (generateCalls === 1) {
      return {
        success: true,
        content: JSON.stringify({
          words: [
            {
              english: 'valid-underline',
              japanese: '有効',
              confidence: 0.95,
              markType: 'underline',
              isHandDrawn: true,
              markerColor: 'blue',
              wordBoundingBox: { y_min: 200, x_min: 100, y_max: 260, x_max: 300 },
              markBoundingBox: { y_min: 250, x_min: 120, y_max: 280, x_max: 280 },
            },
            {
              english: 'false-highlight',
              japanese: '誤検出',
              confidence: 0.95,
              markType: 'highlight',
              isHandDrawn: true,
              markerColor: 'yellow',
              wordBoundingBox: { y_min: 300, x_min: 100, y_max: 360, x_max: 240 },
              markBoundingBox: { y_min: 500, x_min: 500, y_max: 560, x_max: 640 },
            },
          ],
        }),
      };
    }

    return {
      success: true,
      content: JSON.stringify({
        words: [
          { english: 'valid-underline', japanese: '有効' },
          { english: 'false-highlight', japanese: '誤検出' },
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

  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.words.length, 1);
    assert.equal(result.data.words[0].english, 'valid-underline');
  }
});

test('extractHighlightedWordsFromImage keeps strict candidates when verification is overly aggressive', async () => {
  let generateCalls = 0;

  const provider = createProvider(async () => {
    generateCalls += 1;

    if (generateCalls === 1) {
      return {
        success: true,
        content: JSON.stringify({
          words: [
            {
              english: 'underline-word',
              japanese: '下線語',
              confidence: 0.95,
              markType: 'underline',
              isHandDrawn: true,
              markerColor: 'blue',
              wordBoundingBox: { y_min: 210, x_min: 120, y_max: 270, x_max: 320 },
              markBoundingBox: { y_min: 260, x_min: 130, y_max: 285, x_max: 310 },
            },
            {
              english: 'highlight-word',
              japanese: 'マーカー語',
              confidence: 0.95,
              markType: 'highlight',
              isHandDrawn: true,
              markerColor: 'yellow',
              wordBoundingBox: { y_min: 340, x_min: 150, y_max: 390, x_max: 320 },
              markBoundingBox: { y_min: 338, x_min: 145, y_max: 392, x_max: 326 },
            },
          ],
        }),
      };
    }

    return {
      success: true,
      content: JSON.stringify({
        words: [],
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

  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.words.length, 2);
    assert.equal(result.data.words[0].english, 'underline-word');
  }
});

test('extractHighlightedWordsFromImage uses relaxed fallback when strict candidates are empty', async () => {
  let generateCalls = 0;

  const provider = createProvider(async () => {
    generateCalls += 1;

    if (generateCalls === 1) {
      return {
        success: true,
        content: JSON.stringify({
          words: [
            {
              english: 'recoverable-word',
              japanese: '救済語',
              confidence: 0.92,
              markType: 'underline',
              markerColor: 'blue',
              // bbox intentionally omitted to simulate model omissions
            },
          ],
        }),
      };
    }

    return {
      success: true,
      content: JSON.stringify({
        words: [{ english: 'recoverable-word', japanese: '救済語' }],
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

  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.words.length, 1);
    assert.equal(result.data.words[0].english, 'recoverable-word');
  }
});
