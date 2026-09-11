import test from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';

import { readProjectKind } from '@/lib/classical/project-kind';

function makeClient(result: { data?: unknown; error?: unknown } | (() => never)): SupabaseClient {
  return {
    from() {
      if (typeof result === 'function') return result();
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => result,
          }),
        }),
      };
    },
  } as unknown as SupabaseClient;
}

test('readProjectKind returns the stored kind', async () => {
  const client = makeClient({ data: { kind: 'classical' }, error: null });
  assert.equal(await readProjectKind(client, 'p1'), 'classical');
});

test('readProjectKind treats an unknown or missing value as English', async () => {
  assert.equal(await readProjectKind(makeClient({ data: { kind: null }, error: null }), 'p1'), 'english');
  assert.equal(await readProjectKind(makeClient({ data: null, error: null }), 'p1'), 'english');
  assert.equal(await readProjectKind(makeClient({ data: { kind: 'なにか' }, error: null }), 'p1'), 'english');
});

test('readProjectKind falls back to English when the column does not exist', async () => {
  // マイグレーション未適用のDB。そこにある単語帳はすべて古典対応前＝英語。
  const client = makeClient({
    data: null,
    error: { code: '42703', message: 'column projects.kind does not exist' },
  });
  assert.equal(await readProjectKind(client, 'p1'), 'english');
});

test('readProjectKind never lets a thrown error break the scan', async () => {
  // ここで例外が出ると、列を足すまで全ユーザーがスキャンできなくなる
  const client = makeClient(() => {
    throw new Error('connection reset');
  });
  assert.equal(await readProjectKind(client, 'p1'), 'english');
});
