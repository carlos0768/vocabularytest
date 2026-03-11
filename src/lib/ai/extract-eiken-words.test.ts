import test from 'node:test';
import assert from 'node:assert/strict';

import { analyzeWordsForEiken, extractEikenWordsFromImage } from '@/lib/ai/extract-eiken-words';
import type { AIProvider } from '@/lib/ai/providers';

function createProvider(generate: AIProvider['generate']): AIProvider {
  return {
    name: 'mock-provider',
    generate,
    generateText: async () => ({ success: false, error: 'not used in tests' }),
  };
}

test('analyzeWordsForEiken returns invalid_json when provider output is malformed', async () => {
  const provider = createProvider(async () => ({
    success: true,
    content: '{not-json',
  }));

  const result = await analyzeWordsForEiken(
    'This is sample text.',
    { gemini: 'test-key' },
    '3',
    {
      getProviderFromConfig: () => provider,
    }
  );

  assert.equal(result.success, false);
  if (!result.success) {
    assert.equal(result.reason, 'invalid_json');
  }
});

test('extractEikenWordsFromImage falls back to single-pass extraction on invalid_json', async () => {
  let generateCalls = 0;
  let fallbackCalled = false;
  let fallbackEikenLevel: string | null | undefined;

  const provider = createProvider(async () => {
    generateCalls += 1;

    if (generateCalls === 1) {
      return {
        success: true,
        content: JSON.stringify({
          sourceLabels: ['鉄壁'],
          text: 'Extracted OCR text from image',
        }),
      };
    }

    return {
      success: true,
      content: '```json\n{invalid\n```',
    };
  });

  const result = await extractEikenWordsFromImage(
    'data:image/png;base64,ZmFrZQ==',
    { gemini: 'test-key' },
    '3',
    {
      getProviderFromConfig: () => provider,
      extractWordsFromImage: async (_image, _apiKeys, options) => {
        fallbackCalled = true;
        fallbackEikenLevel = options?.eikenLevel;
        return {
          success: true,
          data: {
            words: [
              {
                english: 'abandon',
                japanese: '捨てる',
                distractors: ['守る', '作る', '届ける'],
                partOfSpeechTags: ['verb'],
                exampleSentence: undefined,
                exampleSentenceJa: undefined,
              },
            ],
            sourceLabels: ['ノート'],
          },
        };
      },
    }
  );

  assert.equal(generateCalls, 2);
  assert.equal(fallbackCalled, true);
  assert.equal(fallbackEikenLevel, undefined);
  assert.equal(result.success, true);

  if (result.success) {
    assert.equal(result.extractedText, 'Extracted OCR text from image');
    assert.equal(result.data.words.length, 1);
    assert.equal(result.data.words[0].english, 'abandon');
    assert.deepEqual(result.data.sourceLabels, ['鉄壁', 'ノート']);
  }
});

test('extractEikenWordsFromImage preserves source labels from Gemini OCR on success path', async () => {
  let generateCalls = 0;

  const provider = createProvider(async () => {
    generateCalls += 1;

    if (generateCalls === 1) {
      return {
        success: true,
        content: JSON.stringify({
          sourceLabels: ['LEAP'],
          text: 'abandon 放棄する',
        }),
      };
    }

    return {
      success: true,
      content: JSON.stringify({
        words: [
          {
            english: 'abandon',
            japanese: '放棄する',
          },
        ],
      }),
    };
  });

  const result = await extractEikenWordsFromImage(
    'data:image/png;base64,ZmFrZQ==',
    { gemini: 'test-key' },
    '3',
    {
      getProviderFromConfig: () => provider,
    }
  );

  assert.equal(result.success, true);
  assert.equal(generateCalls, 2);

  if (result.success) {
    assert.equal(result.extractedText, 'abandon 放棄する');
    assert.deepEqual(result.data.sourceLabels, ['LEAP']);
    assert.equal(result.data.words[0].english, 'abandon');
  }
});
