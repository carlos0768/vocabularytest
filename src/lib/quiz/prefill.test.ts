import test from 'node:test';
import assert from 'node:assert/strict';
import type { QuizPrefillWordInput } from './prefill';
import { hasAuthorizationHeader, prefillQuizContent } from './prefill';

function createSeedWord(id: string): QuizPrefillWordInput {
  return {
    id,
    english: `english-${id}`,
    japanese: `japanese-${id}`,
    distractors: ['選択肢1', '選択肢2', '選択肢3'],
  };
}

test('hasAuthorizationHeader supports object, tuple, and Headers inputs', () => {
  const objectHeader = hasAuthorizationHeader({ Authorization: 'Bearer token' });
  const tupleHeader = hasAuthorizationHeader([['authorization', 'Bearer token']]);
  const headersInstance = new Headers({ authorization: 'Bearer token' });

  assert.equal(objectHeader, true);
  assert.equal(tupleHeader, true);
  assert.equal(hasAuthorizationHeader(headersInstance), true);
  assert.equal(hasAuthorizationHeader({ 'Content-Type': 'application/json' }), false);
});

test('prefillQuizContent returns empty result for empty input', async () => {
  const result = await prefillQuizContent([], { Authorization: 'Bearer token' }, {
    fetchImpl: async () => {
      throw new Error('fetch should not be called');
    },
  });

  assert.equal(result.updatesByWordId.size, 0);
  assert.deepEqual(result.failedWordIds, []);
});

test('prefillQuizContent handles duplicate word ids as a single request target', async () => {
  const requestedIds: string[][] = [];
  const fetchImpl: typeof fetch = async (_input, init) => {
    const body = JSON.parse((init?.body as string) || '{}') as { words: QuizPrefillWordInput[] };
    requestedIds.push(body.words.map((word) => word.id));
    return new Response(JSON.stringify({
      success: true,
      results: body.words.map((word) => ({
        wordId: word.id,
        distractors: ['誤答1', '誤答2', '誤答3'],
        exampleSentence: 'Example sentence.',
        exampleSentenceJa: '例文。',
      })),
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  const result = await prefillQuizContent(
    [createSeedWord('dup'), createSeedWord('dup')],
    { Authorization: 'Bearer token' },
    { fetchImpl }
  );

  assert.deepEqual(requestedIds, [['dup']]);
  assert.equal(result.updatesByWordId.size, 1);
  assert.deepEqual(result.failedWordIds, []);
});

test('prefillQuizContent retries and returns partial success with failed ids', async () => {
  const attemptsByWord = new Map<string, number>();
  const sleepCalls: number[] = [];

  const fetchImpl: typeof fetch = async (_input, init) => {
    const body = JSON.parse((init?.body as string) || '{}') as { words: QuizPrefillWordInput[] };
    const responseResults: Array<{ wordId: string; distractors: string[]; exampleSentence?: string; exampleSentenceJa?: string }> = [];

    for (const word of body.words) {
      const attempt = (attemptsByWord.get(word.id) ?? 0) + 1;
      attemptsByWord.set(word.id, attempt);

      if (word.id === 'success-immediate') {
        responseResults.push({
          wordId: word.id,
          distractors: ['a', 'b', 'c'],
          exampleSentence: 'Example.',
          exampleSentenceJa: '例文。',
        });
        continue;
      }

      if (word.id === 'success-retry' && attempt >= 2) {
        responseResults.push({
          wordId: word.id,
          distractors: ['d', 'e', 'f'],
        });
      }
    }

    return new Response(JSON.stringify({
      success: true,
      results: responseResults,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  const sleepImpl = async (ms: number) => {
    sleepCalls.push(ms);
  };

  const result = await prefillQuizContent(
    [createSeedWord('success-immediate'), createSeedWord('success-retry'), createSeedWord('always-fail')],
    { Authorization: 'Bearer token' },
    {
      fetchImpl,
      sleepImpl,
      maxAttempts: 3,
      retryBaseDelayMs: 10,
    }
  );

  assert.equal(result.updatesByWordId.size, 2);
  assert.deepEqual(result.failedWordIds, ['always-fail']);
  assert.ok(sleepCalls.length >= 1);
});

test('prefillQuizContent marks all words failed when server keeps returning errors', async () => {
  const sleepCalls: number[] = [];
  const fetchImpl: typeof fetch = async () => {
    return new Response(JSON.stringify({ success: false, error: 'boom' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  const result = await prefillQuizContent(
    [createSeedWord('a'), createSeedWord('b')],
    { Authorization: 'Bearer token' },
    {
      fetchImpl,
      sleepImpl: async (ms) => {
        sleepCalls.push(ms);
      },
      maxAttempts: 2,
      retryBaseDelayMs: 5,
    }
  );

  assert.equal(result.updatesByWordId.size, 0);
  assert.deepEqual(result.failedWordIds.sort(), ['a', 'b']);
  assert.equal(sleepCalls.length, 1);
});

