import assert from 'node:assert/strict';
import test from 'node:test';

import ProjectNotebookEntryPage from './[id]/page';

test('project/[id] redirects to the standalone notebook wordbook route', async () => {
  await assert.rejects(
    async () => {
      await ProjectNotebookEntryPage({
        params: Promise.resolve({ id: 'project-1' }),
      });
    },
    (error: unknown) => {
      const digest = error && typeof error === 'object' && 'digest' in error
        ? String((error as { digest?: unknown }).digest ?? '')
        : '';

      assert.match(digest, /NEXT_REDIRECT/);
      assert.match(digest, /\/wordbook\/project-1/);
      return true;
    },
  );
});
