import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveOrCreateLexiconEntry,
  resolveWordsWithLexicon,
  type ResolveLexiconDeps,
  type ValidatedTranslationCandidate,
} from './resolver';

type LexiconEntryRow = {
  id: string;
  headword: string;
  normalized_headword: string;
  pos: string;
  cefr_level: string | null;
  dataset_sources: string[] | null;
  translation_ja: string | null;
  translation_source: string | null;
  created_at: string;
  updated_at: string;
};

type QueryResult<T> = Promise<{ data: T | null; error: { message: string } | null }>;

class FakeLexiconSupabase {
  private rows: LexiconEntryRow[];
  private nextId = 1;
  private clock = 0;

  constructor(rows: LexiconEntryRow[] = []) {
    this.rows = rows.map((row) => ({ ...row }));
    this.nextId = rows.length + 1;
  }

  from(table: string) {
    assert.equal(table, 'lexicon_entries');
    return new FakeLexiconQuery(this);
  }

  getRows(): LexiconEntryRow[] {
    return this.rows.map((row) => ({ ...row }));
  }

  find(filters: Map<string, unknown>): LexiconEntryRow | null {
    for (const row of this.rows) {
      let matches = true;
      for (const [field, value] of filters.entries()) {
        if ((row as Record<string, unknown>)[field] !== value) {
          matches = false;
          break;
        }
      }
      if (matches) {
        return row;
      }
    }
    return null;
  }

  update(filters: Map<string, unknown>, payload: Partial<LexiconEntryRow>): LexiconEntryRow | null {
    const row = this.find(filters);
    if (!row) return null;
    Object.assign(row, payload, { updated_at: this.now() });
    return { ...row };
  }

  insert(payload: Partial<LexiconEntryRow>): LexiconEntryRow {
    const timestamp = this.now();
    const row: LexiconEntryRow = {
      id: `lex-${this.nextId++}`,
      headword: String(payload.headword ?? ''),
      normalized_headword: String(payload.normalized_headword ?? ''),
      pos: String(payload.pos ?? 'other'),
      cefr_level: (payload.cefr_level as string | null | undefined) ?? null,
      dataset_sources: (payload.dataset_sources as string[] | null | undefined) ?? null,
      translation_ja: (payload.translation_ja as string | null | undefined) ?? null,
      translation_source: (payload.translation_source as string | null | undefined) ?? null,
      created_at: timestamp,
      updated_at: timestamp,
    };
    this.rows.push(row);
    return { ...row };
  }

  private now(): string {
    const value = new Date(this.clock * 1000).toISOString();
    this.clock += 1;
    return value;
  }
}

class FakeLexiconQuery {
  private filters = new Map<string, unknown>();
  private action: 'select' | 'update' | 'insert' = 'select';
  private updatePayload: Partial<LexiconEntryRow> | null = null;
  private insertPayload: Partial<LexiconEntryRow> | null = null;

  constructor(private readonly supabase: FakeLexiconSupabase) {}

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

  insert(payload: Partial<LexiconEntryRow>) {
    this.action = 'insert';
    this.insertPayload = payload;
    return this;
  }

  maybeSingle<T>(): QueryResult<T> {
    assert.equal(this.action, 'select');
    return Promise.resolve({
      data: (this.supabase.find(this.filters) as T | null) ?? null,
      error: null,
    });
  }

  single<T>(): QueryResult<T> {
    if (this.action === 'update') {
      const row = this.supabase.update(this.filters, this.updatePayload ?? {});
      return Promise.resolve({
        data: (row as T | null) ?? null,
        error: row ? null : { message: 'Row not found' },
      });
    }

    if (this.action === 'insert') {
      const row = this.supabase.insert(this.insertPayload ?? {});
      return Promise.resolve({ data: row as T, error: null });
    }

    const row = this.supabase.find(this.filters);
    return Promise.resolve({
      data: (row as T | null) ?? null,
      error: row ? null : { message: 'Row not found' },
    });
  }
}

function createDeps(
  supabase: FakeLexiconSupabase,
  translateWord: ResolveLexiconDeps['translateWord'],
  validateTranslationCandidate?: ResolveLexiconDeps['validateTranslationCandidate'],
  translateWords?: ResolveLexiconDeps['translateWords'],
): ResolveLexiconDeps {
  return {
    supabaseAdmin: supabase as unknown as ResolveLexiconDeps['supabaseAdmin'],
    translateWord,
    validateTranslationCandidate,
    translateWords,
  };
}

