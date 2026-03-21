import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest } from 'next/server';

import { handleWordsCreatePost } from './route';

type InsertWordRow = Record<string, unknown>;

class FakeWordsCreateClient {
  public insertedRows: InsertWordRow[] = [];

  constructor(
    private readonly userId: string,
    private readonly ownedProjectIds: Set<string>,
    private readonly returnedWords: unknown[],
  ) {}

  auth = {
    getUser: async () => ({
      data: {
        user: { id: this.userId },
      },
      error: null,
    }),
  };

  from(table: string) {
    if (table === 'projects') {
      return {
        select: () => ({
          in: (_field: string, projectIds: string[]) => ({
            eq: async () => ({
              data: projectIds
                .filter((projectId) => this.ownedProjectIds.has(projectId))
                .map((projectId) => ({ id: projectId })),
              error: null,
            }),
          }),
        }),
      };
    }

    if (table === 'words') {
      return {
        insert: (rows: InsertWordRow[]) => {
          this.insertedRows = rows.map((row) => ({ ...row }));
          return {
            select: async () => ({
              data: this.returnedWords,
              error: null,
            }),
          };
        },
        upsert: () => {
          throw new Error('upsert should not be called in this test');
        },
      };
    }

    throw new Error(`Unexpected table: ${table}`);
  }
}

