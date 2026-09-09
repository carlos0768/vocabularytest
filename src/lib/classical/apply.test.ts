import test from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';

import {
  applyClassicalDictionary,
  type ClassicalApplicableWord,
} from '@/lib/classical/apply';

/** 「呼ばれたら失敗する」クライアント。DBに触れないことを証明するために使う。 */
const forbiddenClient = new Proxy({}, {
  get() {
    throw new Error('the dictionary must not be touched when no classical word is present');
  },
}) as unknown as SupabaseClient;

interface FakeTable {
  rows: Record<string, unknown>[];
}

function makeClient(tables: Record<string, FakeTable>): SupabaseClient {
  const chain = (rows: Record<string, unknown>[]): Record<string, unknown> => ({
    in: (column: string, values: unknown[]) =>
      chain(rows.filter((row) => values.includes(row[column]))),
    order: () => chain(rows),
    select: () => chain(rows),
    then: (resolve: (value: unknown) => unknown) =>
      Promise.resolve({ data: rows, error: null }).then(resolve),
  });

  return {
    from(table: string) {
      const state = tables[table] ?? { rows: [] };
      return {
        select: () => chain(state.rows),
        upsert: (rows: Record<string, unknown>[]) => {
          const inserted = rows.map((row, index) => ({ id: `${table}-${index + 1}`, ...row }));
          state.rows.push(...inserted);
          return chain(inserted);
        },
      };
    },
  } as unknown as SupabaseClient;
}

test('applyClassicalDictionary touches nothing when the scan has no classical word', async () => {
  // 英単語だけのスキャンにコストを乗せないことが要件
  const words: ClassicalApplicableWord[] = [
    { english: 'admire', japanese: '敬服する', translations: ['敬服する'] },
  ];
  const result = await applyClassicalDictionary(words, { supabaseAdmin: forbiddenClient });

  assert.equal(result.classicalCount, 0);
  assert.equal(result.resolvedCount, 0);
  assert.equal(result.words[0].classicalEntryId, undefined);
});

test('applyClassicalDictionary stamps the dictionary link on a classical word', async () => {
  const client = makeClient({ classical_entries: { rows: [] }, classical_senses: { rows: [] } });

  const words: ClassicalApplicableWord[] = [
    {
      english: 'あさまし',
      isClassical: true,
      classicalPos: 'シク活用形容詞',
      japanese: '驚きあきれるほどだ',
      translations: ['驚きあきれるほどだ', '情けない'],
    },
  ];
  const result = await applyClassicalDictionary(words, { supabaseAdmin: client });

  assert.equal(result.classicalCount, 1);
  assert.equal(result.resolvedCount, 1);
  assert.equal(typeof result.words[0].classicalEntryId, 'string');
});

test('applyClassicalDictionary reuses stored meanings when the image shows fewer', async () => {
  // ヒント流用の到達点: 画像に①しか写っていなくても完全な語義セットになる
  const client = makeClient({
    classical_entries: {
      rows: [{ id: 'entry-1', normalized_headword: 'あさまし', pos: 'adjective', headword: 'あさまし' }],
    },
    classical_senses: {
      rows: [
        { classical_entry_id: 'entry-1', translation_ja: '驚きあきれるほどだ', normalized_translation_ja: '驚きあきれるほどだ', position: 0 },
        { classical_entry_id: 'entry-1', translation_ja: '情けない', normalized_translation_ja: '情けない', position: 1 },
        { classical_entry_id: 'entry-1', translation_ja: 'みっともない', normalized_translation_ja: 'みっともない', position: 2 },
      ],
    },
  });

  const words: ClassicalApplicableWord[] = [
    {
      english: 'あさまし',
      isClassical: true,
      classicalPos: 'シク活用形容詞',
      japanese: '驚きあきれるほどだ',
      translations: ['驚きあきれるほどだ'],
    },
  ];
  const result = await applyClassicalDictionary(words, { supabaseAdmin: client });

  const word = result.words[0] as ClassicalApplicableWord & {
    translations?: Array<{ translationJa: string }>;
  };
  assert.equal(word.japanese, '驚きあきれるほどだ');
  assert.deepEqual(
    word.translations?.map((translation) => translation.translationJa),
    ['驚きあきれるほどだ', '情けない', 'みっともない'],
  );
});

test('applyClassicalDictionary keeps the scan alive when the dictionary throws', async () => {
  const throwingClient = {
    from() {
      throw new Error('connection reset');
    },
  } as unknown as SupabaseClient;

  const words: ClassicalApplicableWord[] = [
    { english: 'ゆかし', isClassical: true, japanese: '心ひかれる', translations: ['心ひかれる'] },
  ];
  const result = await applyClassicalDictionary(words, { supabaseAdmin: throwingClient });

  assert.equal(result.resolvedCount, 0);
  assert.equal(result.classicalCount, 1);
  // 画像由来の訳はそのまま残る
  assert.equal(result.words[0].japanese, '心ひかれる');
});
