import test from 'node:test';
import assert from 'node:assert/strict';

import {
  generateClassicalExamples,
  __internal,
  type ClassicalExampleSeedWord,
  type GeneratedClassicalExample,
} from './generate-classical-examples';

const { looksLikeClassicalSentence, buildClassicalExamplePrompt } = __internal;

function seed(id: string, headword: string): ClassicalExampleSeedWord {
  return { id, headword, meaning: '意味' };
}

function generated(id: string): GeneratedClassicalExample {
  return { wordId: id, exampleSentence: 'いとをかし。', exampleSentenceJa: 'とても趣がある。' };
}

test('generateClassicalExamples returns nothing for an empty input without calling the AI', async () => {
  let called = false;
  const result = await generateClassicalExamples([], {}, {
    generateSingle: async () => {
      called = true;
      throw new Error('should not be called');
    },
  });

  assert.equal(called, false);
  assert.deepEqual(result.examples, []);
  assert.deepEqual(result.summary, { requested: 0, generated: 0, failed: 0, retried: 0 });
});

test('generateClassicalExamples generates one example per word', async () => {
  const asked: string[] = [];
  const result = await generateClassicalExamples(
    [seed('0', 'あさまし'), seed('1', 'をかし')],
    {},
    {
      generateSingle: async (word) => {
        asked.push(word.headword);
        return generated(word.id);
      },
    },
  );

  assert.deepEqual(asked.sort(), ['あさまし', 'をかし']);
  assert.equal(result.examples.length, 2);
  assert.equal(result.summary.generated, 2);
  assert.equal(result.summary.failed, 0);
  assert.deepEqual(result.errors, []);
});

test('generateClassicalExamples retries a failed word once and recovers', async () => {
  const attempts = new Map<string, number>();
  const result = await generateClassicalExamples([seed('0', 'あはれなり')], {}, {
    generateSingle: async (word) => {
      const count = (attempts.get(word.id) ?? 0) + 1;
      attempts.set(word.id, count);
      if (count === 1) throw new Error('transient');
      return generated(word.id);
    },
  });

  assert.equal(attempts.get('0'), 2);
  assert.equal(result.summary.retried, 1);
  assert.equal(result.summary.generated, 1);
  assert.equal(result.summary.failed, 0);
  assert.deepEqual(result.errors, []);
});

// 例文が付かないだけでスキャンを止めないこと（best-effort）
test('generateClassicalExamples reports a terminal failure without throwing', async () => {
  const result = await generateClassicalExamples([seed('0', 'ゆかし')], {}, {
    generateSingle: async () => {
      throw new Error('provider down');
    },
  });

  assert.equal(result.examples.length, 0);
  assert.equal(result.summary.failed, 1);
  assert.deepEqual(result.errors, ['ゆかし: provider down']);
});

// 古典語に英文が付く事故（#558 で塞いだもの）を自分で作り直さないための検査
test('looksLikeClassicalSentence rejects sentences containing Latin letters', () => {
  assert.equal(looksLikeClassicalSentence('いとをかし。'), true);
  assert.equal(looksLikeClassicalSentence('月いと明かし。'), true);
  assert.equal(looksLikeClassicalSentence('This is a pen.'), false);
  // 一部だけ英語が混じっている場合も落とす
  assert.equal(looksLikeClassicalSentence('いとokなり。'), false);
  assert.equal(looksLikeClassicalSentence(''), false);
});

test('buildClassicalExamplePrompt carries the system rules and the word', () => {
  const prompt = buildClassicalExamplePrompt({
    id: '0',
    headword: 'あさまし',
    meaning: '驚きあきれる',
    reading: 'あさまし',
  });

  assert.ok(prompt.includes('出典'));
  assert.ok(prompt.includes('見出し語: あさまし'));
  assert.ok(prompt.includes('読み: あさまし'));
  assert.ok(prompt.includes('この語義で使うこと: 驚きあきれる'));
});
