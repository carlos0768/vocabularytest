import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveDerivedWordsForWords } from './resolve';
import type { WordDerivedWords } from '../../../shared/types';

// getCachedDerivedWordsByHeadword / saveDerivedWordsToLexicon が使う Supabase
// クエリチェーンの最小フェイク。
function fakeSupabase(state: {
  cachedRows: Array<{ normalized_headword: string; derived_words: unknown }>;
  updates: Array<{ headword: string; derivedWords: WordDerivedWords }>;
}) {
  return {
    from(table: string) {
      assert.equal(table, 'lexicon_entries');
      return {
        select() {
          return {
            in() {
              return {
                not: async () => ({ data: state.cachedRows, error: null }),
              };
            },
          };
        },
        update(values: { derived_words: WordDerivedWords }) {
          return {
            eq(_column: string, headword: string) {
              return {
                is: async () => {
                  state.updates.push({ headword, derivedWords: values.derived_words });
                  return { error: null };
                },
              };
            },
          };
        },
      };
    },
  } as never;
}

const CACHED: WordDerivedWords = {
  items: [{ english: 'reception', japanese: '受付', partOfSpeech: 'noun' }],
  version: 1,
};

test('serves cached derived words without calling the AI', async () => {
  const state = { cachedRows: [{ normalized_headword: 'receive', derived_words: CACHED }], updates: [] };
  let called = false;

  const resolved = await resolveDerivedWordsForWords(
    [{ english: 'Receive' }],
    {},
    {
      supabaseAdmin: fakeSupabase(state),
      generateDerivedWords: async () => {
        called = true;
        return { results: [], errors: [] };
      },
    },
  );

  assert.equal(called, false);
  assert.deepEqual(resolved.get('receive'), CACHED);
  assert.equal(state.updates.length, 0);
});

test('filters out ineligible words before the AI and caches the rejection', async () => {
  const state: Parameters<typeof fakeSupabase>[0] = { cachedRows: [], updates: [] };
  const seen: string[] = [];

  const resolved = await resolveDerivedWordsForWords(
    [{ english: 'pine' }, { english: 'dog' }],
    {},
    {
      supabaseAdmin: fakeSupabase(state),
      generateDerivedWords: async (seeds) => {
        seen.push(...seeds.map((seed) => seed.english));
        return { results: [], errors: [] };
      },
    },
  );

  // 足切りで落ちた語は AI に渡らない
  assert.deepEqual(seen, []);
  assert.equal(resolved.get('pine')?.none, true);
  assert.equal(resolved.get('dog')?.none, true);
  // 再判定を避けるため none をキャッシュに焼く
  assert.equal(state.updates.length, 2);
  assert.equal(state.updates[0]!.derivedWords.none, true);
});

test('generates only for eligible words and passes eligibility through', async () => {
  const state: Parameters<typeof fakeSupabase>[0] = { cachedRows: [], updates: [] };

  const resolved = await resolveDerivedWordsForWords(
    [{ english: 'receive' }, { english: 'pine' }],
    {},
    {
      supabaseAdmin: fakeSupabase(state),
      generateDerivedWords: async (seeds) => {
        assert.deepEqual(seeds.map((seed) => seed.english), ['receive']);
        assert.equal(seeds[0]!.eligibility.rootFamily?.label, 'ceiv/cept');
        return { results: [{ english: 'receive', derivedWords: CACHED }], errors: [] };
      },
    },
  );

  assert.deepEqual(resolved.get('receive'), CACHED);
  assert.equal(resolved.get('pine')?.none, true);
  const saved = state.updates.find((update) => update.headword === 'receive');
  assert.deepEqual(saved?.derivedWords, CACHED);
});

test('stores none when the AI finds nothing worth showing', async () => {
  const state: Parameters<typeof fakeSupabase>[0] = { cachedRows: [], updates: [] };

  const resolved = await resolveDerivedWordsForWords(
    [{ english: 'receive' }],
    {},
    {
      supabaseAdmin: fakeSupabase(state),
      generateDerivedWords: async () => ({
        results: [{ english: 'receive', derivedWords: null }],
        errors: [],
      }),
    },
  );

  assert.equal(resolved.get('receive')?.none, true);
  assert.equal(state.updates[0]!.derivedWords.none, true);
});

test('does not cache words the AI failed to generate', async () => {
  const state: Parameters<typeof fakeSupabase>[0] = { cachedRows: [], updates: [] };

  const resolved = await resolveDerivedWordsForWords(
    [{ english: 'receive' }],
    {},
    {
      supabaseAdmin: fakeSupabase(state),
      generateDerivedWords: async () => ({ results: [], errors: ['receive: boom'] }),
    },
  );

  // 生成失敗は none を焼かず、次回の再生成に委ねる
  assert.equal(resolved.has('receive'), false);
  assert.equal(state.updates.length, 0);
});

test('dedupes headwords and ignores blank input', async () => {
  const state: Parameters<typeof fakeSupabase>[0] = { cachedRows: [], updates: [] };

  const resolved = await resolveDerivedWordsForWords(
    [{ english: 'Receive' }, { english: 'receive' }, { english: '   ' }],
    {},
    {
      supabaseAdmin: fakeSupabase(state),
      generateDerivedWords: async (seeds) => {
        assert.equal(seeds.length, 1);
        return { results: [{ english: 'Receive', derivedWords: CACHED }], errors: [] };
      },
    },
  );

  assert.equal(resolved.size, 1);
});

test('returns an empty map when there is nothing to resolve', async () => {
  const resolved = await resolveDerivedWordsForWords([], {}, {
    supabaseAdmin: fakeSupabase({ cachedRows: [], updates: [] }),
  });
  assert.equal(resolved.size, 0);
});
