import test from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';

import { applyClassicalExamples, type ClassicalExampleTarget } from './examples';

type EntryRow = { id: string; example_sentence: string | null; example_sentence_ja: string | null };

interface FakeAdminOptions {
  rows?: EntryRow[];
  selectError?: { code?: string; message: string } | null;
}

/**
 * classical_entries だけを見る最小のフェイク。
 * `.select().in()` の読みと `.update().eq().is()` の書きを記録する。
 */
function createFakeAdmin(options: FakeAdminOptions = {}) {
  const updates: Array<{ id: string; payload: Record<string, unknown> }> = [];
  const rows = options.rows ?? [];

  const client = {
    from(table: string) {
      assert.equal(table, 'classical_entries');
      return {
        select() {
          return {
            async in(_column: string, ids: string[]) {
              if (options.selectError) return { data: null, error: options.selectError };
              return { data: rows.filter((row) => ids.includes(row.id)), error: null };
            },
          };
        },
        update(payload: Record<string, unknown>) {
          return {
            eq(_column: string, id: string) {
              return {
                async is() {
                  updates.push({ id, payload });
                  return { error: null };
                },
              };
            },
          };
        },
      };
    },
  } as unknown as SupabaseClient;

  return { client, updates };
}

function target(overrides: Partial<ClassicalExampleTarget> = {}): ClassicalExampleTarget {
  return { headword: 'あさまし', meaning: '驚きあきれる', classicalEntryId: 'entry-1', ...overrides };
}

test('applyClassicalExamples reuses a cached example without calling the AI', async () => {
  const { client, updates } = createFakeAdmin({
    rows: [{ id: 'entry-1', example_sentence: 'いとあさまし。', example_sentence_ja: '実に驚きあきれる。' }],
  });
  let generateCalled = false;

  const results = await applyClassicalExamples([target()], {}, {
    supabaseAdmin: client,
    generateExamples: (async () => {
      generateCalled = true;
      throw new Error('should not be called');
    }) as never,
  });

  assert.equal(generateCalled, false);
  assert.deepEqual(results, [
    { exampleSentence: 'いとあさまし。', exampleSentenceJa: '実に驚きあきれる。' },
  ]);
  // 既にあるものを書き直さない
  assert.deepEqual(updates, []);
});

test('applyClassicalExamples generates a missing example and writes it back to the dictionary', async () => {
  const { client, updates } = createFakeAdmin({ rows: [] });

  const results = await applyClassicalExamples([target()], {}, {
    supabaseAdmin: client,
    generateExamples: (async (seeds: Array<{ id: string }>) => ({
      examples: seeds.map((s) => ({
        wordId: s.id,
        exampleSentence: 'あさましき事なり。',
        exampleSentenceJa: '驚きあきれることだ。',
      })),
      errors: [],
      summary: { requested: seeds.length, generated: seeds.length, failed: 0, retried: 0 },
    })) as never,
  });

  assert.deepEqual(results, [
    { exampleSentence: 'あさましき事なり。', exampleSentenceJa: '驚きあきれることだ。' },
  ]);
  assert.deepEqual(updates, [{
    id: 'entry-1',
    payload: { example_sentence: 'あさましき事なり。', example_sentence_ja: '驚きあきれることだ。' },
  }]);
});

