import assert from 'node:assert/strict';
import test from 'node:test';

import {
  __internal,
  generateExampleSentences,
  type ExampleSeedWord,
} from './generate-example-sentences';

test('parseSingleExampleResponse accepts string partOfSpeechTags inside code fences', () => {
  const parsed = __internal.parseSingleExampleResponse(`\`\`\`json
{
  "partOfSpeechTags": "noun",
  "exampleSentence": "The new policy improved our daily workflow.",
  "exampleSentenceJa": "その新しい方針は日々の作業を改善した。"
}
\`\`\``);

  assert.deepEqual(parsed.partOfSpeechTags, ['noun']);
  assert.equal(parsed.exampleSentence, 'The new policy improved our daily workflow.');
});

test('parseSingleExampleResponse salvages a missing closing brace', () => {
  const parsed = __internal.parseSingleExampleResponse('{"partOfSpeechTags":["verb"],"exampleSentence":"We rely on clear examples in class.","exampleSentenceJa":"授業では分かりやすい例文に頼る。"\n');

  assert.deepEqual(parsed.partOfSpeechTags, ['verb']);
  assert.equal(parsed.exampleSentenceJa, '授業では分かりやすい例文に頼る。');
});

test('generateExampleSentences reports retryRecovered and terminal failure kinds', async () => {
  const words: ExampleSeedWord[] = [
    { id: '1', english: 'alpha', japanese: 'アルファ' },
    { id: '2', english: 'beta', japanese: 'ベータ' },
    { id: '3', english: 'gamma', japanese: 'ガンマ' },
    { id: '4', english: 'delta', japanese: 'デルタ' },
  ];

  const attempts = new Map<string, number>();
  const result = await generateExampleSentences(
    words,
    {},
    {
      generateSingle: async (word) => {
        const attempt = (attempts.get(word.id) ?? 0) + 1;
        attempts.set(word.id, attempt);

        if (word.id === '1') {
          return {
            wordId: word.id,
            partOfSpeechTags: ['noun'],
            exampleSentence: 'Alpha appears first in the sequence.',
            exampleSentenceJa: 'alpha はその並びで最初に現れる。',
          };
        }

        if (word.id === '2' && attempt === 1) {
          throw new Error('Failed to parse example response: Unterminated string in JSON at position 10');
        }

        if (word.id === '2') {
          return {
            wordId: word.id,
            partOfSpeechTags: ['noun'],
            exampleSentence: 'Beta comes after alpha in the chart.',
            exampleSentenceJa: 'beta は表で alpha の次に来る。',
          };
        }

        if (word.id === '3') {
          throw new Error('Invalid example response: exampleSentenceJa is required');
        }

        throw new Error(`Empty example sentence returned for "${word.english}"`);
      },
    },
  );

  assert.equal(result.examples.length, 2);
  assert.equal(result.summary.requested, 4);
  assert.equal(result.summary.generated, 2);
  assert.equal(result.summary.failed, 2);
  assert.equal(result.summary.retried, 3);
  assert.equal(result.summary.retryRecovered, 1);
  assert.equal(result.summary.failureKinds.validation, 1);
  assert.equal(result.summary.failureKinds.empty, 1);
  assert.equal(result.summary.failureKinds.parse, 0);
  assert.deepEqual(result.errors, [
    'gamma: Invalid example response: exampleSentenceJa is required',
    'delta: Empty example sentence returned for "delta"',
  ]);
});
