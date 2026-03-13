import assert from 'node:assert/strict';
import test from 'node:test';

import { buildLexiconKey, buildValidationKey } from './ai';
import { processLexiconEnrichmentCandidates } from './enrichment-jobs';

type LexiconEntryRow = {
  id: string;
  headword: string;
  pos: string;
  translation_ja: string | null;
  translation_source?: string | null;
};

class FakeEnrichmentSupabase {
  private readonly rows = new Map<string, LexiconEntryRow>();

  constructor(rows: LexiconEntryRow[]) {
    for (const row of rows) {
      this.rows.set(row.id, { ...row });
    }
  }

  from(table: string) {
    assert.equal(table, 'lexicon_entries');
    return new FakeEnrichmentQuery(this.rows);
  }

  getRow(id: string): LexiconEntryRow | undefined {
    const row = this.rows.get(id);
    return row ? { ...row } : undefined;
  }
}

class FakeEnrichmentQuery {
  private filters = new Map<string, unknown>();
  private action: 'select' | 'update' = 'select';
  private updatePayload: Partial<LexiconEntryRow> | null = null;

  constructor(private readonly rows: Map<string, LexiconEntryRow>) {}

  select(_columns: string) {
    return this;
  }

  eq(field: string, value: unknown) {
    this.filters.set(field, value);
    return this;
  }

  update(payload: Partial<LexiconEntryRow>) {
    this.action = 'update';
    this.updatePayload = payload;
    return this;
  }

  async maybeSingle<T>() {
    assert.equal(this.action, 'select');
    const id = String(this.filters.get('id'));
    return {
      data: (this.rows.get(id) as T | undefined) ?? null,
      error: null,
    };
  }

  async then<TResult1 = unknown, TResult2 = never>(
    onfulfilled?: ((value: { error: null | { message: string } }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    if (this.action !== 'update') {
      return Promise.resolve(onfulfilled ? onfulfilled({ error: null }) : (undefined as TResult1));
    }

    const id = String(this.filters.get('id'));
    const row = this.rows.get(id);
    if (!row) {
      const response = { error: { message: 'Row not found' } };
      return onfulfilled ? onfulfilled(response) : (response as TResult1);
    }

    Object.assign(row, this.updatePayload ?? {});
    const response = { error: null };
    return onfulfilled ? onfulfilled(response) : (response as TResult1);
  }
}

test('processLexiconEnrichmentCandidates stores accepted hints as scan translations', async () => {
  const supabase = new FakeEnrichmentSupabase([
    { id: 'lex-1', headword: 'compose', pos: 'verb', translation_ja: null },
  ]);

  const stats = await processLexiconEnrichmentCandidates(
    [
      { lexiconEntryId: 'lex-1', english: 'compose', pos: 'verb', japaneseHint: '作曲する' },
    ],
    {
      supabaseAdmin: supabase as never,
      validateTranslationCandidates: async (inputs) => new Map([
        [
          buildValidationKey(inputs[0].english, inputs[0].pos, inputs[0].japaneseHint),
          {
            useHint: true,
            normalizedJapanese: '作曲する',
            suggestedJapanese: null,
          },
        ],
      ]),
      translateWords: async () => new Map(),
    },
  );

  const row = supabase.getRow('lex-1');
  assert.equal(row?.translation_ja, '作曲する');
  assert.equal(row?.translation_source, 'scan');
  assert.equal(stats.validatedCount, 1);
  assert.equal(stats.translatedFallbackCount, 0);
});

test('processLexiconEnrichmentCandidates stores suggested AI translations when hint is rejected', async () => {
  const supabase = new FakeEnrichmentSupabase([
    { id: 'lex-2', headword: 'spring', pos: 'noun', translation_ja: null },
  ]);

  const stats = await processLexiconEnrichmentCandidates(
    [
      { lexiconEntryId: 'lex-2', english: 'spring', pos: 'noun', japaneseHint: '走る' },
    ],
    {
      supabaseAdmin: supabase as never,
      validateTranslationCandidates: async (inputs) => new Map([
        [
          buildValidationKey(inputs[0].english, inputs[0].pos, inputs[0].japaneseHint),
          {
            useHint: false,
            normalizedJapanese: null,
            suggestedJapanese: '春',
          },
        ],
      ]),
      translateWords: async () => new Map(),
    },
  );

  const row = supabase.getRow('lex-2');
  assert.equal(row?.translation_ja, '春');
  assert.equal(row?.translation_source, 'ai');
  assert.equal(stats.validatedCount, 1);
  assert.equal(stats.translatedFallbackCount, 0);
});

test('processLexiconEnrichmentCandidates falls back to batch translation when validation has no answer', async () => {
  const supabase = new FakeEnrichmentSupabase([
    { id: 'lex-3', headword: 'mailbox', pos: 'noun', translation_ja: null },
  ]);

  const stats = await processLexiconEnrichmentCandidates(
    [
      { lexiconEntryId: 'lex-3', english: 'mailbox', pos: 'noun', japaneseHint: '受信箱' },
    ],
    {
      supabaseAdmin: supabase as never,
      validateTranslationCandidates: async () => new Map(),
      translateWords: async (inputs) => new Map([
        [buildLexiconKey(inputs[0].english, inputs[0].pos), '郵便受け'],
      ]),
    },
  );

  const row = supabase.getRow('lex-3');
  assert.equal(row?.translation_ja, '郵便受け');
  assert.equal(row?.translation_source, 'ai');
  assert.equal(stats.validatedCount, 0);
  assert.equal(stats.translatedFallbackCount, 1);
});

test('processLexiconEnrichmentCandidates skips entries that are already translated', async () => {
  const supabase = new FakeEnrichmentSupabase([
    { id: 'lex-4', headword: 'book', pos: 'noun', translation_ja: '本', translation_source: 'scan' },
  ]);

  let validateCalls = 0;
  let translateCalls = 0;
  const stats = await processLexiconEnrichmentCandidates(
    [
      { lexiconEntryId: 'lex-4', english: 'book', pos: 'noun', japaneseHint: '本' },
    ],
    {
      supabaseAdmin: supabase as never,
      validateTranslationCandidates: async () => {
        validateCalls += 1;
        return new Map();
      },
      translateWords: async () => {
        translateCalls += 1;
        return new Map();
      },
    },
  );

  const row = supabase.getRow('lex-4');
  assert.equal(row?.translation_ja, '本');
  assert.equal(validateCalls, 0);
  assert.equal(translateCalls, 0);
  assert.equal(stats.validatedCount, 0);
  assert.equal(stats.translatedFallbackCount, 0);
});

test('processLexiconEnrichmentCandidates sanitizes verbose AI output before persisting', async () => {
  const supabase = new FakeEnrichmentSupabase([
    { id: 'lex-5', headword: 'antibiotics', pos: 'noun', translation_ja: null },
  ]);

  await processLexiconEnrichmentCandidates(
    [
      { lexiconEntryId: 'lex-5', english: 'antibiotics', pos: 'noun', japaneseHint: '抗生物質' },
    ],
    {
      supabaseAdmin: supabase as never,
      validateTranslationCandidates: async () => new Map(),
      translateWords: async (inputs) => new Map([
        [buildLexiconKey(inputs[0].english, inputs[0].pos), 'Here is the JSON requested: {"japanese":"抗生物質"}'],
      ]),
    },
  );

  const row = supabase.getRow('lex-5');
  assert.equal(row?.translation_ja, '抗生物質');
  assert.equal(row?.translation_source, 'ai');
});
