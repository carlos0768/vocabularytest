import test from 'node:test';
import assert from 'node:assert/strict';
import type { Project } from '@/types';
import { BINDER_NAME_MAX_LENGTH, normalizeBinderName, renameBinder } from './rename';

function createProject(id: string, binder: string | null): Project {
  return {
    id,
    userId: 'user-1',
    title: id,
    description: null,
    binder,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  } as unknown as Project;
}

test('normalizeBinderName trims and accepts a plain name', () => {
  const result = normalizeBinderName('  英検準1級  ');
  assert.deepEqual(result, { ok: true, value: '英検準1級' });
});

test('normalizeBinderName rejects an empty or whitespace-only name', () => {
  assert.equal(normalizeBinderName('').ok, false);
  assert.equal(normalizeBinderName('   ').ok, false);
});

test('normalizeBinderName rejects names longer than the DB limit', () => {
  const atLimit = 'あ'.repeat(BINDER_NAME_MAX_LENGTH);
  const overLimit = 'あ'.repeat(BINDER_NAME_MAX_LENGTH + 1);
  assert.deepEqual(normalizeBinderName(atLimit), { ok: true, value: atLimit });
  assert.equal(normalizeBinderName(overLimit).ok, false);
});

test('renameBinder only touches projects in the old binder', async () => {
  const calls: Array<{ id: string; binder: string }> = [];
  const projects = [
    createProject('a', '高校英単語'),
    createProject('b', '高校英単語'),
    createProject('c', 'TOEIC'),
    createProject('d', null),
  ];

  const result = await renameBinder({
    repository: {
      async updateProject(projectId, updates) {
        calls.push({ id: projectId, binder: updates.binder });
      },
    },
    projects,
    oldName: '高校英単語',
    newName: '大学受験',
  });

  assert.deepEqual(result, { renamed: 2, total: 2 });
  assert.deepEqual(calls, [
    { id: 'a', binder: '大学受験' },
    { id: 'b', binder: '大学受験' },
  ]);
});

test('renameBinder keeps going and reports the count when a project fails', async () => {
  const projects = [createProject('a', '古い名前'), createProject('b', '古い名前')];

  const result = await renameBinder({
    repository: {
      async updateProject(projectId) {
        if (projectId === 'a') throw new Error('offline');
      },
    },
    projects,
    oldName: '古い名前',
    newName: '新しい名前',
  });

  assert.deepEqual(result, { renamed: 1, total: 2 });
});
