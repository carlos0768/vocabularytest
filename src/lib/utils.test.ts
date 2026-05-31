import test from 'node:test';
import assert from 'node:assert/strict';
import { clearAllUserStats } from './utils';

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
