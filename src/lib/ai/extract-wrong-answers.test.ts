import test from 'node:test';
import assert from 'node:assert/strict';

import { extractWrongAnswersFromImage } from '@/lib/ai/extract-wrong-answers';
import type { AIProvider } from '@/lib/ai/providers';

function createProvider(generate: AIProvider['generate']): AIProvider {
  return {
    name: 'mock-provider',
    generate,
    generateText: async () => ({ success: false, error: 'not used in tests' }),
  };
}

test('extractWrongAnswersFromImage completes two-step provider flow', async () => {
  let generateCalls = 0;

  const provider = createProvider(async () => {
    generateCalls += 1;

    if (generateCalls === 1) {
      return {
        success: true,
        content: JSON.stringify({
          testType: 'english_to_japanese',
          questions: [
            {
              questionNumber: 1,
              question: 'apple',
              studentAnswer: 'りんご',
              correctAnswer: 'apple',
              isCorrect: false,
              markingSymbol: '×',
              confidence: 0.95,
            },
          ],
          totalQuestions: 1,
          detectedCorrectCount: 0,
          detectedWrongCount: 1,
          notes: 'mock',
        }),
      };
    }

    return {
      success: true,
      content: JSON.stringify({
        words: [
          {
            english: 'apple',
            japanese: 'りんご',
            distractors: ['ばなな', 'ぶどう', 'もも'],
          },
        ],
        summary: {
          totalWrong: 1,
          testType: 'english_to_japanese',
        },
      }),
    };
  });

  const result = await extractWrongAnswersFromImage(
    'data:image/png;base64,ZmFrZQ==',
    { gemini: 'test-key' },
    {
      getProviderFromConfig: () => provider,
    }
  );

  assert.equal(generateCalls, 2);
  assert.equal(result.success, true);

  if (result.success) {
    assert.equal(result.summary.totalWrong, 1);
    assert.equal(result.summary.testType, 'english_to_japanese');
    assert.equal(result.data.words.length, 1);
    assert.equal(result.data.words[0].english, 'apple');
  }
});