function jsonRequest(body: unknown) {
  return new NextRequest('http://localhost/api/words/create', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

function runAfterImmediately(task: unknown, setAfterPromise: (promise: Promise<void>) => void) {
  const promise = typeof task === 'function'
    ? Promise.resolve((task as () => void | Promise<void>)()).then(() => undefined)
    : Promise.resolve(task).then(() => undefined);
  setAfterPromise(promise);
}

function createImmediateResolutionResult<T>(words: T[], lexiconEntries: unknown[] = []) {
  return {
    words,
    lexiconEntries,
    metrics: {
      lookupKeyCount: 0,
      masterHitCount: 0,
      masterTranslationHitCount: 0,
      aiMissCount: 0,
      lookupElapsedMs: 0,
      translationElapsedMs: 0,
      totalElapsedMs: 0,
    },
  };
}

test('words/create inserts raw words, returns resolved lexicon entries, and enqueues unresolved ids only', async () => {
  const projectId = '11111111-1111-4111-8111-111111111111';
  const preservedLexiconEntryId = '22222222-2222-4222-8222-222222222222';
  const resolvedWordId = '33333333-3333-4333-8333-333333333333';
  const unresolvedWordId = '44444444-4444-4444-8444-444444444444';
  const createdAt = new Date('2026-03-15T00:00:00.000Z').toISOString();
  const expectedLexiconEntries = [
    {
      id: 'lex-1',
      headword: 'book',
      normalizedHeadword: 'book',
      pos: 'noun',
    },
  ];

  const fakeClient = new FakeWordsCreateClient(
    'user-1',
    new Set([projectId]),
    [
      {
        id: resolvedWordId,
        project_id: projectId,
        english: 'book',
        japanese: '本',
        lexicon_entry_id: preservedLexiconEntryId,
        distractors: [],
        part_of_speech_tags: ['noun'],
        created_at: createdAt,
        status: 'new',
        ease_factor: 2.5,
        interval_days: 0,
        repetition: 0,
        is_favorite: false,
        lexicon_entries: null,
      },
      {
        id: unresolvedWordId,
        project_id: projectId,
        english: 'compose',
        japanese: '作曲する',
        lexicon_entry_id: null,
        distractors: [],
        part_of_speech_tags: null,
        created_at: createdAt,
        status: 'new',
        ease_factor: 2.5,
        interval_days: 0,
        repetition: 0,
        is_favorite: false,
        lexicon_entries: null,
      },
    ],
  );

  let afterPromise = Promise.resolve();
  const enqueued: Array<{ source: string; wordIds: string[]; aiTranslatedWordIds?: string[] }> = [];
  const triggered: string[] = [];

  const response = await handleWordsCreatePost(
    jsonRequest({
      words: [
        {
          projectId,
          english: 'book',
          japanese: '本',
          lexiconEntryId: preservedLexiconEntryId,
          partOfSpeechTags: ['noun'],
        },
        {
          projectId,
          english: 'compose',
          japanese: '作曲する',
          japaneseSource: 'ai',
        },
      ],
    }),
    {
      createClient: async () => fakeClient as never,
      runAfter: (task) => {
        runAfterImmediately(task, (promise) => {
          afterPromise = promise;
        });
      },
      resolveImmediateWords: async (words) => createImmediateResolutionResult(words, expectedLexiconEntries),
      backfillWords: async (words) => ({
        words,
        aiBackfilledIndexes: [],
      }),
      enqueueJobs: async (source, wordIds, deps) => {
        enqueued.push({ source, wordIds, aiTranslatedWordIds: deps?.aiTranslatedWordIds });
        return ['55555555-5555-4555-8555-555555555555'];
      },
      triggerJobProcessing: async (requestUrl, jobId) => {
        void requestUrl;
        if (jobId) {
          triggered.push(jobId);
        }
      },
    },
  );

  await afterPromise;

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.deepEqual(payload.lexiconEntries, expectedLexiconEntries);
  assert.equal(payload.words.length, 2);
  assert.equal(payload.words[0].lexiconEntryId, preservedLexiconEntryId);
  assert.equal(fakeClient.insertedRows[0]?.['lexicon_entry_id'], preservedLexiconEntryId);
  assert.equal(fakeClient.insertedRows[0]?.['english'], 'book');
  assert.equal(fakeClient.insertedRows[1]?.['english'], 'compose');
  assert.deepEqual(enqueued, [
    {
      source: 'manual',
      wordIds: [unresolvedWordId],
      aiTranslatedWordIds: [unresolvedWordId],
    },
  ]);
  assert.deepEqual(triggered, []);
});

test('words/create backfills blank japanese before insert', async () => {
  const projectId = '11111111-1111-4111-8111-111111111111';
  const createdAt = new Date('2026-03-15T00:00:00.000Z').toISOString();

  const fakeClient = new FakeWordsCreateClient(
    'user-1',
    new Set([projectId]),
    [
      {
        id: '66666666-6666-4666-8666-666666666666',
        project_id: projectId,
        english: 'springboard',
        japanese: '出発点',
        lexicon_entry_id: null,
        distractors: [],
        part_of_speech_tags: ['noun'],
        created_at: createdAt,
        status: 'new',
        ease_factor: 2.5,
        interval_days: 0,
        repetition: 0,
        is_favorite: false,
        lexicon_entries: null,
      },
    ],
  );

  let afterPromise = Promise.resolve();

  const response = await handleWordsCreatePost(
    jsonRequest({
      words: [
        {
          projectId,
          english: 'springboard',
          japanese: '',
          partOfSpeechTags: ['noun'],
        },
      ],
    }),
    {
      createClient: async () => fakeClient as never,
      runAfter: (task) => {
        runAfterImmediately(task, (promise) => {
          afterPromise = promise;
        });
      },
      resolveImmediateWords: async (words) => createImmediateResolutionResult(words),
      backfillWords: async (words) => ({
        words: words.map((word) => ({
          ...word,
          japanese: word.english === 'springboard' ? '出発点' : word.japanese,
        })),
        aiBackfilledIndexes: [0],
      }),
      enqueueJobs: async () => [],
      triggerJobProcessing: async () => undefined,
    },
  );

  await afterPromise;

  assert.equal(response.status, 200);
  assert.equal(fakeClient.insertedRows[0]?.['japanese'], '出発点');
});

test('words/create skips backfill when japanese is already present without provenance', async () => {
  const projectId = '11111111-1111-4111-8111-111111111111';
  const createdAt = new Date('2026-03-15T00:00:00.000Z').toISOString();

  const fakeClient = new FakeWordsCreateClient(
    'user-1',
    new Set([projectId]),
    [
      {
        id: '77777777-7777-4777-8777-777777777777',
        project_id: projectId,
        english: 'experiment',
        japanese: '実験',
        lexicon_entry_id: null,
        distractors: [],
        part_of_speech_tags: null,
        created_at: createdAt,
        status: 'new',
        ease_factor: 2.5,
        interval_days: 0,
        repetition: 0,
        is_favorite: false,
        lexicon_entries: null,
      },
    ],
  );

  let afterPromise = Promise.resolve();
  let backfillCalled = false;
  const enqueued: Array<{ aiTranslatedWordIds?: string[] }> = [];

  const response = await handleWordsCreatePost(
    jsonRequest({
      words: [
        {
          projectId,
          english: 'experiment',
          japanese: '実験',
        },
      ],
    }),
    {
      createClient: async () => fakeClient as never,
      runAfter: (task) => {
        runAfterImmediately(task, (promise) => {
          afterPromise = promise;
        });
      },
      resolveImmediateWords: async (words) => createImmediateResolutionResult(words),
      backfillWords: async () => {
        backfillCalled = true;
        throw new Error('backfill should not be called');
      },
      enqueueJobs: async (_source, _wordIds, deps) => {
        enqueued.push({ aiTranslatedWordIds: deps?.aiTranslatedWordIds });
        return [];
      },
      triggerJobProcessing: async () => undefined,
    },
  );

  await afterPromise;

  assert.equal(response.status, 200);
  assert.equal(backfillCalled, false);
  assert.deepEqual(enqueued, [
    {
      aiTranslatedWordIds: [],
    },
  ]);
});

test('words/create uses master-first resolution before legacy backfill', async () => {
  const projectId = '99999999-1111-4111-8111-111111111111';
  const createdAt = new Date('2026-03-15T00:00:00.000Z').toISOString();

  const fakeClient = new FakeWordsCreateClient(
    'user-1',
    new Set([projectId]),
    [
      {
        id: 'aaaaaaaa-2222-4222-8222-222222222222',
        project_id: projectId,
        english: 'experiment',
        japanese: '実験',
        lexicon_entry_id: 'bbbbbbbb-3333-4333-8333-333333333333',
        distractors: [],
        part_of_speech_tags: ['noun'],
        created_at: createdAt,
        status: 'new',
        ease_factor: 2.5,
        interval_days: 0,
        repetition: 0,
        is_favorite: false,
        lexicon_entries: null,
      },
    ],
  );

  let afterPromise = Promise.resolve();
  let backfillCalled = false;

  const response = await handleWordsCreatePost(
    jsonRequest({
      words: [
        {
          projectId,
          english: 'experiment',
          japanese: '',
          partOfSpeechTags: ['noun'],
        },
      ],
    }),
    {
      createClient: async () => fakeClient as never,
      runAfter: (task) => {
        runAfterImmediately(task, (promise) => {
          afterPromise = promise;
        });
      },
      resolveImmediateWords: async (words) => createImmediateResolutionResult(
        words.map((word) => ({
          ...word,
          japanese: '実験',
          lexiconEntryId: 'bbbbbbbb-3333-4333-8333-333333333333',
        })),
      ),
      backfillWords: async () => {
        backfillCalled = true;
        throw new Error('backfill should not run after master-first resolution');
      },
      enqueueJobs: async () => [],
      triggerJobProcessing: async () => undefined,
    },
  );

  await afterPromise;

  assert.equal(response.status, 200);
  assert.equal(backfillCalled, false);
  assert.equal(fakeClient.insertedRows[0]?.['japanese'], '実験');
  assert.equal(
    fakeClient.insertedRows[0]?.['lexicon_entry_id'],
    'bbbbbbbb-3333-4333-8333-333333333333',
  );
});