function acceptHint(normalizedJapanese?: string): ValidatedTranslationCandidate {
  return {
    useHint: true,
    normalizedJapanese: normalizedJapanese ?? null,
    suggestedJapanese: null,
  };
}

function rejectHint(suggestedJapanese?: string): ValidatedTranslationCandidate {
  return {
    useHint: false,
    normalizedJapanese: null,
    suggestedJapanese: suggestedJapanese ?? null,
  };
}

function createRow(
  overrides: Partial<LexiconEntryRow> & Pick<LexiconEntryRow, 'headword' | 'normalized_headword' | 'pos'>,
): LexiconEntryRow {
  return {
    id: overrides.id ?? 'lex-seed',
    headword: overrides.headword,
    normalized_headword: overrides.normalized_headword,
    pos: overrides.pos,
    cefr_level: overrides.cefr_level ?? null,
    dataset_sources: overrides.dataset_sources ?? ['olp_cefrj'],
    translation_ja: overrides.translation_ja ?? null,
    translation_source: overrides.translation_source ?? null,
    created_at: overrides.created_at ?? new Date(0).toISOString(),
    updated_at: overrides.updated_at ?? new Date(0).toISOString(),
  };
}

test('resolveOrCreateLexiconEntry reuses existing translation without AI fallback', async () => {
  const supabase = new FakeLexiconSupabase([
    createRow({
      headword: 'cat',
      normalized_headword: 'cat',
      pos: 'noun',
      cefr_level: 'A1',
      translation_ja: '猫',
      translation_source: 'scan',
    }),
  ]);

  let translateCalls = 0;
  const entry = await resolveOrCreateLexiconEntry(
    { english: 'Cat', partOfSpeechTags: ['noun'] },
    createDeps(supabase, async () => {
      translateCalls += 1;
      return 'unused';
    }),
  );

  assert.equal(entry?.id, 'lex-seed');
  assert.equal(entry?.translationJa, '猫');
  assert.equal(entry?.cefrLevel, 'A1');
  assert.equal(translateCalls, 0);
});

test('resolveOrCreateLexiconEntry sanitizes verbose stored translations when reusing lexicon rows', async () => {
  const supabase = new FakeLexiconSupabase([
    createRow({
      headword: 'antibiotics',
      normalized_headword: 'antibiotics',
      pos: 'noun',
      translation_ja: '思考プロセス: 1. 入力の理解 2. 最終出力: 抗生物質',
      translation_source: 'ai',
    }),
  ]);

  const entry = await resolveOrCreateLexiconEntry(
    { english: 'antibiotics', partOfSpeechTags: ['noun'] },
    createDeps(supabase, async () => 'unused'),
  );

  assert.equal(entry?.translationJa, '抗生物質');
  assert.equal(entry?.translationSource, 'ai');
});

test('resolveOrCreateLexiconEntry drops english-only JSON preamble translations', async () => {
  const supabase = new FakeLexiconSupabase([
    createRow({
      headword: 'engaged',
      normalized_headword: 'engaged',
      pos: 'adjective',
      translation_ja: 'Here is the JSON requested:',
      translation_source: 'ai',
    }),
  ]);

  const entry = await resolveOrCreateLexiconEntry(
    { english: 'engaged', partOfSpeechTags: ['adjective'] },
    createDeps(supabase, async () => 'unused'),
  );

  assert.equal(entry?.translationJa, undefined);
});

test('resolveOrCreateLexiconEntry fills missing translation from scan hint and persists it', async () => {
  const supabase = new FakeLexiconSupabase([
    createRow({
      headword: 'run',
      normalized_headword: 'run',
      pos: 'verb',
      translation_ja: null,
    }),
  ]);

  let translateCalls = 0;
  const entry = await resolveOrCreateLexiconEntry(
    { english: 'run', japaneseHint: '走る', partOfSpeechTags: ['verb'] },
    createDeps(
      supabase,
      async () => {
        translateCalls += 1;
        return 'unused';
      },
      async () => acceptHint('走る'),
    ),
  );

  assert.equal(entry?.translationJa, '走る');
  assert.equal(entry?.translationSource, 'scan');
  assert.equal(translateCalls, 0);

  const [persisted] = supabase.getRows();
  assert.equal(persisted.translation_ja, '走る');
  assert.equal(persisted.translation_source, 'scan');
});

