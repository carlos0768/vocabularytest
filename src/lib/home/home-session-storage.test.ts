import test from 'node:test';
import assert from 'node:assert/strict';

import {
  HOME_SESSION_STORAGE_KEYS,
  clearHomeGeneratingWordbook,
  clearLegacyHomeProjectId,
  consumeHomeGeneratingWordbook,
  getHomeSelectedProjectId,
  saveHomeSelectedProjectId,
  type HomeSessionStorage,
} from './home-session-storage';

class MemoryStorage implements HomeSessionStorage {
  readonly removedKeys: string[] = [];
  private readonly values = new Map<string, string>();

  constructor(initialValues: Record<string, string> = {}) {
    for (const [key, value] of Object.entries(initialValues)) {
      this.values.set(key, value);
    }
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.removedKeys.push(key);
    this.values.delete(key);
  }

  entries(): Record<string, string> {
    return Object.fromEntries(this.values.entries());
  }
}

test('saveHomeSelectedProjectId stores the selected project id', () => {
  const storage = new MemoryStorage();

  saveHomeSelectedProjectId(storage, 'project-1');

  assert.equal(storage.getItem(HOME_SESSION_STORAGE_KEYS.selectedProjectId), 'project-1');
});

test('getHomeSelectedProjectId reads the selected project id', () => {
  const storage = new MemoryStorage({
    [HOME_SESSION_STORAGE_KEYS.selectedProjectId]: 'project-2',
  });

  assert.equal(getHomeSelectedProjectId(storage), 'project-2');
});

test('getHomeSelectedProjectId returns null when no selected project id exists', () => {
  const storage = new MemoryStorage();

  assert.equal(getHomeSelectedProjectId(storage), null);
});

test('consumeHomeGeneratingWordbook removes a valid payload after reading it', () => {
  const payload = {
    id: 'generating-1',
    title: 'New Wordbook',
    iconDataUrl: 'data:image/png;base64,icon',
    linkedJobId: 'job-1',
  };
  const storage = new MemoryStorage({
    [HOME_SESSION_STORAGE_KEYS.generatingWordbook]: JSON.stringify(payload),
  });

  assert.deepEqual(consumeHomeGeneratingWordbook(storage), payload);
  assert.equal(storage.getItem(HOME_SESSION_STORAGE_KEYS.generatingWordbook), null);
  assert.deepEqual(storage.removedKeys, [HOME_SESSION_STORAGE_KEYS.generatingWordbook]);
});

test('consumeHomeGeneratingWordbook treats invalid JSON as null and removes it', () => {
  const storage = new MemoryStorage({
    [HOME_SESSION_STORAGE_KEYS.generatingWordbook]: '{invalid',
  });

  assert.equal(consumeHomeGeneratingWordbook(storage), null);
  assert.equal(storage.getItem(HOME_SESSION_STORAGE_KEYS.generatingWordbook), null);
  assert.deepEqual(storage.removedKeys, [HOME_SESSION_STORAGE_KEYS.generatingWordbook]);
});

test('consumeHomeGeneratingWordbook treats payload without a title as null', () => {
  const storage = new MemoryStorage({
    [HOME_SESSION_STORAGE_KEYS.generatingWordbook]: JSON.stringify({ id: 'generating-1' }),
  });

  assert.equal(consumeHomeGeneratingWordbook(storage), null);
  assert.equal(storage.getItem(HOME_SESSION_STORAGE_KEYS.generatingWordbook), null);
});

test('clearHomeGeneratingWordbook removes only the generating wordbook key', () => {
  const storage = new MemoryStorage({
    [HOME_SESSION_STORAGE_KEYS.generatingWordbook]: '{"title":"New Wordbook"}',
    [HOME_SESSION_STORAGE_KEYS.selectedProjectId]: 'project-1',
  });

  clearHomeGeneratingWordbook(storage);

  assert.deepEqual(storage.entries(), {
    [HOME_SESSION_STORAGE_KEYS.selectedProjectId]: 'project-1',
  });
  assert.deepEqual(storage.removedKeys, [HOME_SESSION_STORAGE_KEYS.generatingWordbook]);
});

test('clearLegacyHomeProjectId removes only the legacy project id key', () => {
  const storage = new MemoryStorage({
    [HOME_SESSION_STORAGE_KEYS.legacyProjectId]: 'legacy-project',
    [HOME_SESSION_STORAGE_KEYS.selectedProjectId]: 'project-1',
  });

  clearLegacyHomeProjectId(storage);

  assert.deepEqual(storage.entries(), {
    [HOME_SESSION_STORAGE_KEYS.selectedProjectId]: 'project-1',
  });
  assert.deepEqual(storage.removedKeys, [HOME_SESSION_STORAGE_KEYS.legacyProjectId]);
});
