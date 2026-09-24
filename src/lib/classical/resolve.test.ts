import test from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';

import { resolveClassicalEntries } from '@/lib/classical/resolve';

type Row = Record<string, unknown>;

interface TableState {
  rows: Row[];
  selectError?: string;
  upsertError?: string;
}

/**
 * classical_entries / classical_senses だけを相手にする最小の偽 Supabase クライアント。
 * 実装が使うチェーン（select().in().order() / upsert().select()）を thenable で再現する。
 */
class FakeAdminClient {
  readonly upserted: Record<string, Row[][]> = {};

  constructor(private readonly tables: Record<string, TableState>) {}

  private state(table: string): TableState {
    if (!this.tables[table]) this.tables[table] = { rows: [] };
    return this.tables[table];
  }

  from(table: string) {
    const state = this.state(table);
    const upserted = this.upserted;

    const makeResult = (rows: Row[], error?: string) => {
      const payload = error ? { data: null, error: { message: error } } : { data: rows, error: null };
      const chain = {
        in(column: string, values: unknown[]) {
          return makeResult(rows.filter((row) => values.includes(row[column] as unknown)), error);
        },
        order(column: string) {
          const sorted = [...rows].sort(
            (a, b) => Number(a[column] ?? 0) - Number(b[column] ?? 0),
          );
          return makeResult(sorted, error);
        },
        select() {
          return makeResult(rows, error);
        },
        then(resolve: (value: unknown) => unknown) {
          return Promise.resolve(payload).then(resolve);
        },
      };
      return chain;
    };

    return {
      select() {
        return makeResult(state.rows, state.selectError);
      },
      upsert(rows: Row[]) {
        upserted[table] = upserted[table] ?? [];
        upserted[table].push(rows);
        if (state.upsertError) return makeResult([], state.upsertError);

        // onConflict + ignoreDuplicates 相当: 既存キーは書き換えない
        const inserted: Row[] = [];
        for (const row of rows) {
          const key =
            table === 'classical_entries'
              ? `${row.normalized_headword}|${row.pos}`
              : `${row.classical_entry_id}|${row.normalized_translation_ja}`;
          const exists = state.rows.some((existing) =>
            table === 'classical_entries'
              ? `${existing.normalized_headword}|${existing.pos}` === key
              : `${existing.classical_entry_id}|${existing.normalized_translation_ja}` === key,
          );
          if (exists) continue;
          const stored = { id: `${table}-${state.rows.length + inserted.length + 1}`, ...row };
          inserted.push(stored);
        }
        state.rows.push(...inserted);
        return makeResult(inserted);
      },
    };
  }
}

const asClient = (fake: FakeAdminClient): SupabaseClient => fake as unknown as SupabaseClient;

test('resolveClassicalEntries creates an entry and stores every translation from the image', async () => {
  const fake = new FakeAdminClient({ classical_entries: { rows: [] }, classical_senses: { rows: [] } });

  const resolutions = await resolveClassicalEntries(asClient(fake), [
    {
      headword: 'あさまし',
      reading: 'あさまし',
      pos: 'シク活用形容詞',
      translations: ['驚きあきれるほどだ', '情けない', 'みっともない'],
    },
  ]);

  const resolved = resolutions.get(0);
  assert.ok(resolved, 'the word should resolve to a dictionary entry');
  assert.deepEqual(resolved.translations, ['驚きあきれるほどだ', '情けない', 'みっともない']);

  const entryRows = fake.upserted.classical_entries?.[0] ?? [];
  assert.equal(entryRows.length, 1);
  assert.equal(entryRows[0].normalized_headword, 'あさまし');
  assert.equal(entryRows[0].pos, 'adjective');

  const senseRows = fake.upserted.classical_senses?.[0] ?? [];
  assert.equal(senseRows.length, 3);
  // 部分ユニークindexがあるので primary は1件だけ
  assert.equal(senseRows.filter((row) => row.is_primary === true).length, 1);
  assert.equal(senseRows[0].is_primary, true);
  assert.deepEqual(senseRows.map((row) => row.position), [0, 1, 2]);
});

