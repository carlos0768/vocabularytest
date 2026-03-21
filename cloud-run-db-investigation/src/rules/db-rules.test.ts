import test from 'node:test';
import assert from 'node:assert/strict';
import { detectDbRelatedChanges } from './db-rules.js';

test('detects supabase migration as DB change', () => {
  const result = detectDbRelatedChanges([
    {
      path: 'supabase/migrations/20260321000100_add_index.sql',
      patch: 'create index idx_words_term on words(term);',
    },
  ]);

  assert.equal(result.isDbRelated, true);
  assert.equal(result.dbChangedFileCount, 1);
  assert.ok(result.matches.some((m) => m.rule === 'supabase-migrations'));
});

test('does not trigger on frontend-only change', () => {
  const result = detectDbRelatedChanges([
    {
      path: 'src/components/Button.tsx',
      patch: 'export function Button() { return null; }',
    },
  ]);

  assert.equal(result.isDbRelated, false);
  assert.equal(result.matches.length, 0);
});
