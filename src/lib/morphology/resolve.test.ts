import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveMorphologyForWords } from './resolve';
import { MORPHOLOGY_ANALYSIS_VERSION } from '@/lib/schemas/morphology';
import type { WordMorphology } from '../../../shared/types';

// getCachedMorphologyByHeadword / saveMorphologyToLexicon が使う Supabase
// クエリチェーンの最小フェイク。
function fakeSupabase(state: {
  cachedRows: Array<{ normalized_headword: string; morphology: unknown }>;
  updates: Array<{ headword: string; morphology: WordMorphology; overwrite?: boolean }>;
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
              const record = (overwrite: boolean) => {
                state.updates.push({ headword, morphology: values.morphology, overwrite });
                return { error: null };
              };
              // `.is('morphology', null)` を付けずに await される（上書き保存）経路も
              // 再現するため、eq() 自体を thenable にしておく。
              return {
                is: async () => record(false),
                then: (
                  resolve: (value: { error: null }) => unknown,
                  reject?: (reason: unknown) => unknown,
                ) => Promise.resolve(record(true)).then(resolve, reject),
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
  const state = { cachedRows: [], updates: [] as Array<{ headword: string; morphology: WordMorphology; overwrite?: boolean }> };

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
  const state = { cachedRows: [], updates: [] as Array<{ headword: string; morphology: WordMorphology; overwrite?: boolean }> };

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
  const state = { cachedRows: [], updates: [] as Array<{ headword: string; morphology: WordMorphology; overwrite?: boolean }> };

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

test('words with no affix candidates are still sent to the AI (compound / root-only words)', async () => {
  const state = { cachedRows: [], updates: [] as Array<{ headword: string; morphology: WordMorphology; overwrite?: boolean }> };

  const generated: WordMorphology = {
    formula: [
      { text: 'break', kind: 'root', meaningJa: '破る' },
      { text: 'fast', kind: 'root', meaningJa: '断食' },
    ],
    explanation: '断食を破る食事が原義。',
    version: 1,
  };

  const resolved = await resolveMorphologyForWords(
    [{ english: 'breakfast' }],
    {},
    {
      supabaseAdmin: fakeSupabase(state),
      generateMorphology: async (seeds) => {
        assert.equal(seeds.length, 1);
        assert.deepEqual(seeds[0]!.candidates, []); // 候補ゼロでも送る
        return { results: [{ english: 'breakfast', morphology: generated }], errors: [] };
      },
    },
  );

  assert.deepEqual(resolved.get('breakfast'), generated);
});

test('multi-word headwords (idioms) skip the AI and are cached as none', async () => {
  const state = { cachedRows: [], updates: [] as Array<{ headword: string; morphology: WordMorphology; overwrite?: boolean }> };
  let aiCalled = false;

  const resolved = await resolveMorphologyForWords(
    [{ english: 'give up' }, { english: 'oil' }],
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
  assert.equal(resolved.get('give up')?.none, true);
  assert.equal(resolved.get('oil')?.none, true); // 3文字以下は分解しても情報がない
});

test('none sentinels from an older analyzer generation are re-analyzed and overwritten', async () => {
  const staleNone = { formula: [], explanation: '', version: 1, none: true }; // analysis なし = 世代1
  const state = {
    cachedRows: [{ normalized_headword: 'muscle', morphology: staleNone }],
    updates: [] as Array<{ headword: string; morphology: WordMorphology; overwrite?: boolean }>,
  };

  const generated: WordMorphology = {
    formula: [
      { text: 'mus', kind: 'root', meaningJa: 'ネズミ' },
      { text: 'cle', kind: 'suffix', meaningJa: '小さいもの' },
    ],
    explanation: '力こぶが小さなネズミの動きに見えたことから。',
    version: 1,
  };

  const resolved = await resolveMorphologyForWords(
    [{ english: 'muscle' }],
    {},
    {
      supabaseAdmin: fakeSupabase(state),
      generateMorphology: async () => ({
        results: [{ english: 'muscle', morphology: generated }],
        errors: [],
      }),
    },
  );

  assert.deepEqual(resolved.get('muscle'), generated);
  assert.equal(state.updates.length, 1);
  // 旧 none は fill-if-empty では上書きできないので、上書き保存に切り替わる
  assert.equal(state.updates[0]!.overwrite, true);
});

test('none sentinels from the current generation stay cached (no repeat AI calls)', async () => {
  const currentNone = {
    formula: [], explanation: '', version: 1, none: true, analysis: MORPHOLOGY_ANALYSIS_VERSION,
  };
  const state = {
    cachedRows: [{ normalized_headword: 'dogged', morphology: currentNone }],
    updates: [] as Array<{ headword: string; morphology: WordMorphology; overwrite?: boolean }>,
  };
  let aiCalled = false;

  const resolved = await resolveMorphologyForWords(
    [{ english: 'dogged' }],
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
  assert.equal(resolved.get('dogged')?.none, true);
  assert.equal(state.updates.length, 0);
});
