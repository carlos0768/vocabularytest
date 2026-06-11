import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MAX_EXAMPLE_GENRES,
  buildExampleGenreGuidance,
  fetchExampleGenres,
  normalizeExampleGenres,
} from './example-genres';

test('normalizeExampleGenres keeps valid trimmed genres', () => {
  assert.deepEqual(
    normalizeExampleGenres([' サッカー ', '映画']),
    ['サッカー', '映画'],
  );
});

test('normalizeExampleGenres drops non-strings, empties, duplicates and overlong values', () => {
  assert.deepEqual(
    normalizeExampleGenres([
      'サッカー',
      'サッカー',
      '',
      '   ',
      42,
      null,
      'あ'.repeat(31),
    ]),
    ['サッカー'],
  );
});

test('normalizeExampleGenres caps the number of genres', () => {
  const genres = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
  assert.equal(normalizeExampleGenres(genres).length, MAX_EXAMPLE_GENRES);
});

test('normalizeExampleGenres returns empty array for non-array input', () => {
  assert.deepEqual(normalizeExampleGenres(undefined), []);
  assert.deepEqual(normalizeExampleGenres('サッカー'), []);
  assert.deepEqual(normalizeExampleGenres({}), []);
});

test('buildExampleGenreGuidance returns empty string when no genres', () => {
  assert.equal(buildExampleGenreGuidance([]), '');
  assert.equal(buildExampleGenreGuidance(['', '   ']), '');
});

test('buildExampleGenreGuidance includes all genres and forceful linking instruction', () => {
  const guidance = buildExampleGenreGuidance(['サッカー', '映画']);
  assert.ok(guidance.includes('サッカー、映画'));
  assert.ok(guidance.includes('ユーザの興味ジャンル'));
  // 関係が薄くても強引にジャンルと結びつける指示になっていること
  assert.ok(guidance.includes('多少強引でも必ずジャンルと結びつけて'));
  assert.ok(guidance.includes('汎用例文は作らない'));
  // 旧仕様（無理に取り入れない＝汎用例文へのフォールバック）が残っていないこと
  assert.ok(!guidance.includes('無理に取り入れず'));
});

function createSupabaseStub(result: { data: unknown; error: { message: string } | null }) {
  return {
    from(table: string) {
      assert.equal(table, 'user_preferences');
      return {
        select(columns: string) {
          assert.equal(columns, 'example_genres');
          return {
            eq(column: string, value: string) {
              assert.equal(column, 'user_id');
              assert.equal(value, 'user-1');
              return {
                maybeSingle: async () => result,
              };
            },
          };
        },
      };
    },
  } as never;
}

test('fetchExampleGenres returns normalized genres from the preferences row', async () => {
  const supabase = createSupabaseStub({
    data: { example_genres: [' サッカー ', '映画', '映画'] },
    error: null,
  });
  assert.deepEqual(await fetchExampleGenres(supabase, 'user-1'), ['サッカー', '映画']);
});

test('fetchExampleGenres returns empty array when row is missing', async () => {
  const supabase = createSupabaseStub({ data: null, error: null });
  assert.deepEqual(await fetchExampleGenres(supabase, 'user-1'), []);
});

test('fetchExampleGenres returns empty array on query error', async () => {
  const supabase = createSupabaseStub({
    data: null,
    error: { message: 'column "example_genres" does not exist' },
  });
  assert.deepEqual(await fetchExampleGenres(supabase, 'user-1'), []);
});

test('fetchExampleGenres returns empty array when client throws', async () => {
  const supabase = {
    from() {
      throw new Error('connection refused');
    },
  } as never;
  assert.deepEqual(await fetchExampleGenres(supabase, 'user-1'), []);
});
