import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeLexiconSenseKey, upsertAiTranslationSenses } from '@/lib/lexicon/senses';
import type { TranslatedSense } from '@/lib/lexicon/types';

interface UpsertCall {
  rows: Array<Record<string, unknown>>;
  options: Record<string, unknown>;
}

interface UpdateCall {
  values: Record<string, unknown>;
  filters: Array<[string, string, unknown]>;
}

function createFakeAdmin(existingSenseCount: number) {
  const upsertCalls: UpsertCall[] = [];
  const updateCalls: UpdateCall[] = [];
  const client = {
    from(table: string) {
      assert.equal(table, 'lexicon_senses');
      return {
        select() {
          return {
            eq: async () => ({ count: existingSenseCount, error: null }),
          };
        },
        upsert: async (rows: Array<Record<string, unknown>>, options: Record<string, unknown>) => {
          upsertCalls.push({ rows, options });
          return { error: null };
        },
        update(values: Record<string, unknown>) {
          const call: UpdateCall = { values, filters: [] };
          updateCalls.push(call);
          const builder = {
            eq(column: string, value: unknown) {
              call.filters.push(['eq', column, value]);
              return builder;
            },
            is(column: string, value: unknown) {
              call.filters.push(['is', column, value]);
              return Promise.resolve({ error: null });
            },
          };
          return builder;
        },
      };
    },
  };
  return { client: client as never, upsertCalls, updateCalls };
}

const SENSES: TranslatedSense[] = [
  { japanese: '走る', meaningSummary: '移動する', isPrimary: true },
  { japanese: '経営する', meaningSummary: null, isPrimary: false },
];

test('normalizeLexiconSenseKey mirrors normalize_lexicon_translation_key (trim + collapse)', () => {
  assert.equal(normalizeLexiconSenseKey('  走る  '), '走る');
  assert.equal(normalizeLexiconSenseKey('世話 を  する'), '世話 を する');
  assert.equal(normalizeLexiconSenseKey('   '), null);
});

test('upsertAiTranslationSenses inserts all senses with insert-only conflict handling', async () => {
  const { client, upsertCalls } = createFakeAdmin(0);

  const result = await upsertAiTranslationSenses(client, 'entry-1', SENSES);

  assert.equal(result.inserted, 2);
  assert.equal(upsertCalls.length, 1);
  const [call] = upsertCalls;
  assert.deepEqual(call.options, {
    onConflict: 'lexicon_entry_id,normalized_translation_ja',
    ignoreDuplicates: true,
  });
  assert.deepEqual(call.rows, [
    {
      lexicon_entry_id: 'entry-1',
      translation_ja: '走る',
      normalized_translation_ja: '走る',
      meaning_summary: '移動する',
      // 主要語義は単語行そのものとして出題されるので distinct_key を付けない
      distinct_key: null,
      cefr_level: null,
      translation_source: 'ai',
      is_primary: true,
    },
    {
      lexicon_entry_id: 'entry-1',
      translation_ja: '経営する',
      normalized_translation_ja: '経営する',
      meaning_summary: null,
      distinct_key: '経営する',
      cefr_level: null,
      translation_source: 'ai',
      is_primary: false,
    },
  ]);
});

test('non-primary senses carry their distinct key and CEFR level', async () => {
  const { client, upsertCalls, updateCalls } = createFakeAdmin(0);

  await upsertAiTranslationSenses(client, 'entry-right', [
    { japanese: '右', meaningSummary: '方向', distinctKey: 'right_direction', cefrLevel: 'A1', isPrimary: true },
    { japanese: '権利', meaningSummary: '資格', distinctKey: 'right_entitlement', cefrLevel: 'B1', isPrimary: false },
  ]);

  assert.deepEqual(
    upsertCalls[0].rows.map((row) => [row.translation_ja, row.distinct_key, row.cefr_level]),
    [['右', null, 'A1'], ['権利', 'right_entitlement', 'B1']],
  );

  // 既存sense行は上書きしないが、CEFRが空の行だけは埋める
  assert.equal(updateCalls.length, 2);
  assert.deepEqual(updateCalls[0].values, { cefr_level: 'A1' });
  assert.deepEqual(updateCalls[0].filters, [
    ['eq', 'lexicon_entry_id', 'entry-right'],
    ['eq', 'normalized_translation_ja', '右'],
    ['is', 'cefr_level', null],
  ]);
});

test('upsertAiTranslationSenses never adds a primary when the entry already has senses', async () => {
  const { client, upsertCalls } = createFakeAdmin(2);

  await upsertAiTranslationSenses(client, 'entry-1', SENSES);

  assert.equal(upsertCalls.length, 1);
  for (const row of upsertCalls[0].rows) {
    assert.equal(row.is_primary, false);
  }
});

test('upsertAiTranslationSenses is a no-op for empty senses', async () => {
  const { client, upsertCalls } = createFakeAdmin(0);

  const result = await upsertAiTranslationSenses(client, 'entry-1', []);

  assert.deepEqual(result, { inserted: 0, skipped: 0 });
  assert.equal(upsertCalls.length, 0);
});
