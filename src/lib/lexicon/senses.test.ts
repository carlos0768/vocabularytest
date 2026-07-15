import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeLexiconSenseKey, upsertAiTranslationSenses } from '@/lib/lexicon/senses';
import type { TranslatedSense } from '@/lib/lexicon/types';

interface UpsertCall {
  rows: Array<Record<string, unknown>>;
  options: Record<string, unknown>;
}

function createFakeAdmin(existingSenseCount: number) {
  const upsertCalls: UpsertCall[] = [];
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
      };
    },
  };
  return { client: client as never, upsertCalls };
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
      translation_source: 'ai',
      is_primary: true,
    },
    {
      lexicon_entry_id: 'entry-1',
      translation_ja: '経営する',
      normalized_translation_ja: '経営する',
      meaning_summary: null,
      translation_source: 'ai',
      is_primary: false,
    },
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
