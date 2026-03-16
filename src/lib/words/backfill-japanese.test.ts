import assert from 'node:assert/strict';
import test from 'node:test';

import { backfillMissingJapaneseTranslations } from './backfill-japanese';

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