// 返り値は入力と同じ長さ・同じ順。呼び出し側が index で当てるので、
// フィルタして詰めてはいけない。
test('applyClassicalExamples keeps the result aligned with the input order', async () => {
  const { client } = createFakeAdmin({
    rows: [{ id: 'entry-2', example_sentence: 'キャッシュ済み。', example_sentence_ja: '訳。' }],
  });

  const results = await applyClassicalExamples(
    [
      target({ classicalEntryId: 'entry-1', headword: 'ゆかし' }),
      target({ classicalEntryId: 'entry-2', headword: 'をかし' }),
      target({ classicalEntryId: 'entry-3', headword: 'あはれなり' }),
    ],
    {},
    {
      supabaseAdmin: client,
      // 真ん中はキャッシュ済み。生成に回るのは1番目と3番目だけで、
      // その2つのうち3番目だけ生成に成功した状況を作る。
      generateExamples: (async (seeds: Array<{ id: string; headword: string }>) => {
        assert.deepEqual(seeds.map((s) => s.headword), ['ゆかし', 'あはれなり']);
        const last = seeds[seeds.length - 1]!;
        return {
          examples: [{ wordId: last.id, exampleSentence: 'あはれなり。', exampleSentenceJa: 'しみじみとする。' }],
          errors: [],
          summary: { requested: seeds.length, generated: 1, failed: 1, retried: 1 },
        };
      }) as never,
    },
  );

  assert.equal(results.length, 3);
  assert.equal(results[0], null);
  assert.deepEqual(results[1], { exampleSentence: 'キャッシュ済み。', exampleSentenceJa: '訳。' });
  assert.deepEqual(results[2], { exampleSentence: 'あはれなり。', exampleSentenceJa: 'しみじみとする。' });
});

// 例文列がまだ無いDB（マイグレーション未適用）でも落ちないこと
test('applyClassicalExamples still generates when the cache column is missing', async () => {
  const { client, updates } = createFakeAdmin({
    selectError: { code: '42703', message: 'column classical_entries.example_sentence does not exist' },
  });

  const results = await applyClassicalExamples([target()], {}, {
    supabaseAdmin: client,
    generateExamples: (async (seeds: Array<{ id: string }>) => ({
      examples: seeds.map((s) => ({
        wordId: s.id,
        exampleSentence: 'あさましき事なり。',
        exampleSentenceJa: '驚きあきれることだ。',
      })),
      errors: [],
      summary: { requested: seeds.length, generated: seeds.length, failed: 0, retried: 0 },
    })) as never,
  });

  assert.equal(results[0]?.exampleSentence, 'あさましき事なり。');
  // 書き戻しは試みるが、失敗しても手元の例文はそのまま使う
  assert.equal(updates.length, 1);
});

test('applyClassicalExamples generates for entries with no dictionary id but skips the cache write', async () => {
  const { client, updates } = createFakeAdmin({ rows: [] });

  const results = await applyClassicalExamples(
    [target({ classicalEntryId: null })],
    {},
    {
      supabaseAdmin: client,
      generateExamples: (async (seeds: Array<{ id: string }>) => ({
        examples: seeds.map((s) => ({
          wordId: s.id,
          exampleSentence: 'あさましき事なり。',
          exampleSentenceJa: '驚きあきれることだ。',
        })),
        errors: [],
        summary: { requested: seeds.length, generated: seeds.length, failed: 0, retried: 0 },
      })) as never,
    },
  );

  assert.equal(results[0]?.exampleSentence, 'あさましき事なり。');
  // 紐づく見出し語が無いので共通辞書には書けない
  assert.deepEqual(updates, []);
});

test('applyClassicalExamples returns nulls without generating when the AI throws', async () => {
  const { client } = createFakeAdmin({ rows: [] });

  const results = await applyClassicalExamples([target()], {}, {
    supabaseAdmin: client,
    generateExamples: (async () => {
      throw new Error('provider down');
    }) as never,
  });

  assert.deepEqual(results, [null]);
});

test('applyClassicalExamples skips targets with a blank headword or meaning', async () => {
  const { client } = createFakeAdmin({ rows: [] });
  let seedCount = -1;

  const results = await applyClassicalExamples(
    [target({ headword: '   ' }), target({ meaning: '' })],
    {},
    {
      supabaseAdmin: client,
      generateExamples: (async (seeds: unknown[]) => {
        seedCount = seeds.length;
        return { examples: [], errors: [], summary: { requested: 0, generated: 0, failed: 0, retried: 0 } };
      }) as never,
    },
  );

  // 生成対象が1件も無ければAIは呼ばれない
  assert.equal(seedCount, -1);
  assert.deepEqual(results, [null, null]);
});
