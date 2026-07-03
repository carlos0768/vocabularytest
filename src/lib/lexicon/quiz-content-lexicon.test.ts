import assert from 'node:assert/strict';
import test from 'node:test';

import type { SupabaseClient } from '@supabase/supabase-js';

import {
  fetchLexiconQuizContent,
  normalizeReusableDistractors,
  saveQuizContentToLexicon,
} from './quiz-content-lexicon';

test('normalizeReusableDistractors accepts a valid distractor set', () => {
  assert.deepEqual(
    normalizeReusableDistractors([' 確認する ', '提供する', '参加する']),
    ['確認する', '提供する', '参加する'],
  );
});

test('normalizeReusableDistractors rejects unusable values', () => {
  assert.equal(normalizeReusableDistractors(null), null);
  assert.equal(normalizeReusableDistractors('確認する'), null);
  assert.equal(normalizeReusableDistractors(['確認する', '提供する']), null);
  assert.equal(normalizeReusableDistractors(['選択肢1', '選択肢2', '選択肢3']), null);
  assert.equal(normalizeReusableDistractors(['確認する', 42, '参加する']), null);
  // Duplicates collapse below the minimum count.
  assert.equal(normalizeReusableDistractors(['確認する', '確認する', '提供する']), null);
});

interface RecordedUpdate {
  table: string;
  payload: Record<string, unknown>;
  id: string;
  guardColumn: string;
}

function createUpdateClientMock(options?: { failFor?: string }) {
  const updates: RecordedUpdate[] = [];
  const client = {
    from(table: string) {
      return {
        update(payload: Record<string, unknown>) {
          return {
            eq(_column: string, id: string) {
              return {
                is(guardColumn: string, _value: null) {
                  updates.push({ table, payload, id, guardColumn });
                  const error = options?.failFor === id ? { message: 'boom' } : null;
                  return Promise.resolve({ error });
                },
              };
            },
          };
        },
      };
    },
  };
  return { client: client as unknown as SupabaseClient, updates };
}

test('saveQuizContentToLexicon fills missing master values only', async () => {
  const { client, updates } = createUpdateClientMock();

  const result = await saveQuizContentToLexicon(
    [
      {
        lexiconEntryId: 'entry-1',
        lexiconSenseId: 'sense-1',
        pronunciation: '/əˈdæpt/',
        distractors: ['確認する', '提供する', '参加する'],
      },
      // Duplicate entry/sense ids are deduped; first value wins.
      {
        lexiconEntryId: 'entry-1',
        lexiconSenseId: 'sense-1',
        pronunciation: '/ignored/',
        distractors: ['A', 'B', 'C'],
      },
      // Missing lexicon links or unusable values are skipped.
      { pronunciation: '/no-entry/', distractors: ['A', 'B', 'C'] },
      { lexiconEntryId: 'entry-2', pronunciation: '   ' },
      { lexiconSenseId: 'sense-2', distractors: ['選択肢1', '選択肢2', '選択肢3'] },
    ],
    { supabaseAdmin: client },
  );

  assert.deepEqual(result, { pronunciationUpdated: 1, distractorsUpdated: 1, errors: 0 });
  assert.deepEqual(updates, [
    {
      table: 'lexicon_entries',
      payload: { pronunciation: '/əˈdæpt/' },
      id: 'entry-1',
      guardColumn: 'pronunciation',
    },
    {
      table: 'lexicon_senses',
      payload: { distractors: ['確認する', '提供する', '参加する'] },
      id: 'sense-1',
      guardColumn: 'distractors',
    },
  ]);
});

test('saveQuizContentToLexicon counts update errors without throwing', async () => {
  const { client } = createUpdateClientMock({ failFor: 'entry-1' });

  const result = await saveQuizContentToLexicon(
    [
      { lexiconEntryId: 'entry-1', pronunciation: '/əˈdæpt/' },
      { lexiconSenseId: 'sense-1', distractors: ['確認する', '提供する', '参加する'] },
    ],
    { supabaseAdmin: client },
  );

  assert.deepEqual(result, { pronunciationUpdated: 0, distractorsUpdated: 1, errors: 1 });
});

test('saveQuizContentToLexicon skips DB access when nothing is reusable', async () => {
  const client = {
    from() {
      throw new Error('should not be called');
    },
  } as unknown as SupabaseClient;

  const result = await saveQuizContentToLexicon(
    [{ lexiconEntryId: 'entry-1', distractors: [] }],
    { supabaseAdmin: client },
  );

  assert.deepEqual(result, { pronunciationUpdated: 0, distractorsUpdated: 0, errors: 0 });
});

function createSelectClientMock(rows: {
  entries: Array<{ id: string; pronunciation: unknown }>;
  senses: Array<{ id: string; distractors: unknown }>;
}) {
  const queried: Array<{ table: string; ids: string[] }> = [];
  const client = {
    from(table: string) {
      return {
        select(_columns: string) {
          return {
            in(_column: string, ids: string[]) {
              queried.push({ table, ids });
              return {
                not(_notColumn: string, _op: string, _value: null) {
                  const data = table === 'lexicon_entries' ? rows.entries : rows.senses;
                  return Promise.resolve({ data, error: null });
                },
              };
            },
          };
        },
      };
    },
  };
  return { client: client as unknown as SupabaseClient, queried };
}

test('fetchLexiconQuizContent returns reusable pronunciation and distractors', async () => {
  const { client, queried } = createSelectClientMock({
    entries: [
      { id: 'entry-1', pronunciation: '/əˈdæpt/' },
      { id: 'entry-2', pronunciation: '   ' },
    ],
    senses: [
      { id: 'sense-1', distractors: ['確認する', '提供する', '参加する'] },
      { id: 'sense-2', distractors: ['選択肢1', '選択肢2', '選択肢3'] },
    ],
  });

  const lookup = await fetchLexiconQuizContent(
    {
      entryIds: ['entry-1', 'entry-2', 'entry-1', null, undefined],
      senseIds: ['sense-1', 'sense-2'],
    },
    { client },
  );

  assert.deepEqual(queried, [
    { table: 'lexicon_entries', ids: ['entry-1', 'entry-2'] },
    { table: 'lexicon_senses', ids: ['sense-1', 'sense-2'] },
  ]);
  assert.deepEqual(Array.from(lookup.pronunciationByEntryId.entries()), [
    ['entry-1', '/əˈdæpt/'],
  ]);
  assert.deepEqual(Array.from(lookup.distractorsBySenseId.entries()), [
    ['sense-1', ['確認する', '提供する', '参加する']],
  ]);
});

test('fetchLexiconQuizContent skips DB access without ids', async () => {
  const client = {
    from() {
      throw new Error('should not be called');
    },
  } as unknown as SupabaseClient;

  const lookup = await fetchLexiconQuizContent({ entryIds: [], senseIds: [null] }, { client });
  assert.equal(lookup.pronunciationByEntryId.size, 0);
  assert.equal(lookup.distractorsBySenseId.size, 0);
});