test('resolveClassicalEntries reuses a stored entry as-is when the image shows fewer meanings', async () => {
  // ヒント流用の本体: ①しか写っていない写真でも保存済みの完全な語義セットが返る
  const fake = new FakeAdminClient({
    classical_entries: {
      rows: [
        { id: 'entry-1', normalized_headword: 'あさまし', pos: 'adjective', headword: 'あさまし' },
      ],
    },
    classical_senses: {
      rows: [
        { id: 's1', classical_entry_id: 'entry-1', translation_ja: '驚きあきれるほどだ', normalized_translation_ja: '驚きあきれるほどだ', position: 0 },
        { id: 's2', classical_entry_id: 'entry-1', translation_ja: '情けない', normalized_translation_ja: '情けない', position: 1 },
        { id: 's3', classical_entry_id: 'entry-1', translation_ja: 'みっともない', normalized_translation_ja: 'みっともない', position: 2 },
      ],
    },
  });

  const resolutions = await resolveClassicalEntries(asClient(fake), [
    { headword: 'あさまし', pos: 'シク活用形容詞', translations: ['驚きあきれるほどだ'] },
  ]);

  const resolved = resolutions.get(0);
  assert.ok(resolved);
  assert.equal(resolved.entryId, 'entry-1');
  assert.deepEqual(resolved.translations, ['驚きあきれるほどだ', '情けない', 'みっともない']);
  // 既存語義しか無いので新規 sense の書き込みは発生しない
  assert.equal(fake.upserted.classical_senses, undefined);
  assert.equal(fake.upserted.classical_entries, undefined);
});

test('resolveClassicalEntries appends image-only meanings after the stored ones', async () => {
  const fake = new FakeAdminClient({
    classical_entries: {
      rows: [{ id: 'entry-1', normalized_headword: 'ゆかし', pos: 'adjective', headword: 'ゆかし' }],
    },
    classical_senses: {
      rows: [
        { id: 's1', classical_entry_id: 'entry-1', translation_ja: '心ひかれる', normalized_translation_ja: '心ひかれる', position: 0 },
      ],
    },
  });

  const resolutions = await resolveClassicalEntries(asClient(fake), [
    { headword: 'ゆかし', pos: 'シク活用形容詞', translations: ['見たい', '心ひかれる', '知りたい'] },
  ]);

  const resolved = resolutions.get(0);
  assert.ok(resolved);
  // 保存済みが先、画像にしか無かった語義が後ろ。既存の順序は動かさない
  assert.deepEqual(resolved.translations, ['心ひかれる', '見たい', '知りたい']);

  const senseRows = fake.upserted.classical_senses?.[0] ?? [];
  assert.deepEqual(senseRows.map((row) => row.translation_ja), ['見たい', '知りたい']);
  // 既存語義があるエントリなので primary は立てない
  assert.equal(senseRows.every((row) => row.is_primary === false), true);
  assert.deepEqual(senseRows.map((row) => row.position), [1, 2]);
});

test('resolveClassicalEntries reuses one entry across textbooks that label the POS differently', async () => {
  // 活用型をキーに含めると、教材Aの「シク活用形容詞」と教材Bの「形容詞」が
  // 別エントリに分裂してヒント流用が黙って効かなくなる。分裂しないことを固定する。
  const fake = new FakeAdminClient({ classical_entries: { rows: [] }, classical_senses: { rows: [] } });

  const resolutions = await resolveClassicalEntries(asClient(fake), [
    { headword: 'あさまし', pos: 'シク活用形容詞', translations: ['驚きあきれるほどだ'] },
    { headword: 'あさまし', pos: '形容詞', translations: ['情けない'] },
    { headword: 'あさまし', pos: '形シク', translations: ['みっともない'] },
  ]);

  assert.equal(resolutions.get(0)?.entryId, resolutions.get(1)?.entryId);
  assert.equal(resolutions.get(1)?.entryId, resolutions.get(2)?.entryId);
  assert.equal((fake.upserted.classical_entries?.[0] ?? []).length, 1);
  assert.deepEqual(resolutions.get(0)?.translations, [
    '驚きあきれるほどだ',
    '情けない',
    'みっともない',
  ]);
});

