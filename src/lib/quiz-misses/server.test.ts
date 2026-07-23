import assert from 'node:assert/strict';
import test from 'node:test';

import { aggregateUserMissedWords, normalizeMissKey, recordQuizWordMiss } from './server';

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

test('aggregateUserMissedWords counts misses per word and sorts by count then recency', () => {
  // newest-first, as queried with ORDER BY created_at DESC
  const rows = [
    { english_key: 'ubiquitous', english: 'ubiquitous', japanese: '遍在する', created_at: '2026-07-22T10:00:00Z' },
    { english_key: 'take off', english: 'take off', japanese: '離陸する', created_at: '2026-07-22T09:00:00Z' },
    { english_key: 'ubiquitous', english: 'Ubiquitous', japanese: 'どこにでもある', created_at: '2026-07-21T09:00:00Z' },
    { english_key: 'resilient', english: 'resilient', japanese: '回復力のある', created_at: '2026-07-20T09:00:00Z' },
  ];

  const aggregated = aggregateUserMissedWords(rows);

  assert.deepEqual(aggregated.map((w) => w.english), ['ubiquitous', 'take off', 'resilient']);
  assert.equal(aggregated[0].missCount, 2);
  // 最初に出現した行(=最新の誤答)の表記と日時を採用する
  assert.equal(aggregated[0].japanese, '遍在する');
  assert.equal(aggregated[0].lastMissedAt, '2026-07-22T10:00:00Z');
  // 同回数(1回)同士は新しい誤答が先
  assert.equal(aggregated[1].lastMissedAt, '2026-07-22T09:00:00Z');
});

test('aggregateUserMissedWords falls back to english when english_key is empty and skips blank rows', () => {
  const rows = [
    { english_key: '', english: 'Take   Off', japanese: '離陸する', created_at: '2026-07-22T09:00:00Z' },
    { english_key: '', english: 'take off', japanese: '離陸する', created_at: '2026-07-21T09:00:00Z' },
    { english_key: '', english: '  ', japanese: 'x', created_at: '2026-07-20T09:00:00Z' },
  ];

  const aggregated = aggregateUserMissedWords(rows);
  assert.equal(aggregated.length, 1);
  assert.equal(aggregated[0].missCount, 2);
});
