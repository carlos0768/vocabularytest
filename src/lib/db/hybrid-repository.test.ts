import test from 'node:test';
import assert from 'node:assert/strict';
import type { Project, Word } from '@/types';
import type { SyncQueueItem } from './dexie';
import {
  FULL_SYNC_INTERVAL_MS,
  HybridWordRepository,
  shouldRunFullSync,
  type HybridRepositoryDependencies,
} from './hybrid-repository';

const USER_ID = 'user_123';
const FIXED_NOW = new Date('2026-02-08T12:00:00.000Z').getTime();
const CREATED_AT = '2026-05-09T00:00:00.000Z';

function makeProject(id: string, userId = USER_ID): Project {
  return {
    id,
    userId,
    title: `Project ${id}`,
    sourceLabels: [],
    createdAt: CREATED_AT,
  };
}

function makeWord(id: string, projectId: string): Word {
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

class FakeLocalStorage implements Storage {
  private values = new Map<string, string>();

  constructor(initial: Record<string, string> = {}) {
    for (const [key, value] of Object.entries(initial)) {
      this.values.set(key, value);
    }
  }

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
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

function installLocalStorage(initial: Record<string, string> = {}): {
  storage: FakeLocalStorage;
  restore: () => void;
} {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const storage = new FakeLocalStorage(initial);

  Object.defineProperty(globalThis, 'localStorage', {
    value: storage,
    configurable: true,
  });

  return {
    storage,
    restore: () => {
      if (descriptor) {
        Object.defineProperty(globalThis, 'localStorage', descriptor);
      } else {
        delete (globalThis as Record<string, unknown>).localStorage;
      }
    },
  };
}

class FakeEntityTable<T extends { id: string }> {
  readonly deleteCalls: Array<{ field: string; values: unknown[] }> = [];
  readonly bulkPutCalls: T[][] = [];
  readonly bulkDeleteCalls: string[][] = [];
  clearCalls = 0;

  constructor(private rows: T[]) {}

  where(field: string): {
    equals: (value: unknown) => {
      toArray: () => Promise<T[]>;
      delete: () => Promise<number>;
    };
    anyOf: (values: unknown[]) => {
      delete: () => Promise<number>;
      primaryKeys: () => Promise<string[]>;
    };
  } {
    return {
      equals: (value) => ({
        toArray: async () => this.rows.filter((row) => this.valueOf(row, field) === value),
        delete: async () => this.deleteWhere(field, [value]),
      }),
      anyOf: (values) => ({
        delete: async () => this.deleteWhere(field, values),
        primaryKeys: async () => this.rows
          .filter((row) => values.includes(this.valueOf(row, field)))
          .map((row) => row.id),
      }),
    };
  }

  async bulkPut(rows: T[]): Promise<void> {
    this.bulkPutCalls.push(rows.map((row) => ({ ...row })));
    for (const row of rows) {
      const existingIndex = this.rows.findIndex((candidate) => candidate.id === row.id);
      if (existingIndex >= 0) {
        this.rows[existingIndex] = row;
      } else {
        this.rows.push(row);
      }
    }
  }

  async bulkDelete(ids: string[]): Promise<void> {
    this.bulkDeleteCalls.push([...ids]);
    this.rows = this.rows.filter((row) => !ids.includes(row.id));
  }

  async clear(): Promise<void> {
    this.clearCalls += 1;
    this.rows = [];
  }

  getRows(): T[] {
    return this.rows.map((row) => ({ ...row }));
  }

  private async deleteWhere(field: string, values: unknown[]): Promise<number> {
    this.deleteCalls.push({ field, values: [...values] });
    const before = this.rows.length;
    this.rows = this.rows.filter((row) => !values.includes(this.valueOf(row, field)));
    return before - this.rows.length;
  }

  private valueOf(row: T, field: string): unknown {
    return (row as Record<string, unknown>)[field];
  }
}

function makeDb(projects: Project[], words: Word[]): {
  db: ReturnType<HybridRepositoryDependencies['getDb']>;
  projectsTable: FakeEntityTable<Project>;
  wordsTable: FakeEntityTable<Word>;
  lexiconEntriesTable: FakeEntityTable<{ id: string }>;
} {
  const projectsTable = new FakeEntityTable(projects);
  const wordsTable = new FakeEntityTable(words);
  const lexiconEntriesTable = new FakeEntityTable<{ id: string }>([]);

  return {
    db: {
      projects: projectsTable,
      words: wordsTable,
      lexiconEntries: lexiconEntriesTable,
    } as unknown as ReturnType<HybridRepositoryDependencies['getDb']>,
    projectsTable,
    wordsTable,
    lexiconEntriesTable,
  };
}

function makeRemoteRepository(options: {
  getProjectsResponses: Project[][];
  remoteWords?: Word[];
  calls?: string[];
}): HybridRepositoryDependencies['remoteRepository'] {
  let getProjectsIndex = 0;
  const calls = options.calls ?? [];
  const remoteWords = options.remoteWords ?? [];

  return {
    createProjectWithId: async (project) => {
      calls.push(`createProjectWithId:${project.id}`);
    },
    createWordsWithIds: async (words) => {
      calls.push(`createWordsWithIds:${words.map((word) => word.id).join(',')}`);
    },
    getProjects: async (userId) => {
      calls.push(`getProjects:${userId}`);
      const response = options.getProjectsResponses[Math.min(getProjectsIndex, options.getProjectsResponses.length - 1)] ?? [];
      getProjectsIndex += 1;
      return response;
    },
    getProjectIds: async (userId) => {
      calls.push(`getProjectIds:${userId}`);
      return [];
    },
    getProjectsUpdatedSince: async (userId) => {
      calls.push(`getProjectsUpdatedSince:${userId}`);
      return [];
    },
    getAllWordsByProjectIds: async (projectIds) => {
      calls.push(`getAllWordsByProjectIds:${projectIds.join(',')}`);
      return Object.fromEntries(
        projectIds.map((projectId) => [
          projectId,
          remoteWords.filter((word) => word.projectId === projectId),
        ]),
      );
    },
    getWordsUpdatedSince: async (projectIds) => {
      calls.push(`getWordsUpdatedSince:${projectIds.join(',')}`);
      return [];
    },
    getWordIdsByProjectIds: async (projectIds) => {
      calls.push(`getWordIdsByProjectIds:${projectIds.join(',')}`);
      return [];
    },
    getLexiconEntriesByIds: async (ids) => {
      calls.push(`getLexiconEntriesByIds:${ids.join(',')}`);
      return [];
    },
    updateProject: async (id) => {
      calls.push(`updateProject:${id}`);
    },
    deleteProject: async (id) => {
      calls.push(`deleteProject:${id}`);
    },
    updateWord: async (id) => {
      calls.push(`updateWord:${id}`);
    },
    deleteWord: async (id) => {
      calls.push(`deleteWord:${id}`);
    },
    deleteWordsByProject: async (projectId) => {
      calls.push(`deleteWordsByProject:${projectId}`);
    },
  };
}

function makeSyncQueue(pending: SyncQueueItem[]): HybridRepositoryDependencies['syncQueue'] & {
  clearCalls: number;
} {
  const queue = {
    clearCalls: 0,
    add: async () => {},
    clear: async () => {
      queue.clearCalls += 1;
    },
    getPending: async () => pending,
    process: async () => ({ success: 0, failed: 0 }),
  };
  return queue;
}

function makeRepository(dependencies: Omit<HybridRepositoryDependencies, 'isOnline' | 'now'>): HybridWordRepository {
  return new HybridWordRepository({
    ...dependencies,
    isOnline: () => true,
    now: () => FIXED_NOW,
  });
}

test('shouldRunFullSync returns true when synced user differs', () => {
  const run = shouldRunFullSync(FIXED_NOW, 'other_user', USER_ID, FIXED_NOW);
  assert.equal(run, true);
});

test('shouldRunFullSync returns true when lastSync is missing', () => {
  const run = shouldRunFullSync(null, USER_ID, USER_ID, FIXED_NOW);
  assert.equal(run, true);
});

test('shouldRunFullSync returns false within 1 hour for same user', () => {
  const thirtyMinutesAgo = FIXED_NOW - 30 * 60 * 1000;
  const run = shouldRunFullSync(thirtyMinutesAgo, USER_ID, USER_ID, FIXED_NOW);
  assert.equal(run, false);
});

test('shouldRunFullSync returns true after 1 hour for same user', () => {
  const twoHoursAgo = FIXED_NOW - 2 * 60 * 60 * 1000;
  const run = shouldRunFullSync(twoHoursAgo, USER_ID, USER_ID, FIXED_NOW);
  assert.equal(run, true);
});

test('FULL_SYNC_INTERVAL_MS is fixed to 1 hour', () => {
  assert.equal(FULL_SYNC_INTERVAL_MS, 60 * 60 * 1000);
});

test('fullSync does not delete local data when remote is empty and local data exists', async (t) => {
  const { storage, restore } = installLocalStorage();
  t.after(restore);

  const localProject = makeProject('local_project');
  const localWord = makeWord('local_word', localProject.id);
  const { db, projectsTable, wordsTable } = makeDb([localProject], [localWord]);
  const calls: string[] = [];
  const syncQueue = makeSyncQueue([]);
  const repository = makeRepository({
    getDb: () => db,
    remoteRepository: makeRemoteRepository({ getProjectsResponses: [[]], calls }),
    syncQueue,
  });

  await repository.fullSync(USER_ID);

  assert.deepEqual(calls, ['getProjects:user_123']);
  assert.deepEqual(projectsTable.deleteCalls, []);
  assert.deepEqual(wordsTable.deleteCalls, []);
  assert.deepEqual(projectsTable.getRows(), [localProject]);
  assert.deepEqual(wordsTable.getRows(), [localWord]);
  assert.equal(syncQueue.clearCalls, 0);
  assert.equal(storage.getItem('scanvocab_sync_user'), USER_ID);
  assert.equal(storage.getItem('scanvocab_last_sync'), String(FIXED_NOW));
});

test('fullSync pushes pending create local-only projects before replacing local cache', async (t) => {
  const { restore } = installLocalStorage();
  t.after(restore);

  const localProject = makeProject('local_project');
  const localWord = makeWord('local_word', localProject.id);
  const { db, projectsTable, wordsTable } = makeDb([localProject], [localWord]);
  const calls: string[] = [];
  const syncQueue = makeSyncQueue([
    {
      id: 1,
      operation: 'create',
      table: 'projects',
      entityId: localProject.id,
      data: localProject,
      createdAt: CREATED_AT,
      retryCount: 0,
    },
  ]);
  const repository = makeRepository({
    getDb: () => db,
    remoteRepository: makeRemoteRepository({
      getProjectsResponses: [[], [localProject]],
      remoteWords: [localWord],
      calls,
    }),
    syncQueue,
  });

  await repository.fullSync(USER_ID);

  assert.deepEqual(calls, [
    'getProjects:user_123',
    'createProjectWithId:local_project',
    'createWordsWithIds:local_word',
    'getProjects:user_123',
    'getAllWordsByProjectIds:local_project',
  ]);
  assert.deepEqual(projectsTable.deleteCalls, [{ field: 'userId', values: [USER_ID] }]);
  assert.deepEqual(wordsTable.deleteCalls, [{ field: 'projectId', values: [localProject.id] }]);
  assert.deepEqual(projectsTable.bulkPutCalls, [[localProject]]);
  assert.deepEqual(wordsTable.bulkPutCalls, [[localWord]]);
  assert.equal(syncQueue.clearCalls, 1);
});

test('fullSync chooses the full sync path when the synced user changes', async (t) => {
  const { storage, restore } = installLocalStorage({
    scanvocab_last_sync: String(FIXED_NOW - 10 * 60 * 1000),
    scanvocab_sync_user: 'other_user',
  });
  t.after(restore);

  const remoteProject = makeProject('remote_project');
  const { db } = makeDb([], []);
  const calls: string[] = [];
  const syncQueue = makeSyncQueue([]);
  const repository = makeRepository({
    getDb: () => db,
    remoteRepository: makeRemoteRepository({
      getProjectsResponses: [[remoteProject]],
      calls,
    }),
    syncQueue,
  });

  await repository.fullSync(USER_ID);

  assert.equal(calls.includes('getProjects:user_123'), true);
  assert.equal(calls.some((call) => call.startsWith('getProjectIds:')), false);
  assert.equal(storage.getItem('scanvocab_sync_user'), USER_ID);
  assert.equal(storage.getItem('scanvocab_last_sync'), String(FIXED_NOW));
});
