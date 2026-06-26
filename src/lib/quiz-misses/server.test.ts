import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeMissKey, recordQuizWordMiss } from './server';

test('normalizeMissKey lowercases and collapses whitespace', () => {
  assert.equal(normalizeMissKey('  Take   OFF '), 'take off');
  assert.equal(normalizeMissKey('Ubiquitous'), 'ubiquitous');
});

test('recordQuizWordMiss inserts a normalized miss row', async () => {
  let inserted: Record<string, unknown> | null = null;
  const admin = {
    from() {
      return {
        insert(row: Record<string, unknown>) {
          inserted = row;
          return Promise.resolve({ error: null });
        },
      };
    },
  } as never;

  const result = await recordQuizWordMiss(
    'user-1',
    { wordId: 'w1', projectId: 'p1', english: 'Take Off', japanese: '離陸する' },
    admin,
  );

  assert.equal(result.recorded, true);
  assert.ok(inserted);
  assert.equal((inserted as Record<string, unknown>).english_key, 'take off');
  assert.equal((inserted as Record<string, unknown>).user_id, 'user-1');
});

test('recordQuizWordMiss degrades gracefully when the table is missing', async () => {
  const admin = {
    from() {
      return {
        insert() {
          return Promise.resolve({ error: { code: '42P01', message: 'relation "quiz_word_misses" does not exist' } });
        },
      };
    },
  } as never;

  const result = await recordQuizWordMiss('user-1', { english: 'x', japanese: 'y' }, admin);
  assert.equal(result.recorded, false);
});