test('resolveOrCreateLexiconEntry creates and then reuses runtime rows with AI fallback', async () => {
  const supabase = new FakeLexiconSupabase();
  let translateCalls = 0;
  const deps = createDeps(supabase, async () => {
    translateCalls += 1;
    return '思考プロセス: 1. 入力の理解 2. 最終出力: 本';
  });

  const first = await resolveOrCreateLexiconEntry(
    { english: 'book', partOfSpeechTags: ['noun'] },
    deps,
  );
  const second = await resolveOrCreateLexiconEntry(
    { english: 'book', partOfSpeechTags: ['noun'] },
    deps,
  );

  assert.equal(first?.translationJa, '本');
  assert.equal(first?.translationSource, 'ai');
  assert.deepEqual(first?.datasetSources, ['runtime']);
  assert.equal(second?.id, first?.id);
  assert.equal(translateCalls, 1);
  assert.equal(supabase.getRows().length, 1);
});

test('resolveWordsWithLexicon prefers a later scan hint over AI fallback for duplicate keys', async () => {
  const supabase = new FakeLexiconSupabase();
  let translateCalls = 0;
  const result = await resolveWordsWithLexicon(
    [
      {
        english: 'Book',
        japanese: '',
        distractors: [],
        partOfSpeechTags: ['noun'],
      },
      {
        english: 'book',
        japanese: '本',
        distractors: [],
        partOfSpeechTags: ['noun'],
      },
    ],
    createDeps(
      supabase,
      async () => {
        translateCalls += 1;
        return 'AI訳';
      },
      async () => acceptHint('本'),
    ),
  );

  assert.equal(translateCalls, 0);
  assert.equal(result.lexiconEntries.length, 1);
  assert.equal(result.lexiconEntries[0]?.translationJa, '本');
  assert.equal(result.lexiconEntries[0]?.translationSource, 'scan');
  assert.equal(result.words[0]?.japanese, '本');
  assert.equal(result.words[1]?.japanese, '本');
});

test('resolveWordsWithLexicon batches AI translations for words without japanese hints', async () => {
  const supabase = new FakeLexiconSupabase();
  let singleCalls = 0;
  let batchCalls = 0;

  const result = await resolveWordsWithLexicon(
    [
      { english: 'engaged', japanese: '', distractors: [], partOfSpeechTags: ['adjective'] },
      { english: 'railroad', japanese: '', distractors: [], partOfSpeechTags: ['noun'] },
    ],
    createDeps(
      supabase,
      async () => {
        singleCalls += 1;
        return 'should-not-run';
      },
      undefined,
      async (inputs) => {
        batchCalls += 1;
        const map = new Map<string, string | null>();
        for (const input of inputs) {
          map.set(`${input.english.toLowerCase()}::${input.pos}`, input.english === 'engaged' ? '従事している' : '鉄道');
        }
        return map;
      },
    ),
  );

  assert.equal(batchCalls, 1);
  assert.equal(singleCalls, 0);
  assert.equal(result.words[0]?.japanese, '従事している');
  assert.equal(result.words[1]?.japanese, '鉄道');
});

test('resolveOrCreateLexiconEntry rejects invalid scan hint for master and uses AI fallback instead', async () => {
  const supabase = new FakeLexiconSupabase([
    createRow({
      headword: 'spring',
      normalized_headword: 'spring',
      pos: 'noun',
      translation_ja: null,
    }),
  ]);

  let translateCalls = 0;
  const entry = await resolveOrCreateLexiconEntry(
    { english: 'spring', japaneseHint: '走る', partOfSpeechTags: ['noun'] },
    createDeps(
      supabase,
      async () => {
        translateCalls += 1;
        return '春';
      },
      async () => rejectHint('春'),
    ),
  );

  assert.equal(entry?.translationJa, '春');
  assert.equal(entry?.translationSource, 'ai');
  assert.equal(translateCalls, 0);

  const [persisted] = supabase.getRows();
  assert.equal(persisted.translation_ja, '春');
  assert.equal(persisted.translation_source, 'ai');
});

test('resolveOrCreateLexiconEntry does not persist unvalidated scan hint when no validator or AI fallback is available', async () => {
  const supabase = new FakeLexiconSupabase([
    createRow({
      headword: 'light',
      normalized_headword: 'light',
      pos: 'noun',
      translation_ja: null,
    }),
  ]);

  const entry = await resolveOrCreateLexiconEntry(
    { english: 'light', japaneseHint: '走る', partOfSpeechTags: ['noun'] },
    createDeps(
      supabase,
      async () => null,
      async () => null,
    ),
  );

  assert.equal(entry?.translationJa, undefined);

  const [persisted] = supabase.getRows();
  assert.equal(persisted.translation_ja, null);
  assert.equal(persisted.translation_source, null);
});
