import test from 'node:test';
import assert from 'node:assert/strict';

import type { Project, Word } from '@/types';
import type { SyncQueueItem } from './dexie';
import { SyncQueue, type SyncQueueDependencies } from './sync-queue';

const CREATED_AT = '2026-05-09T00:00:00.000Z';

function makeProject(id: string): Project {
  return {
    id,
    userId: 'user_123',
    title: `Project ${id}`,
    sourceLabels: [],
    createdAt: CREATED_AT,
  };
}

function makeWord(id: string, projectId = 'project_1'): Word {
  return {
    id,
    projectId,
    english: `word-${id}`,
    japanese: `Japanese ${id}`,
    distractors: [],
    status: 'new',
    createdAt: CREATED_AT,
    easeFactor: 2.5,
    intervalDays: 0,
    repetition: 0,
    isFavorite: false,
  };
}

class FakeSyncQueueTable {
  readonly deletedIds: number[] = [];
  readonly updateCalls: Array<{ id: number; changes: Partial<SyncQueueItem> }> = [];
  private nextId = 100;

  constructor(private items: SyncQueueItem[]) {}

  async add(item: Omit<SyncQueueItem, 'id'>): Promise<number> {
    const id = this.nextId++;
    this.items.push({ ...item, id });
    return id;
  }

  async toArray(): Promise<SyncQueueItem[]> {
    return this.items.map((item) => ({ ...item }));
  }

  async delete(id: number): Promise<void> {
    this.deletedIds.push(id);
    this.items = this.items.filter((item) => item.id !== id);
  }

  async get(id: number): Promise<SyncQueueItem | undefined> {
    return this.items.find((item) => item.id === id);
  }

  async update(id: number, changes: Partial<SyncQueueItem>): Promise<number> {
    this.updateCalls.push({ id, changes });
    const item = this.items.find((candidate) => candidate.id === id);
    if (!item) return 0;
    Object.assign(item, changes);
    return 1;
  }

  async clear(): Promise<void> {
    this.items = [];
  }

  getItems(): SyncQueueItem[] {
    return this.items.map((item) => ({ ...item }));
  }
}

function makeItem(
  id: number,
  operation: SyncQueueItem['operation'],
  table: SyncQueueItem['table'],
  data: unknown,
  retryCount = 0,
): SyncQueueItem {
  return {
    id,
    operation,
    table,
    entityId: typeof data === 'object' && data !== null && 'id' in data
      ? String((data as { id: unknown }).id)
      : `entity_${id}`,
    data,
    createdAt: CREATED_AT,
    retryCount,
  };
}

function makeRemoteRepository(
  calls: string[],
  overrides: Partial<SyncQueueDependencies['remoteRepository']> = {},
): SyncQueueDependencies['remoteRepository'] {
  return {
    createProjectWithId: async (project) => {
      calls.push(`project:create:${project.id}`);
    },
    updateProject: async (id) => {
      calls.push(`project:update:${id}`);
    },
    deleteProject: async (id) => {
      calls.push(`project:delete:${id}`);
    },
    createWordsWithIds: async (words) => {
      calls.push(`word:create:${words.map((word) => word.id).join(',')}`);
    },
    updateWord: async (id) => {
      calls.push(`word:update:${id}`);
    },
    deleteWord: async (id) => {
      calls.push(`word:delete:${id}`);
    },
    ...overrides,
  };
}

function makeQueue(
  items: SyncQueueItem[],
  remoteRepository: SyncQueueDependencies['remoteRepository'],
): { queue: SyncQueue; table: FakeSyncQueueTable } {
  const table = new FakeSyncQueueTable(items);
  const queue = new SyncQueue({
    getDb: () => ({ syncQueue: table }) as unknown as ReturnType<SyncQueueDependencies['getDb']>,
    remoteRepository,
  });

  return { queue, table };
}

test('process applies create, update, and delete operations in queue order', async () => {
  const calls: string[] = [];
  const remoteRepository = makeRemoteRepository(calls);
  const project = makeProject('project_1');
  const word = makeWord('word_1', project.id);
  const { queue, table } = makeQueue(
    [
      makeItem(1, 'create', 'projects', project),
      makeItem(2, 'update', 'projects', { id: project.id, updates: { title: 'Updated' } }),
      makeItem(3, 'delete', 'projects', { id: project.id }),
      makeItem(4, 'create', 'words', word),
      makeItem(5, 'update', 'words', { id: word.id, updates: { status: 'review' } }),
      makeItem(6, 'delete', 'words', { id: word.id }),
    ],
    remoteRepository,
  );

  const result = await queue.process();

  assert.deepEqual(calls, [
    'project:create:project_1',
    'project:update:project_1',
    'project:delete:project_1',
    'word:create:word_1',
    'word:update:word_1',
    'word:delete:word_1',
  ]);
  assert.deepEqual(table.deletedIds, [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(result, { success: 6, failed: 0 });
});

test('process increments retryCount when an item fails', async () => {
  const calls: string[] = [];
  const remoteRepository = makeRemoteRepository(calls, {
    updateProject: async (id) => {
      calls.push(`project:update:${id}`);
      throw new Error('remote update failed');
    },
  });
  const { queue, table } = makeQueue(
    [makeItem(10, 'update', 'projects', { id: 'project_1', updates: { title: 'Updated' } }, 1)],
    remoteRepository,
  );

  const result = await queue.process();

  assert.deepEqual(calls, ['project:update:project_1']);
  assert.deepEqual(table.deletedIds, []);
  assert.deepEqual(table.updateCalls, [{ id: 10, changes: { retryCount: 2 } }]);
  assert.equal(table.getItems()[0]?.retryCount, 2);
  assert.deepEqual(result, { success: 0, failed: 1 });
});

test('process drops items whose retryCount is already at the retry limit', async () => {
  const calls: string[] = [];
  const remoteRepository = makeRemoteRepository(calls);
  const { queue, table } = makeQueue(
    [makeItem(20, 'delete', 'projects', { id: 'project_1' }, 3)],
    remoteRepository,
  );

  const result = await queue.process();

  assert.deepEqual(calls, []);
  assert.deepEqual(table.deletedIds, [20]);
  assert.deepEqual(table.updateCalls, []);
  assert.deepEqual(result, { success: 0, failed: 1 });
});

test('process removes only successful items from the queue', async () => {
  const calls: string[] = [];
  const remoteRepository = makeRemoteRepository(calls, {
    updateWord: async (id) => {
      calls.push(`word:update:${id}`);
      throw new Error('remote word update failed');
    },
  });
  const project = makeProject('project_1');
  const word = makeWord('word_1', project.id);
  const { queue, table } = makeQueue(
    [
      makeItem(31, 'create', 'projects', project),
      makeItem(32, 'update', 'words', { id: word.id, updates: { status: 'review' } }),
      makeItem(33, 'delete', 'projects', { id: project.id }),
    ],
    remoteRepository,
  );

  const result = await queue.process();

  assert.deepEqual(calls, [
    'project:create:project_1',
    'word:update:word_1',
    'project:delete:project_1',
  ]);
  assert.deepEqual(table.deletedIds, [31, 33]);
  assert.deepEqual(table.updateCalls, [{ id: 32, changes: { retryCount: 1 } }]);
  assert.deepEqual(table.getItems().map((item) => item.id), [32]);
  assert.deepEqual(result, { success: 2, failed: 1 });
});
