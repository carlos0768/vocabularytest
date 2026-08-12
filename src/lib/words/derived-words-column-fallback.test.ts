import test from 'node:test';
import assert from 'node:assert/strict';

import {
  RESOLVED_WORD_SELECT_COLUMNS,
  SHARE_VIEW_WORD_SELECT_COLUMNS,
  isMissingDerivedWordsColumnError,
  stripDerivedWordsColumn,
  withDerivedWordsColumnFallback,
} from './resolved';

// derived_words はマイグレーション未適用のDBでは存在しない。カラム定数に
// 含めている以上、列が無い環境でも単語取得が壊れないことを固定する。

test('select constants carry derived_words', () => {
  assert.ok(RESOLVED_WORD_SELECT_COLUMNS.includes('derived_words'));
  assert.ok(SHARE_VIEW_WORD_SELECT_COLUMNS.includes('derived_words'));
});

test('stripDerivedWordsColumn removes only that column', () => {
  const stripped = stripDerivedWordsColumn(RESOLVED_WORD_SELECT_COLUMNS);
  assert.equal(stripped.includes('derived_words'), false);
  // 巻き添えで消えていないこと（劣化を1列分に留めるのが目的）
  assert.ok(stripped.includes('morphology'));
  assert.ok(stripped.includes('custom_sections'));
  assert.ok(stripped.includes('word_order_quiz'));
  assert.ok(stripped.includes('related_words'));
});

test('detects missing derived_words column errors', () => {
  assert.equal(isMissingDerivedWordsColumnError({
    code: 'PGRST204',
    message: "Could not find the 'derived_words' column of 'words' in the schema cache",
  }), true);
  assert.equal(isMissingDerivedWordsColumnError({
    code: '42703',
    message: 'column words.derived_words does not exist',
  }), true);
});

test('ignores unrelated errors', () => {
  assert.equal(isMissingDerivedWordsColumnError(null), false);
  assert.equal(isMissingDerivedWordsColumnError({
    code: '42703',
    message: 'column words.morphology does not exist',
  }), false);
  assert.equal(isMissingDerivedWordsColumnError({
    code: '23505',
    message: 'duplicate key value violates unique constraint',
  }), false);
});

test('retries once without derived_words when the column is missing', async () => {
  const seen: string[] = [];
  const result = await withDerivedWordsColumnFallback(async (columns) => {
    seen.push(columns);
    if (columns.includes('derived_words')) {
      return { data: null, error: { code: '42703', message: 'column words.derived_words does not exist' } };
    }
    return { data: [{ id: 'w1' }], error: null };
  }, RESOLVED_WORD_SELECT_COLUMNS);

  assert.equal(seen.length, 2);
  assert.ok(seen[0]!.includes('derived_words'));
  assert.equal(seen[1]!.includes('derived_words'), false);
  assert.equal(result.error, null);
  assert.deepEqual(result.data, [{ id: 'w1' }]);
});

test('does not issue a second query when the column exists', async () => {
  const seen: string[] = [];
  const result = await withDerivedWordsColumnFallback(async (columns) => {
    seen.push(columns);
    return { data: [{ id: 'w1' }], error: null };
  }, RESOLVED_WORD_SELECT_COLUMNS);

  assert.equal(seen.length, 1);
  assert.equal(result.error, null);
});

test('passes through unrelated errors without retrying', async () => {
  let calls = 0;
  const result = await withDerivedWordsColumnFallback(async () => {
    calls += 1;
    return { data: null, error: { code: '23505', message: 'duplicate key' } };
  }, RESOLVED_WORD_SELECT_COLUMNS);

  assert.equal(calls, 1);
  assert.equal(result.error?.code, '23505');
});
