import test from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import { insertScanJobWithCompat } from './scan-jobs-compat';

function fakeSupabase(respond: (payload: Record<string, unknown>) => { data: unknown; error: unknown }) {
  const inserted: Record<string, unknown>[] = [];
  const client = {
    from: () => ({
      insert: (payload: Record<string, unknown>) => {
        inserted.push(payload);
        const result = respond(payload);
        return { select: () => ({ single: async () => result }) };
      },
    }),
  } as unknown as SupabaseClient;
  return { client, inserted };
}

test('insertScanJobWithCompat keeps target_section_name when the column exists', async () => {
  const { client, inserted } = fakeSupabase((payload) => ({ data: { id: 'job-1', ...payload }, error: null }));
  const result = await insertScanJobWithCompat(client, { id: 'job-1', target_project_id: 'p', target_section_name: 'Section 2' });
  assert.equal(result.error, null);
  assert.equal(inserted.length, 1);
  assert.equal(inserted[0]!.target_section_name, 'Section 2');
});

test('insertScanJobWithCompat drops only target_section_name when that column is missing', async () => {
  const { client, inserted } = fakeSupabase((payload) => (
    'target_section_name' in payload
      ? { data: null, error: { code: 'PGRST204', message: "Could not find the 'target_section_name' column of 'scan_jobs'" } }
      : { data: { id: 'job-1' }, error: null }
  ));
  const result = await insertScanJobWithCompat(client, { id: 'job-1', target_project_id: 'p', target_section_name: 'Section 2' });
  assert.equal(result.error, null);
  assert.equal(inserted.length, 2);
  assert.equal('target_section_name' in inserted[1]!, false);
  assert.equal(inserted[1]!.target_project_id, 'p');
});

test('insertScanJobWithCompat does not send a null target_section_name', async () => {
  const { client, inserted } = fakeSupabase(() => ({ data: { id: 'job-1' }, error: null }));
  await insertScanJobWithCompat(client, { id: 'job-1', target_section_name: null });
  assert.equal(inserted.length, 1);
  assert.equal('target_section_name' in inserted[0]!, false);
});
