import test from 'node:test';
import assert from 'node:assert/strict';
import type { Project, Word } from '@/types';
import {
  buildProjectStats,
  getWordsByProjectMap,
  mergeProjectsById,
} from './load-helpers';

function createProject(id: string): Project {
  return {
    id,
    userId: 'user_123',
    title: `Project ${id}`,
    createdAt: '2026-02-01T00:00:00.000Z',
    sourceLabels: [],
  };
}

let wordCounter = 0;

function createWord(projectId: string, status: Word['status'] = 'new', overrides: Partial<Word> = {}): Word {
  wordCounter += 1;
  return {
    id: `${projectId}_${status}_${wordCounter}`,
    projectId,
    english: 'example',
    japanese: '例',
    distractors: ['a', 'b', 'c'],
    status,
    createdAt: '2026-02-01T00:00:00.000Z',
    easeFactor: 2.5,
    intervalDays: 0,
    repetition: 0,
    isFavorite: false,
    ...overrides,
  };
}

test('getWordsByProjectMap prioritizes getAllWordsByProjectIds', async () => {
  const calls: string[] = [];
  const repo = {
    getWords: async (projectId: string) => {
      calls.push(`single:${projectId}`);
      return [];
    },
    getAllWordsByProjectIds: async (projectIds: string[]) => {
      calls.push(`bulk-remote:${projectIds.join(',')}`);
      return {
        p1: [createWord('p1', 'mastered')],
      };
    },
    getAllWordsByProject: async (projectIds: string[]) => {
      assert.equal(projectIds.length, 2);
      calls.push('bulk-local');
      return {};
    },
  };

  const result = await getWordsByProjectMap(repo, ['p1', 'p2']);

  assert.deepEqual(calls, ['bulk-remote:p1,p2']);
  assert.equal(result.p1.length, 1);
  assert.deepEqual(result.p2, []);
});

test('getWordsByProjectMap uses getAllWordsByProject for local repository', async () => {
  const calls: string[] = [];
  const repo = {
    getWords: async (projectId: string) => {
      calls.push(`single:${projectId}`);
      return [];
    },
    getAllWordsByProject: async (projectIds: string[]) => {
      calls.push(`bulk-local:${projectIds.join(',')}`);
      return {
        p1: [createWord('p1', 'new')],
        p2: [createWord('p2', 'review')],
      };
    },
  };

  const result = await getWordsByProjectMap(repo, ['p1', 'p2']);

  assert.deepEqual(calls, ['bulk-local:p1,p2']);
  assert.equal(result.p1.length, 1);
  assert.equal(result.p2.length, 1);
});

test('getWordsByProjectMap falls back from remote bulk to local bulk when available', async () => {
  const calls: string[] = [];
  const repo = {
    getWords: async (projectId: string) => {
      calls.push(`single:${projectId}`);
      return [];
    },
    getAllWordsByProjectIds: async (projectIds: string[]) => {
      calls.push(`bulk-remote:${projectIds.join(',')}`);
      throw new Error('remote relation failed');
    },
    getAllWordsByProject: async (projectIds: string[]) => {
      calls.push(`bulk-local:${projectIds.join(',')}`);
      return {
        p1: [createWord('p1', 'mastered')],
      };
    },
  };

  const result = await getWordsByProjectMap(repo, ['p1', 'p2']);

  assert.deepEqual(calls, ['bulk-remote:p1,p2', 'bulk-local:p1,p2']);
  assert.equal(result.p1.length, 1);
  assert.deepEqual(result.p2, []);
});

test('getWordsByProjectMap keeps project keys when all bulk and one project load fail', async () => {
  const calls: string[] = [];
  const repo = {
    getWords: async (projectId: string) => {
      calls.push(`single:${projectId}`);
      if (projectId === 'p2') throw new Error('single project failed');
      return [createWord(projectId, 'new')];
    },
    getAllWordsByProjectIds: async (projectIds: string[]) => {
      calls.push(`bulk-remote:${projectIds.join(',')}`);
      throw new Error('remote bulk failed');
    },
    getAllWordsByProject: async (projectIds: string[]) => {
      calls.push(`bulk-local:${projectIds.join(',')}`);
      throw new Error('local bulk failed');
    },
  };

  const result = await getWordsByProjectMap(repo, ['p1', 'p2']);

  assert.deepEqual(calls, ['bulk-remote:p1,p2', 'bulk-local:p1,p2', 'single:p1', 'single:p2']);
  assert.equal(result.p1.length, 1);
  assert.deepEqual(result.p2, []);
});

test('buildProjectStats calculates totals/mastered/progress correctly', () => {
  const projects = [createProject('p1'), createProject('p2')];
  const wordsByProject: Record<string, Word[]> = {
    p1: [
      createWord('p1', 'mastered'),
      createWord('p1', 'review'),
      createWord('p1', 'mastered'),
      createWord('p1', 'new'),
    ],
    p2: [createWord('p2', 'new')],
  };

  const stats = buildProjectStats(projects, wordsByProject);

  assert.equal(stats[0].totalWords, 4);
  assert.equal(stats[0].masteredWords, 2);
  assert.equal(stats[0].progress, 50);
  assert.equal(stats[1].totalWords, 1);
  assert.equal(stats[1].masteredWords, 0);
  assert.equal(stats[1].progress, 0);
});

test('buildProjectStats uses grouped distinct memory totals', () => {
  const projects = [createProject('p1')];
  const wordsByProject: Record<string, Word[]> = {
    p1: [
      createWord('p1', 'mastered', {
        id: 'free-primary',
        english: 'free',
        japanese: '自由な',
        lexiconEntryId: 'lex-free',
        lexiconSenseId: 'sense-primary',
        lexiconSenseIsPrimary: true,
      }),
      createWord('p1', 'new', {
        id: 'free-cost',
        english: 'free',
        japanese: '無料の',
        lexiconEntryId: 'lex-free',
        lexiconSenseId: 'sense-cost',
        lexiconDistinctKey: 'cost',
      }),
    ],
  };

  const [stats] = buildProjectStats(projects, wordsByProject);

  assert.equal(stats.totalWords, 1);
  assert.equal(stats.masteredWords, 0);
  assert.equal(stats.progress, 0);
});

test('mergeProjectsById removes duplicates and keeps first entry order', () => {
  const firstP1 = { ...createProject('p1'), title: 'First P1' };
  const secondP1 = { ...createProject('p1'), title: 'Second P1' };
  const p2 = createProject('p2');

  const merged = mergeProjectsById([firstP1, p2, secondP1, p2]);

  assert.deepEqual(merged.map((project) => project.id), ['p1', 'p2']);
  assert.equal(merged[0].title, 'First P1');
});
