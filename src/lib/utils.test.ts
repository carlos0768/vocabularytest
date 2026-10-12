import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSingleLineEnvValue, readSingleLineEnv } from './env';
import { chunkArray, clearAllUserStats, isRecord, sleep, toStringArray } from './utils';

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return Array.from(this.values.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

test('clearAllUserStats removes all local learning stats', () => {
  const previousWindow = globalThis.window;
  const previousLocalStorage = globalThis.localStorage;
  const storage = new MemoryStorage();

  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { localStorage: storage },
  });
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: storage,
  });

  try {
    for (const key of [
      'scanvocab_daily_stats',
      'scanvocab_weekly_stats',
      'scanvocab_streak',
      'scanvocab_last_activity',
      'scanvocab_wrong_answers',
      'scanvocab_activity_history',
    ]) {
      storage.setItem(key, 'value');
    }

    clearAllUserStats();

    assert.equal(storage.length, 0);
  } finally {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: previousWindow,
    });
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: previousLocalStorage,
    });
  }
});

test('normalizeSingleLineEnvValue removes literal and actual newlines from token env values', () => {
  assert.equal(normalizeSingleLineEnvValue('  key-value\\n'), 'key-value');
  assert.equal(normalizeSingleLineEnvValue('key-value\n'), 'key-value');
  assert.equal(normalizeSingleLineEnvValue('key\r\nvalue'), 'keyvalue');
  assert.equal(normalizeSingleLineEnvValue(undefined), '');
});

test('readSingleLineEnv reads normalized values from an env map', () => {
  assert.equal(
    readSingleLineEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', {
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key\\n',
    }),
    'anon-key',
  );
});

test('isRecord accepts objects and arrays but rejects null and primitives', () => {
  assert.equal(isRecord({}), true);
  assert.equal(isRecord([]), true);
  assert.equal(isRecord(null), false);
  assert.equal(isRecord(undefined), false);
  assert.equal(isRecord('x'), false);
  assert.equal(isRecord(1), false);
});

test('chunkArray splits items into fixed-size chunks with a shorter tail', () => {
  assert.deepEqual(chunkArray([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  assert.deepEqual(chunkArray([1, 2], 5), [[1, 2]]);
  assert.deepEqual(chunkArray([], 3), []);
});

test('toStringArray keeps non-blank strings and drops everything else', () => {
  assert.deepEqual(toStringArray(['a', ' ', '', 1, null, ' b ']), ['a', ' b ']);
  assert.deepEqual(toStringArray('a'), []);
  assert.deepEqual(toStringArray(undefined), []);
});

test('sleep resolves after the given delay', async () => {
  const startedAt = Date.now();
  await sleep(20);
  assert.ok(Date.now() - startedAt >= 15);
});
