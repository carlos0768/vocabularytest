import assert from 'node:assert/strict';
import test from 'node:test';

import {
  __internal,
  generateExampleSentences,
  EXAMPLE_SENTENCE_RESPONSE_SCHEMA,
  type ExampleSeedWord,
} from './generate-example-sentences';
import { PART_OF_SPEECH_TAGS } from './part-of-speech';
import type { AIProvider } from './providers';

function createProvider(generateText: AIProvider['generateText']): AIProvider {
  return {
    name: 'mock-provider',
    generate: async () => ({ success: false, error: 'not used in tests' }),
    generateText,
  };
}

test('generateSingle passes the Controlled Generation schema + json format on the provider config', async () => {
  let receivedConfig: Parameters<AIProvider['generateText']>[1] | undefined;
  const provider = createProvider(async (_prompt, config) => {
    receivedConfig = config;
    return {
      success: true,
      content: JSON.stringify({
        partOfSpeechTags: ['noun'],
        exampleSentence: 'The plan improved our workflow.',
        exampleSentenceJa: 'その計画は作業を改善した。',
      }),
    };
  });

  const result = await __internal.generateSingle(
    { id: '1', english: 'plan', japanese: '計画' },
    { gemini: 'test-key' },
    undefined,
    { getProviderFromConfig: () => provider },
  );

  assert.equal(receivedConfig?.responseFormat, 'json');
  assert.deepEqual(receivedConfig?.responseSchema, EXAMPLE_SENTENCE_RESPONSE_SCHEMA);
  assert.equal(receivedConfig?.maxOutputTokens, 512);
  assert.equal(result.exampleSentence, 'The plan improved our workflow.');
  assert.deepEqual(result.partOfSpeechTags, ['noun']);
});

test('generateSingle still rejects via Zod when the provider returns a malformed shape', async () => {
  const provider = createProvider(async () => ({
    success: true,
    // Structurally-plausible but incomplete: exampleSentenceJa missing -> Zod must still reject.
    content: JSON.stringify({
      partOfSpeechTags: ['noun'],
      exampleSentence: 'Missing the Japanese field.',
    }),
  }));

  await assert.rejects(
    () => __internal.generateSingle(
      { id: '1', english: 'plan', japanese: '計画' },
      { gemini: 'test-key' },
      undefined,
      { getProviderFromConfig: () => provider },
    ),
    /Invalid example response|Failed to parse/,
  );
});

test('EXAMPLE_SENTENCE_RESPONSE_SCHEMA mirrors the Zod shape and sources the POS enum', () => {
  assert.equal(EXAMPLE_SENTENCE_RESPONSE_SCHEMA.type, 'OBJECT');
  assert.deepEqual(EXAMPLE_SENTENCE_RESPONSE_SCHEMA.required, ['exampleSentence', 'exampleSentenceJa']);
  assert.deepEqual(EXAMPLE_SENTENCE_RESPONSE_SCHEMA.propertyOrdering, [
    'partOfSpeechTags',
    'exampleSentence',
    'exampleSentenceJa',
  ]);
  assert.deepEqual(
    EXAMPLE_SENTENCE_RESPONSE_SCHEMA.properties?.partOfSpeechTags?.items?.enum,
    [...PART_OF_SPEECH_TAGS],
  );
});

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

test('buildSingleExamplePrompt injects genre guidance only when genres exist', () => {
  const word: ExampleSeedWord = { id: '1', english: 'goal', japanese: 'ゴール' };

  const plainPrompt = __internal.buildSingleExamplePrompt(word);
  assert.ok(!plainPrompt.includes('ユーザの興味ジャンル'));
  assert.ok(plainPrompt.includes('単語: "goal" (ゴール)'));

  const genrePrompt = __internal.buildSingleExamplePrompt(word, ['サッカー', '映画']);
  assert.ok(genrePrompt.includes('ユーザの興味ジャンル'));
  assert.ok(genrePrompt.includes('サッカー、映画'));
  assert.ok(genrePrompt.includes('単語: "goal" (ゴール)'));
});

test('generateExampleSentences forwards genres to generateSingle', async () => {
  const words: ExampleSeedWord[] = [
    { id: '1', english: 'alpha', japanese: 'アルファ' },
  ];
  const receivedGenres: Array<readonly string[] | undefined> = [];

  const result = await generateExampleSentences(
    words,
    {},
    {
      genres: ['サッカー'],
      generateSingle: async (word, _apiKeys, genres) => {
        receivedGenres.push(genres);
        return {
          wordId: word.id,
          partOfSpeechTags: ['noun'],
          exampleSentence: 'The striker scored a dramatic goal in the final.',
          exampleSentenceJa: 'そのストライカーは決勝で劇的なゴールを決めた。',
        };
      },
    },
  );

  assert.equal(result.examples.length, 1);
  assert.deepEqual(receivedGenres, [['サッカー']]);
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
