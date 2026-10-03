import test from 'node:test';
import assert from 'node:assert/strict';

import {
  OPTIONAL_WORD_SELECT_COLUMNS,
  RESOLVED_WORD_BASE_SELECT_COLUMNS,
  RESOLVED_WORD_SELECT_COLUMNS,
  withMissingWordColumnFallback,
} from './resolved';

test('全単語取得の列リストに mastery_level が入っている (無いと同期のたびにレベルが 0 に戻る)', () => {
  const columns = RESOLVED_WORD_BASE_SELECT_COLUMNS.split(',').map((c) => c.trim());
  assert.ok(columns.includes('mastery_level'));
  assert.ok(columns.includes('status'));
  assert.ok(RESOLVED_WORD_SELECT_COLUMNS.includes('mastery_level'));
});

test('後付けの列はすべて任意カラムとして登録され、未適用DBでは落として再試行される', async () => {
  assert.ok(OPTIONAL_WORD_SELECT_COLUMNS.includes('mastery_level'));
  assert.ok(OPTIONAL_WORD_SELECT_COLUMNS.includes('classical_entry_id'));

  const attempts: string[] = [];
  const result = await withMissingWordColumnFallback(
    async (columns) => {
      attempts.push(columns);
      if (columns.includes('mastery_level')) {
        return { data: null, error: { code: '42703', message: 'column words.mastery_level does not exist' } };
      }
      return { data: [{ id: 'w1' }], error: null };
    },
    RESOLVED_WORD_BASE_SELECT_COLUMNS,
  );

  assert.equal(result.error, null);
  assert.equal(attempts.length, 2);
  assert.ok(attempts[0]!.includes('mastery_level'));
  assert.ok(!attempts[1]!.includes('mastery_level'));
  // 他の列は落とさない
  assert.ok(attempts[1]!.includes('status'));
  assert.ok(attempts[1]!.includes('classical_entry_id'));
});

test('列が揃っているDBでは1回で返る', async () => {
  let calls = 0;
  const result = await withMissingWordColumnFallback(
    async () => { calls += 1; return { data: [], error: null }; },
    RESOLVED_WORD_BASE_SELECT_COLUMNS,
  );
  assert.equal(result.error, null);
  assert.equal(calls, 1);
});
