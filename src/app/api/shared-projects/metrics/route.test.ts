import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest } from 'next/server';

import { handleSharedProjectsMetricsGet } from './route';

test('shared-projects/metrics GET returns only accessible metrics', async () => {
  const req = new NextRequest('http://localhost/api/shared-projects/metrics?projectIds=project-1,project-2', {
    method: 'GET',
  });

  const res = await handleSharedProjectsMetricsGet(req, {
    resolveAuthenticatedUser: async () => ({ id: 'user-1' }),
    getSupabaseAdmin: () => ({
      from(table: string) {
        const rows = table === 'projects'
          ? [
            { id: 'project-1', user_id: 'owner-1', share_scope: 'public' },
            { id: 'project-2', user_id: 'owner-2', share_scope: 'private' },
          ]
          : [];

        return {
          select() {
            return this;
          },
          in() {
            return this;
          },
          not() {
            return this;
          },
          eq() {
            return this;
          },
          async then(onfulfilled?: (value: { data: unknown[]; error: null }) => unknown) {
            const result = { data: rows, error: null };
            return onfulfilled ? onfulfilled(result) : result;
          },
        };
      },
    } as never),
    getSharedProjectMetrics: async () => new Map([
      ['project-1', { wordCount: 3, collaboratorCount: 2, likeCount: 1 }],
      ['project-2', { wordCount: 9, collaboratorCount: 4, likeCount: 0 }],
    ]),
  });

  assert.equal(res.status, 200);
  const payload = await res.json();
  assert.deepEqual(payload.metrics, {
    'project-1': { wordCount: 3, collaboratorCount: 2, likeCount: 1 },
  });
});
