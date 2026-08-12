import test from 'node:test';
import assert from 'node:assert/strict';

import {
  __internal,
  generateDerivedWords,
  type DerivedWordsSeed,
} from './generate';
import { resolveDerivedWordsEligibility } from './eligibility';

const { buildDerivedWordsPrompt, toWordDerivedWords } = __internal;

function seedFor(english: string): DerivedWordsSeed {
  return { english, eligibility: resolveDerivedWordsEligibility(english) };
}

// ---------- prompt ----------

test('prompt states the max-3 cap and the derived-word definition', () => {
  const prompt = buildDerivedWordsPrompt(seedFor('receive'));
  assert.ok(prompt.includes('最大3語まで'));
  assert.ok(prompt.includes('同じ語根を共有し'));
  assert.ok(prompt.includes('単語: "receive"'));
});

test('prompt passes the root family as context for track A words', () => {
  const prompt = buildDerivedWordsPrompt(seedFor('receive'));
  assert.ok(prompt.includes('この単語の語根: re- + ceiv'));
  assert.ok(prompt.includes('同語根の語'));
  // 語族は文脈であって答えではない、と明示する
  assert.ok(prompt.includes('そのまま答えにしないこと'));
});

test('prompt omits root context for track B only words', () => {
  const prompt = buildDerivedWordsPrompt(seedFor('analyze'));
  assert.ok(prompt.includes('単語: "analyze"'));
  assert.ok(!prompt.includes('この単語の語根'));
  assert.ok(!prompt.includes('同語根の語'));
});

test('prompt forbids synonyms and bare inflections', () => {
  const prompt = buildDerivedWordsPrompt(seedFor('receive'));
  assert.ok(prompt.includes('類義語'));
  assert.ok(prompt.includes('屈折変化'));
});

// ---------- validation ----------

test('toWordDerivedWords keeps valid items', () => {
  const result = toWordDerivedWords({
    hasDerivedWords: true,
    items: [
      { english: 'reception', japanese: '受付', partOfSpeech: 'noun', examTags: ['toefl'] },
      { english: 'receptive', japanese: '受容力のある', partOfSpeech: 'adjective' },
    ],
  }, 'receive');

  assert.ok(result);
  assert.equal(result.version, 1);
  assert.equal(result.items.length, 2);
  assert.deepEqual(result.items[0]!.examTags, ['toefl']);
  // examTags が空なら省く
  assert.equal(result.items[1]!.examTags, undefined);
});

test('toWordDerivedWords returns null when the AI reports none', () => {
  assert.equal(toWordDerivedWords({ hasDerivedWords: false, items: [] }, 'pine'), null);
});

test('toWordDerivedWords drops the source word itself', () => {
  const result = toWordDerivedWords({
    hasDerivedWords: true,
    items: [
      { english: 'Receive', japanese: '受け取る', partOfSpeech: 'verb' },
      { english: 'reception', japanese: '受付', partOfSpeech: 'noun' },
    ],
  }, 'receive');

  assert.ok(result);
  assert.deepEqual(result.items.map((item) => item.english), ['reception']);
});

test('toWordDerivedWords dedupes repeated entries', () => {
  const result = toWordDerivedWords({
    hasDerivedWords: true,
    items: [
      { english: 'reception', japanese: '受付', partOfSpeech: 'noun' },
      { english: 'Reception', japanese: '歓迎会', partOfSpeech: 'noun' },
    ],
  }, 'receive');

  assert.equal(result?.items.length, 1);
});

test('toWordDerivedWords truncates to the 3-item cap', () => {
  const result = toWordDerivedWords({
    hasDerivedWords: true,
    items: ['a', 'b', 'c', 'd', 'e'].map((letter) => ({
      english: `word${letter}`,
      japanese: '訳',
      partOfSpeech: 'noun' as const,
    })),
  }, 'receive');

  assert.equal(result?.items.length, 3);
});

test('toWordDerivedWords returns null when everything was filtered out', () => {
  const result = toWordDerivedWords({
    hasDerivedWords: true,
    items: [{ english: 'receive', japanese: '受け取る', partOfSpeech: 'verb' }],
  }, 'receive');
  assert.equal(result, null);
});

test('toWordDerivedWords rejects malformed AI output', () => {
  assert.throws(() => toWordDerivedWords({ hasDerivedWords: true, items: [
    { english: 'reception', japanese: '受付', partOfSpeech: 'gerund' },
  ] }, 'receive'));
  assert.throws(() => toWordDerivedWords({ items: [] }, 'receive'));
});

// ---------- orchestration ----------

test('generateDerivedWords returns empty for no seeds', async () => {
  const result = await generateDerivedWords([], {});
  assert.deepEqual(result, { results: [], errors: [] });
});

test('generateDerivedWords retries a failed word once then records the error', async () => {
  const attempts: string[] = [];
  const result = await generateDerivedWords(
    [seedFor('receive'), seedFor('decide')],
    {},
    {
      generateSingle: async (seed) => {
        attempts.push(seed.english);
        if (seed.english === 'decide') throw new Error('boom');
        return {
          english: seed.english,
          derivedWords: {
            items: [{ english: 'reception', japanese: '受付', partOfSpeech: 'noun' }],
            version: 1,
          },
        };
      },
    },
  );

  assert.equal(result.results.length, 1);
  assert.equal(result.results[0]!.english, 'receive');
  assert.equal(result.errors.length, 1);
  assert.ok(result.errors[0]!.startsWith('decide: '));
  // decide は初回 + リトライで2回呼ばれる
  assert.equal(attempts.filter((word) => word === 'decide').length, 2);
});

test('generateDerivedWords recovers when the retry succeeds', async () => {
  let calls = 0;
  const result = await generateDerivedWords([seedFor('receive')], {}, {
    generateSingle: async (seed) => {
      calls += 1;
      if (calls === 1) throw new Error('transient');
      return { english: seed.english, derivedWords: null };
    },
  });

  assert.equal(result.errors.length, 0);
  assert.equal(result.results.length, 1);
  assert.equal(result.results[0]!.derivedWords, null);
});
