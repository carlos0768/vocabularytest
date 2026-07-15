import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';

import { handleGenerateQuizDistractorsPost } from './route';

function jsonRequest(body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest('http://localhost/api/generate-quiz-distractors', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

function createClient(
  user: { id: string } | null = { id: 'user-1' },
  wordRows: Array<Record<string, unknown>> = [],
) {
  const selectedIds: string[][] = [];
  const updates: Array<{ id: string; payload: Record<string, unknown> }> = [];

  return {
    selectedIds,
    updates,
    client: {
      auth: {
        getUser: async (token?: string) => ({
          data: { user },
          error: null,
          token,
        }),
      },
      from: () => ({
        select: () => ({
          in: async (_column: string, ids: string[]) => {
            selectedIds.push(ids);
            return { data: wordRows, error: null };
          },
        }),
        update: (payload: Record<string, unknown>) => ({
          eq: async (_column: string, id: string) => {
            updates.push({ id, payload });
            return { error: null };
          },
        }),
      }),
    },
  };
}

test('generate-quiz-distractors skips generation for multi-word entries', async () => {
  const fake = createClient();
  let generateCallCount = 0;
  let genreCallCount = 0;

  const response = await handleGenerateQuizDistractorsPost(
    jsonRequest({ words: [{ id: 'word-1', english: 'take care', japanese: '世話をする' }] }),
    {
      createClient: async () => fake.client as never,
      generate: async () => {
        generateCallCount += 1;
        return [];
      },
      fetchExampleGenres: async () => {
        genreCallCount += 1;
        return [];
      },
    },
  );

  assert.equal(response.status, 200);
  const payload = await response.json() as { success: boolean; results: unknown[] };
  assert.equal(payload.success, true);
  assert.deepEqual(payload.results, []);
  assert.equal(generateCallCount, 0);
  assert.equal(genreCallCount, 0);
  assert.deepEqual(fake.selectedIds, []);
});

test('generate-quiz-distractors sends only single-word entries to AI generation', async () => {
  const fake = createClient();
  const generateCalls: unknown[] = [];
  const genreCalls: string[] = [];

  const response = await handleGenerateQuizDistractorsPost(
    jsonRequest({
      words: [
        { id: 'word-1', english: 'take care', japanese: '世話をする' },
        { id: 'word-2', english: 'adapt', japanese: '適応する' },
      ],
    }),
    {
      createClient: async () => fake.client as never,
      fetchExampleGenres: async (_supabase, userId) => {
        genreCalls.push(userId);
        return ['travel'];
      },
      generate: async (words, options) => {
        generateCalls.push({ words, genres: options?.genres });
        return [{
          wordId: 'word-2',
          distractors: ['拒む', '避ける', '忘れる'],
          partOfSpeechTags: [],
          pronunciation: '',
          exampleSentence: '',
          exampleSentenceJa: '',
        }];
      },
    },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(fake.selectedIds, [['word-2']]);
  assert.deepEqual(genreCalls, ['user-1']);
  assert.deepEqual(generateCalls, [{
    words: [{
      id: 'word-2',
      english: 'adapt',
      japanese: '適応する',
      needs: { distractors: true, example: true, pronunciation: true, pos: true },
    }],
    genres: ['travel'],
  }]);

  const payload = await response.json() as {
    success: boolean;
    results: Array<{ wordId: string; distractors: string[] }>;
  };
  assert.equal(payload.success, true);
  assert.deepEqual(payload.results, [{
    wordId: 'word-2',
    distractors: ['拒む', '避ける', '忘れる'],
    partOfSpeechTags: [],
    pronunciation: '',
    exampleSentence: '',
    exampleSentenceJa: '',
  }]);
  assert.deepEqual(fake.updates, []);
});

test('generate-quiz-distractors reuses lexicon quiz content without calling AI', async () => {
  const fake = createClient({ id: 'user-1' }, [
    {
      id: 'word-1',
      japanese: '適応する',
      distractors: [],
      example_sentence: 'We adapt to new rules.',
      pronunciation: null,
      part_of_speech_tags: ['verb'],
      lexicon_entry_id: 'entry-1',
      lexicon_sense_id: 'sense-1',
    },
  ]);
  let generateCallCount = 0;
  let saveToLexiconCallCount = 0;

  const response = await handleGenerateQuizDistractorsPost(
    jsonRequest({ words: [{ id: 'word-1', english: 'adapt', japanese: '適応する' }] }),
    {
      createClient: async () => fake.client as never,
      generate: async () => {
        generateCallCount += 1;
        return [];
      },
      fetchExampleGenres: async () => [],
      fetchLexiconContent: async () => ({
        pronunciationByEntryId: new Map([['entry-1', '/əˈdæpt/']]),
        distractorsBySenseId: new Map([['sense-1', ['拒む', '避ける', '忘れる']]]),
      }),
      saveToLexicon: async () => {
        saveToLexiconCallCount += 1;
        return { pronunciationUpdated: 0, distractorsUpdated: 0, errors: 0 };
      },
    },
  );

  assert.equal(response.status, 200);
  const payload = await response.json() as {
    success: boolean;
    results: Array<{ wordId: string; distractors: string[]; pronunciation: string }>;
  };
  assert.equal(payload.success, true);
  assert.equal(generateCallCount, 0);
  assert.equal(saveToLexiconCallCount, 0);
  assert.deepEqual(payload.results, [{
    wordId: 'word-1',
    distractors: ['拒む', '避ける', '忘れる'],
    partOfSpeechTags: [],
    pronunciation: '/əˈdæpt/',
    exampleSentence: '',
    exampleSentenceJa: '',
  }]);
  // 使い回した発音記号は words 側にも保存される。
  assert.deepEqual(fake.updates, [{ id: 'word-1', payload: { pronunciation: '/əˈdæpt/' } }]);
});

test('generate-quiz-distractors writes generated quiz content back to the lexicon', async () => {
  const fake = createClient({ id: 'user-1' }, [
    {
      id: 'word-1',
      japanese: '適応する',
      distractors: [],
      example_sentence: null,
      pronunciation: null,
      part_of_speech_tags: [],
      lexicon_entry_id: 'entry-1',
      lexicon_sense_id: 'sense-1',
    },
  ]);
  const savedUpdates: unknown[] = [];

  const response = await handleGenerateQuizDistractorsPost(
    jsonRequest({ words: [{ id: 'word-1', english: 'adapt', japanese: '適応する' }] }),
    {
      createClient: async () => fake.client as never,
      generate: async () => [{
        wordId: 'word-1',
        distractors: ['拒む', '避ける', '忘れる'],
        partOfSpeechTags: ['verb'],
        pronunciation: '/əˈdæpt/',
        exampleSentence: 'We adapt to new rules.',
        exampleSentenceJa: '私たちは新しい規則に適応します。',
      }],
      fetchExampleGenres: async () => [],
      fetchLexiconContent: async () => ({
        pronunciationByEntryId: new Map(),
        distractorsBySenseId: new Map(),
      }),
      saveToLexicon: async (updates) => {
        savedUpdates.push(...updates);
        return { pronunciationUpdated: 1, distractorsUpdated: 1, errors: 0 };
      },
    },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(savedUpdates, [{
    lexiconEntryId: 'entry-1',
    lexiconSenseId: 'sense-1',
    pronunciation: '/əˈdæpt/',
    distractors: ['拒む', '避ける', '忘れる'],
  }]);
});