test('resolveClassicalEntries records the conjugation type without putting it in the key', async () => {
  const fake = new FakeAdminClient({ classical_entries: { rows: [] }, classical_senses: { rows: [] } });

  await resolveClassicalEntries(asClient(fake), [
    { headword: 'をかし', pos: 'シク活用形容詞', translations: ['趣がある'] },
  ]);

  const entryRow = (fake.upserted.classical_entries?.[0] ?? [])[0];
  assert.equal(entryRow.pos, 'adjective');
  assert.equal(entryRow.conjugation_type, 'シク活用');
});

test('resolveClassicalEntries refuses a headword that is not Japanese', async () => {
  // AIが英単語を古典語と誤判定しても共通辞書は汚さない（誤りが全ユーザーに伝播するため）
  const fake = new FakeAdminClient({ classical_entries: { rows: [] }, classical_senses: { rows: [] } });

  const resolutions = await resolveClassicalEntries(asClient(fake), [
    { headword: 'admire', pos: '動詞', translations: ['敬服する'] },
  ]);

  assert.equal(resolutions.size, 0);
  assert.equal(fake.upserted.classical_entries, undefined);
});

test('resolveClassicalEntries keys entries by headword and pos so homographs stay separate', async () => {
  const fake = new FakeAdminClient({ classical_entries: { rows: [] }, classical_senses: { rows: [] } });

  const resolutions = await resolveClassicalEntries(asClient(fake), [
    { headword: 'あし', pos: 'ク活用形容詞', translations: ['悪い'] },
    { headword: 'あし', pos: '名詞', translations: ['葦'] },
  ]);

  const first = resolutions.get(0);
  const second = resolutions.get(1);
  assert.ok(first);
  assert.ok(second);
  assert.notEqual(first.entryId, second.entryId);
  assert.deepEqual(first.translations, ['悪い']);
  assert.deepEqual(second.translations, ['葦']);
});

test('resolveClassicalEntries dedupes a headword repeated within one image', async () => {
  const fake = new FakeAdminClient({ classical_entries: { rows: [] }, classical_senses: { rows: [] } });

  const resolutions = await resolveClassicalEntries(asClient(fake), [
    { headword: 'あはれ', pos: '名詞', translations: ['しみじみとした情趣'] },
    { headword: 'あはれ', pos: '名詞', translations: ['かわいそうだ'] },
  ]);

  assert.equal(resolutions.get(0)?.entryId, resolutions.get(1)?.entryId);
  // 同じエントリに両方の語義がまとまる
  assert.deepEqual(resolutions.get(0)?.translations, ['しみじみとした情趣', 'かわいそうだ']);
  assert.equal((fake.upserted.classical_entries?.[0] ?? []).length, 1);
});

test('resolveClassicalEntries stays best-effort when the dictionary is unavailable', async () => {
  // 辞書が無い/落ちている環境でもスキャンを止めない
  const fake = new FakeAdminClient({
    classical_entries: { rows: [], selectError: 'relation "classical_entries" does not exist' },
    classical_senses: { rows: [] },
  });

  const resolutions = await resolveClassicalEntries(asClient(fake), [
    { headword: 'あさまし', pos: 'シク活用形容詞', translations: ['驚きあきれるほどだ'] },
  ]);

  assert.equal(resolutions.size, 0);
});

test('resolveClassicalEntries skips words with an unusable headword', async () => {
  const fake = new FakeAdminClient({ classical_entries: { rows: [] }, classical_senses: { rows: [] } });

  const resolutions = await resolveClassicalEntries(asClient(fake), [
    { headword: '   ', pos: '名詞', translations: ['なにか'] },
  ]);

  assert.equal(resolutions.size, 0);
});
