import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest } from 'next/server';

import { handleProjectPatch } from './route';

type FakeProjectRow = {
  id: string;
  user_id: string;
  title: string;
};

class FakeProjectsClient {
  readonly rows = new Map<string, FakeProjectRow>();

  constructor(initialRows: FakeProjectRow[]) {
    initialRows.forEach((row) => {
      this.rows.set(row.id, { ...row });
    });
  }

  from(table: string) {
    assert.equal(table, 'projects');

    const filters = new Map<string, string>();
    let updates: Partial<Pick<FakeProjectRow, 'title'>> = {};

    const chain = {
      update: (nextUpdates: Partial<Pick<FakeProjectRow, 'title'>>) => {
        updates = { ...nextUpdates };
        return chain;
      },
      eq: (field: string, value: string) => {
        filters.set(field, value);
        return chain;
      },
      select: () => chain,
      maybeSingle: async () => {
        const id = filters.get('id');
        const userId = filters.get('user_id');
        const row = id ? this.rows.get(id) : undefined;
        if (!row || row.user_id !== userId) {
          return { data: null, error: null };
        }

        if (updates.title !== undefined) {
          row.title = updates.title;
        }

        return {
          data: {
            id: row.id,
            title: row.title,
          },
          error: null,
        };
      },
    };

    return chain;
  }
}

function patchRequest(body: unknown) {
  return new NextRequest('http://localhost/api/projects/project-1', {
    method: 'PATCH',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

function context(projectId = 'project-1') {
  return {
    params: Promise.resolve({ projectId }),
  };
}

test('projects PATCH requires authentication', async () => {
  const response = await handleProjectPatch(
    patchRequest({ title: 'Renamed' }),
    context(),
    {
      resolveUser: async () => null,
      createClient: async () => new FakeProjectsClient([]) as never,
    },
  );

  assert.equal(response.status, 401);
});

test('projects PATCH rejects invalid title', async () => {
  const response = await handleProjectPatch(
    patchRequest({ title: '' }),
    context(),
    {
      resolveUser: async () => ({ id: 'user-1' }),
      createClient: async () => new FakeProjectsClient([]) as never,
    },
  );

  assert.equal(response.status, 400);
});

test('projects PATCH updates an owned project title', async () => {
  const client = new FakeProjectsClient([
    { id: 'project-1', user_id: 'user-1', title: 'Before' },
  ]);

  const response = await handleProjectPatch(
    patchRequest({ title: '  After  ' }),
    context(),
    {
      resolveUser: async () => ({ id: 'user-1' }),
      createClient: async () => client as never,
    },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    success: true,
    project: {
      id: 'project-1',
      title: 'After',
    },
  });
  assert.equal(client.rows.get('project-1')?.title, 'After');
});

test('projects PATCH returns 404 for projects owned by another user', async () => {
  const client = new FakeProjectsClient([
    { id: 'project-1', user_id: 'owner-1', title: 'Before' },
  ]);

  const response = await handleProjectPatch(
    patchRequest({ title: 'After' }),
    context(),
    {
      resolveUser: async () => ({ id: 'user-1' }),
      createClient: async () => client as never,
    },
  );

  assert.equal(response.status, 404);
  assert.equal(client.rows.get('project-1')?.title, 'Before');
});
