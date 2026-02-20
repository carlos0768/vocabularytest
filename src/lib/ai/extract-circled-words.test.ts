import test from 'node:test';
import assert from 'node:assert/strict';

import { extractCircledWordsFromImage } from '@/lib/ai/extract-circled-words';
import type { AIProvider } from '@/lib/ai/providers';

function createProvider(generate: AIProvider['generate']): AIProvider {
  return {
    name: 'mock-provider',
    generate,
    generateText: async () => ({ success: false, error: 'not used in tests' }),
  };
}

function buildWords(count: number): Array<{ english: string; japanese: string }> {
  return Array.from({ length: count }, (_, index) => ({
    english: `word-${index + 1}`,
    japanese: `意味-${index + 1}`,
  }));
}

test('extractCircledWordsFromImage runs verification pass for high-volume candidates', async () => {
  let generateCalls = 0;

  const provider = createProvider(async () => {
    generateCalls += 1;

    if (generateCalls === 1) {
      return {
        success: true,
        content: JSON.stringify({
          words: buildWords(11),
        }),
      };
    }

    return {
      success: true,
      content: JSON.stringify({
        words: [
          { english: 'word-2', japanese: '意味-2' },
          { english: 'word-7', japanese: '意味-7' },
        ],
      }),
    };
  });

  const result = await extractCircledWordsFromImage(
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
    assert.equal(result.data.words.length, 2);
    assert.equal(result.data.words[0].english, 'word-2');
    assert.equal(result.data.words[1].english, 'word-7');
  }
});

test('extractCircledWordsFromImage skips verification pass for normal candidate count', async () => {
  let generateCalls = 0;

  const provider = createProvider(async () => {
    generateCalls += 1;

    return {
      success: true,
      content: JSON.stringify({
        words: [
          { english: 'inspect', japanese: '調べる' },
          { english: 'prospective', japanese: '見込みのある' },
        ],
      }),
    };
  });

  const result = await extractCircledWordsFromImage(
    'data:image/png;base64,ZmFrZQ==',
    { gemini: 'test-key' },
    {
      dependencies: {
        getProviderFromConfig: () => provider,
      },
    }
  );

  assert.equal(generateCalls, 1);
  assert.equal(result.success, true);

  if (result.success) {
    assert.equal(result.data.words.length, 2);
  }
});
