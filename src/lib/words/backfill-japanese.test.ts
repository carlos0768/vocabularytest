import assert from 'node:assert/strict';
import test from 'node:test';

import {
  backfillMissingJapaneseTranslations,
  backfillMissingJapaneseTranslationsWithMetadata,
} from './backfill-japanese';

test('backfillMissingJapaneseTranslations fills blank japanese with translated values', async () => {
  const translated = await backfillMissingJapaneseTranslations(
    [
      {
        english: 'springboard',
        japanese: '',
        distractors: [],
        partOfSpeechTags: ['noun'],
      },
      {
        english: 'went viral',
        japanese: '話題になった',
        distractors: [],
        partOfSpeechTags: ['verb'],
      },
    ],
    {
      translateWords: async (inputs) => new Map(
        inputs.map((input) => [`${input.english.toLowerCase()}::${input.pos}`, '出発点']),
      ),
    },
  );

  assert.equal(translated[0]?.japanese, '出発点');
  assert.equal(translated[1]?.japanese, '話題になった');
});

test('backfillMissingJapaneseTranslations deduplicates translation requests by english and pos', async () => {
  const calls: Array<{ english: string; pos: string }> = [];

  const translated = await backfillMissingJapaneseTranslations(
    [
      {
        english: 'beeline',
        japanese: '',
        distractors: [],
        partOfSpeechTags: ['noun'],
      },
      {
        english: 'beeline',
        japanese: '',
        distractors: [],
        partOfSpeechTags: ['noun'],
      },
    ],
    {
      translateWords: async (inputs) => {
        calls.push(...inputs);
        return new Map([['beeline::noun', '一直線']]);
      },
    },
  );

  assert.deepEqual(calls, [{ english: 'beeline', pos: 'noun' }]);
  assert.equal(translated[0]?.japanese, '一直線');
  assert.equal(translated[1]?.japanese, '一直線');
});

test('backfillMissingJapaneseTranslationsWithMetadata returns AI-backfilled indexes', async () => {
  const result = await backfillMissingJapaneseTranslationsWithMetadata(
    [
      {
        english: 'beeline',
        japanese: '',
        distractors: [],
        partOfSpeechTags: ['noun'],
      },
      {
        english: 'went viral',
        japanese: '話題になった',
        distractors: [],
        partOfSpeechTags: ['verb'],
      },
    ],
    {
      translateWords: async () => new Map([['beeline::noun', '一直線']]),
    },
  );

  assert.deepEqual(result.aiBackfilledIndexes, [0]);
  assert.equal(result.words[0]?.japanese, '一直線');
  assert.equal(result.words[1]?.japanese, '話題になった');
});

test('backfillMissingJapaneseTranslations falls back to per-word translation when batch result is unusable', async () => {
  const translated = await backfillMissingJapaneseTranslations(
    [
      {
        english: 'experiment',
        japanese: '',
        distractors: [],
        partOfSpeechTags: ['noun'],
      },
      {
        english: 'amplifier',
        japanese: '',
        distractors: [],
        partOfSpeechTags: ['noun'],
      },
    ],
    {
      translateWords: async (inputs) => new Map(
        inputs.map((input) => [`${input.english.toLowerCase()}::${input.pos}`, null]),
      ),
      translateWord: async (english) => {
        if (english === 'experiment') return '実験';
        if (english === 'amplifier') return '増幅器';
        return null;
      },
    },
  );

  assert.equal(translated[0]?.japanese, '実験');
  assert.equal(translated[1]?.japanese, '増幅器');
});

test('backfillMissingJapaneseTranslations only falls back for unresolved items', async () => {
  const fallbackCalls: string[] = [];

  const translated = await backfillMissingJapaneseTranslations(
    [
      {
        english: 'TED talks',
        japanese: '',
        distractors: [],
        partOfSpeechTags: ['noun'],
      },
      {
        english: 'went viral',
        japanese: '',
        distractors: [],
        partOfSpeechTags: ['verb'],
      },
    ],
    {
      translateWords: async () => new Map([
        ['ted talks::noun', 'TEDトーク'],
        ['went viral::verb', null],
      ]),
      translateWord: async (english) => {
        fallbackCalls.push(english);
        return english === 'went viral' ? '拡散した' : null;
      },
    },
  );

  assert.deepEqual(fallbackCalls, ['went viral']);
  assert.equal(translated[0]?.japanese, 'TEDトーク');
  assert.equal(translated[1]?.japanese, '拡散した');
});

test('backfillMissingJapaneseTranslations rejects non-Japanese AI output and retries per-word', async () => {
  const translated = await backfillMissingJapaneseTranslations(
    [
      {
        english: 'impassioned responses',
        japanese: '',
        distractors: [],
        partOfSpeechTags: ['noun'],
      },
    ],
    {
      translateWords: async () => new Map([
        ['impassioned responses::noun', 'Here'],
      ]),
      translateWord: async () => '熱のこもった反応',
    },
  );

  assert.equal(translated[0]?.japanese, '熱のこもった反応');
});
