import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveMorphologyForWords } from './resolve';
import type { WordMorphology } from '../../../shared/types';

// getCachedMorphologyByHeadword / saveMorphologyToLexicon が使う Supabase
// クエリチェーンの最小フェイク。
function fakeSupabase(state: {
  cachedRows: Array<{ normalized_headword: string; morphology: unknown }>;
  updates: Array<{ headword: string; morphology: WordMorphology }>;
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
        update(values: { morphology: WordMorphology }) {
          return {
            eq(_column: string, headword: string) {
              return {
                is: async () => {
                  state.updates.push({ headword, morphology: values.morphology });
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

const CACHED_MORPHOLOGY: WordMorphology = {
  formula: [
    { text: 'un', kind: 'prefix', meaningJa: '1つ', affixId: 'uni-one' },
    { text: 'anim', kind: 'root', meaningJa: '心' },
    { text: 'ous', kind: 'suffix', meaningJa: '形容詞化', affixId: 'ous-adj' },
  ],
  explanation: '「心が1つ」が原義。',
  version: 1,
};

test('cache hits are returned without calling the AI', async () => {
  const state = { cachedRows: [{ normalized_headword: 'unanimous', morphology: CACHED_MORPHOLOGY }], updates: [] };
  let aiCalled = false;

  const resolved = await resolveMorphologyForWords(
    [{ english: 'Unanimous' }],
    {},
    {
      supabaseAdmin: fakeSupabase(state),
      generateMorphology: async () => {
        aiCalled = true;
        return { results: [], errors: [] };
      },
    },
  );

  assert.equal(aiCalled, false);
  assert.deepEqual(resolved.get('unanimous'), CACHED_MORPHOLOGY);
});

test('cache misses go to the AI and results are saved back to the lexicon', async () => {
  const state = { cachedRows: [], updates: [] as Array<{ headword: string; morphology: WordMorphology }> };

  const generated: WordMorphology = {
    formula: [
      { text: 'un', kind: 'prefix', meaningJa: '否定', affixId: 'un-not' },
      { text: 'happy', kind: 'root', meaningJa: '幸せな' },
    ],
    explanation: '幸せでない。',
    version: 1,
  };

  const resolved = await resolveMorphologyForWords(
    [{ english: 'unhappy' }],
    {},
    {
      supabaseAdmin: fakeSupabase(state),
      generateMorphology: async (seeds) => {
        assert.equal(seeds.length, 1);
        assert.equal(seeds[0]!.english, 'unhappy');
        assert.ok(seeds[0]!.candidates.some((sense) => sense.id === 'un-not'));
        return { results: [{ english: 'unhappy', morphology: generated }], errors: [] };
      },
    },
  );

  assert.deepEqual(resolved.get('unhappy'), generated);
  assert.equal(state.updates.length, 1);
  assert.equal(state.updates[0]!.headword, 'unhappy');
});

test('AI "no structure" answers are cached as a none sentinel so they are never re-sent', async () => {
  const state = { cachedRows: [], updates: [] as Array<{ headword: string; morphology: WordMorphology }> };

  const resolved = await resolveMorphologyForWords(
    [{ english: 'unhappy' }],
    {},
    {
      supabaseAdmin: fakeSupabase(state),
      generateMorphology: async () => ({
        results: [{ english: 'unhappy', morphology: null }],
        errors: [],
      }),
    },
  );

  const value = resolved.get('unhappy');
  assert.ok(value);
  assert.equal(value.none, true);
  assert.equal(state.updates.length, 1);
  assert.equal(state.updates[0]!.morphology.none, true);
});

test('generation failures are NOT cached (retried on the next scan)', async () => {
  const state = { cachedRows: [], updates: [] as Array<{ headword: string; morphology: WordMorphology }> };

  const resolved = await resolveMorphologyForWords(
    [{ english: 'unhappy' }],
    {},
    {
      supabaseAdmin: fakeSupabase(state),
      generateMorphology: async () => ({ results: [], errors: ['unhappy: boom'] }),
    },
  );

  assert.equal(resolved.has('unhappy'), false);
  assert.equal(state.updates.length, 0);
});
