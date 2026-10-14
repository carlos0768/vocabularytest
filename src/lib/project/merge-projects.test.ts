import test from 'node:test';
import assert from 'node:assert/strict';
import type { Project, Word } from '@/types';
import {
  applyProjectMergeToLocalCache,
  listMergeTargetProjects,
  mergeProjectIntoRemote,
  resolveMergeSectionName,
  type MergeLocalDb,
} from './merge-projects';

const project = (id: string, extra: Partial<Project> = {}): Project => ({
  id,
  userId: 'user-1',
  title: id,
  createdAt: '2026-10-01T00:00:00.000Z',
  ...extra,
} as Project);

test('resolveMergeSectionName uses the source title, suffixing when the target already has it', () => {
  assert.equal(resolveMergeSectionName([], '  英検準1級  '), '英検準1級');
  assert.equal(resolveMergeSectionName(['英検準1級'], '英検準1級'), '英検準1級 2');
  assert.equal(resolveMergeSectionName(['英検準1級', '英検準1級 2'], '英検準1級'), '英検準1級 3');
  assert.equal(resolveMergeSectionName([], '   '), '統合した単語');
});

test('resolveMergeSectionName stays within the section name length limit', () => {
  const long = 'あ'.repeat(60);
  const first = resolveMergeSectionName([], long);
  assert.equal(Array.from(first).length, 40);
  const second = resolveMergeSectionName([first], long);
  assert.equal(Array.from(second).length, 40);
  assert.ok(second.endsWith(' 2'));
});

test('listMergeTargetProjects excludes the source and wordbooks of another kind', () => {
  const targets = listMergeTargetProjects(
    [project('a'), project('b'), project('c', { kind: 'classical' }), project('d', { kind: 'english' })],
    { id: 'a', kind: 'english' },
  );
  assert.deepEqual(targets.map((p) => p.id), ['b', 'd']);
});

test('mergeProjectIntoRemote calls the RPC and returns the moved count', async () => {
  const calls: unknown[] = [];
  const moved = await mergeProjectIntoRemote(
    { rpc: async (fn, args) => { calls.push([fn, args]); return { data: 12, error: null }; } },
    { sourceProjectId: 's', targetProjectId: 't', sectionName: 'Book A' },
  );
  assert.equal(moved, 12);
  assert.deepEqual(calls, [['merge_project_into', { p_source_project_id: 's', p_target_project_id: 't', p_section_name: 'Book A' }]]);

  await assert.rejects(
    mergeProjectIntoRemote(
      { rpc: async () => ({ data: null, error: { message: 'boom' } }) },
      { sourceProjectId: 's', targetProjectId: 't', sectionName: 'Book A' },
    ),
    /boom/,
  );
});

test('applyProjectMergeToLocalCache moves words, appends the section and deletes the source', async () => {
  const projects = new Map<string, Project>([
    ['s', project('s')],
    ['t', project('t', { sectionNames: ['Part 1'] })],
  ]);
  const words: Pick<Word, 'id' | 'projectId' | 'sectionName'>[] = [
    { id: 'w1', projectId: 's', sectionName: 'old' },
    { id: 'w2', projectId: 's', sectionName: null },
    { id: 'w3', projectId: 't', sectionName: 'Part 1' },
  ];
  const projectsTable = {
    get: async (id: string) => projects.get(id),
    put: async (p: Project) => { projects.set(p.id, p); },
    delete: async (id: string) => { projects.delete(id); },
  };
  const wordsTable = {
    where: () => ({
      equals: (value: string) => ({
        modify: async (changes: { projectId: string; sectionName: string }) => {
          let count = 0;
          for (const word of words) {
            if (word.projectId === value) { Object.assign(word, changes); count += 1; }
          }
          return count;
        },
      }),
    }),
  };
  const db: MergeLocalDb = {
    projects: projectsTable,
    words: wordsTable,
    transaction: async (_mode, _tables, scope) => scope(),
  };

  await applyProjectMergeToLocalCache(db, { sourceProjectId: 's', targetProjectId: 't', sectionName: 'Book S' });

  assert.equal(projects.has('s'), false);
  assert.deepEqual(projects.get('t')?.sectionNames, ['Part 1', 'Book S']);
  assert.deepEqual(words.map((w) => [w.id, w.projectId, w.sectionName]), [
    ['w1', 't', 'Book S'],
    ['w2', 't', 'Book S'],
    ['w3', 't', 'Part 1'],
  ]);
});
