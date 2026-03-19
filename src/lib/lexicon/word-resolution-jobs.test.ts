import assert from 'node:assert/strict';
import test from 'node:test';

import {
  needsWordLexiconResolution,
  processWordLexiconResolutionWords,
} from './word-resolution-jobs';

type WordRow = {
  id: string;
  english: string;
  japanese: string;
  lexicon_entry_id: string | null;
  part_of_speech_tags: unknown | null;
};

type LexiconEntryRow = {
  id: string;
  pos: string;
  translation_ja?: string | null;
};

class FakeWordQuery {
  private action: 'select' | 'update' = 'select';
  private updatePayload: Record<string, unknown> | null = null;

  constructor(private readonly rows: Map<string, WordRow>) {}

  select() {
    return this;
  }

  async in(field: string, values: string[]) {
    assert.equal(field, 'id');
    return {
      data: values
        .map((value) => this.rows.get(value))
        .filter((row): row is WordRow => Boolean(row))
        .map((row) => ({ ...row })),
      error: null,
    };
  }

  update(payload: Record<string, unknown>) {
    this.action = 'update';
    this.updatePayload = payload;
    return this;
  }

  async eq(field: string, value: unknown) {
    assert.equal(field, 'id');
    assert.equal(this.action, 'update');
    const row = this.rows.get(String(value));
    if (!row) {
      return { error: { message: 'Row not found' } };
    }
    Object.assign(row, this.updatePayload ?? {});
    return { error: null };
  }
}

class FakeLexiconQuery {
  constructor(private readonly rows: Map<string, LexiconEntryRow>) {}

  select() {
    return this;
  }

  async in(field: string, values: string[]) {
    assert.equal(field, 'id');
    return {
      data: values
        .map((value) => this.rows.get(value))
        .filter((row): row is LexiconEntryRow => Boolean(row))
        .map((row) => ({ ...row })),
      error: null,
    };
  }
}

class FakeResolutionSupabase {
  private readonly words = new Map<string, WordRow>();
  private readonly lexiconEntries = new Map<string, LexiconEntryRow>();

  constructor(words: WordRow[], lexiconEntries: LexiconEntryRow[]) {
    for (const row of words) {
      this.words.set(row.id, { ...row });
    }
    for (const row of lexiconEntries) {
      this.lexiconEntries.set(row.id, { ...row });
    }
  }

  from(table: string) {
    if (table === 'words') {
      return new FakeWordQuery(this.words);
    }
    if (table === 'lexicon_entries') {
      return new FakeLexiconQuery(this.lexiconEntries);
    }
    throw new Error(`Unexpected table: ${table}`);
  }

  async rpc(fnName: string, params: { updates: string }) {
    const updates = JSON.parse(params.updates) as Array<Record<string, unknown>>;

    if (fnName === 'batch_update_word_lexicon_links') {
      for (const update of updates) {
        const row = this.words.get(String(update.id));
        if (!row) continue;
        if (update.lexicon_entry_id != null) {
          row.lexicon_entry_id = String(update.lexicon_entry_id);
        }
        if (update.part_of_speech_tags != null) {
          row.part_of_speech_tags = update.part_of_speech_tags;
        }
      }
      return { error: null };
    }

    if (fnName === 'batch_update_lexicon_translations') {
      for (const update of updates) {
        const row = this.lexiconEntries.get(String(update.id));
        if (!row) continue;
        row.translation_ja = String(update.translation_ja);
      }
      return { error: null };
    }

    return { error: { message: `Unknown RPC: ${fnName}` } };
  }

  getWord(id: string): WordRow | undefined {
    const row = this.words.get(id);
    return row ? { ...row } : undefined;
  }
}

function createLexiconEntry(overrides: Partial<{
  id: string;
  headword: string;
  normalizedHeadword: string;
  pos: string;
  translationJa?: string;
  translationSource?: string;
}>): {
  id: string;
  headword: string;
  normalizedHeadword: string;
  pos: string;
  datasetSources: string[];
  translationJa?: string;
  translationSource?: string;
  createdAt: string;
  updatedAt: string;
} {
  return {
    id: overrides.id ?? 'lex-seed',
    headword: overrides.headword ?? 'word',
    normalizedHeadword: overrides.normalizedHeadword ?? 'word',
    pos: overrides.pos ?? 'noun',
    datasetSources: ['runtime'],
    translationJa: overrides.translationJa,
    translationSource: overrides.translationSource,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  };
}

test('needsWordLexiconResolution returns true only when linkage or tags are missing', () => {
  assert.equal(needsWordLexiconResolution({ lexiconEntryId: null, partOfSpeechTags: ['noun'] }), true);
  assert.equal(needsWordLexiconResolution({ lexiconEntryId: '11111111-1111-4111-8111-111111111111', partOfSpeechTags: [] }), true);
  assert.equal(needsWordLexiconResolution({ lexiconEntryId: '11111111-1111-4111-8111-111111111111', partOfSpeechTags: ['noun'] }), false);
});

test('processWordLexiconResolutionWords creates runtime entries and preserves stored text', async () => {
  const wordId = '11111111-1111-4111-8111-111111111111';
  const lexiconEntryId = '22222222-2222-4222-8222-222222222222';
  const supabase = new FakeResolutionSupabase(
    [
      {
        id: wordId,
        english: 'went',
        japanese: '行った',
        lexicon_entry_id: null,
        part_of_speech_tags: null,
      },
    ],
    [],
  );

  const lookupCalls: string[][] = [];
  const upsertedEntries: Array<{
    translation_ja: string | null;
    translation_source: string | null;
  }> = [];
  const stats = await processWordLexiconResolutionWords([wordId], {
    supabaseAdmin: supabase as never,
    classifyPartOfSpeechBatch: async () => new Map([['went::行った', 'verb']]),
    lookupEntries: async (keys) => {
      lookupCalls.push(keys.map((key) => `${key.normalizedHeadword}::${key.pos}`));
      return lookupCalls.length === 1
        ? []
        : [
          createLexiconEntry({
            id: lexiconEntryId,
            headword: 'went',
            normalizedHeadword: 'went',
            pos: 'verb',
          }),
        ];
    },
    upsertRuntimeEntries: async (entries) => {
      upsertedEntries.push(...entries);
    },
    updateMasterTranslations: async () => undefined,
  });

  const updated = supabase.getWord(wordId);
  assert.equal(updated?.english, 'went');
  assert.equal(updated?.japanese, '行った');
  assert.equal(updated?.lexicon_entry_id, lexiconEntryId);
  assert.deepEqual(updated?.part_of_speech_tags, ['verb']);
  assert.equal(upsertedEntries.length, 1);
  assert.equal(upsertedEntries[0]?.translation_ja, null);
  assert.equal(stats.wordCount, 1);
  assert.equal(stats.resolvedCount, 1);
  assert.equal(stats.tagBackfilledCount, 1);
  assert.equal(stats.skippedCount, 0);
  assert.equal(stats.runtimeCreatedCount, 1);
  assert.deepEqual(stats.pendingEnrichmentCandidates, []);
});

test('processWordLexiconResolutionWords uses AI-translated japanese when creating runtime master rows', async () => {
  const wordId = 'aaaaaaaa-1111-4111-8111-111111111111';
  const supabase = new FakeResolutionSupabase(
    [
      {
        id: wordId,
        english: 'springboard',
        japanese: '出発点',
        lexicon_entry_id: null,
        part_of_speech_tags: ['noun'],
      },
    ],
    [],
  );

  const upsertedEntries: Array<{
    translation_ja: string | null;
    translation_source: string | null;
  }> = [];
  await processWordLexiconResolutionWords([wordId], {
    supabaseAdmin: supabase as never,
    aiTranslatedWordIds: [wordId],
    lookupEntries: async () => [],
    upsertRuntimeEntries: async (entries) => {
      upsertedEntries.push(...entries);
    },
    updateMasterTranslations: async () => undefined,
  });

  assert.equal(upsertedEntries.length, 1);
  assert.equal(upsertedEntries[0]?.translation_ja, '出発点');
  assert.equal(upsertedEntries[0]?.translation_source, 'ai');
});

test('processWordLexiconResolutionWords backfills missing master translation for linked ai words', async () => {
  const wordId = 'bbbbbbbb-1111-4111-8111-111111111111';
  const lexiconEntryId = 'cccccccc-2222-4222-8222-222222222222';
  const supabase = new FakeResolutionSupabase(
    [
      {
        id: wordId,
        english: 'beeline',
        japanese: '一直線',
        lexicon_entry_id: lexiconEntryId,
        part_of_speech_tags: ['noun'],
      },
    ],
    [
      {
        id: lexiconEntryId,
        pos: 'noun',
        translation_ja: null,
      },
    ],
  );

  const updatedMasters: Array<{ id: string; translationJa: string }> = [];
  const stats = await processWordLexiconResolutionWords([wordId], {
    supabaseAdmin: supabase as never,
    aiTranslatedWordIds: [wordId],
    lookupEntries: async () => [],
    updateMasterTranslations: async (updates) => {
      updatedMasters.push(...updates);
    },
  });

  assert.deepEqual(updatedMasters, [
    {
      id: lexiconEntryId,
      translationJa: '一直線',
    },
  ]);
  assert.equal(stats.resolvedCount, 0);
  assert.equal(stats.tagBackfilledCount, 0);
  assert.equal(stats.skippedCount, 1);
});

test('processWordLexiconResolutionWords backfills tags from lexicon entries without creating runtime rows', async () => {
  const wordId = '33333333-3333-4333-8333-333333333333';
  const lexiconEntryId = '44444444-4444-4444-8444-444444444444';
  const supabase = new FakeResolutionSupabase(
    [
      {
        id: wordId,
        english: 'book',
        japanese: '本',
        lexicon_entry_id: lexiconEntryId,
        part_of_speech_tags: null,
      },
    ],
    [
      {
        id: lexiconEntryId,
        pos: 'noun',
        translation_ja: '本',
      },
    ],
  );

  const stats = await processWordLexiconResolutionWords([wordId], {
    supabaseAdmin: supabase as never,
    lookupEntries: async () => {
      throw new Error('lookupEntries should not be called');
    },
  });

  const updated = supabase.getWord(wordId);
  assert.equal(updated?.lexicon_entry_id, lexiconEntryId);
  assert.deepEqual(updated?.part_of_speech_tags, ['noun']);
  assert.equal(stats.resolvedCount, 0);
  assert.equal(stats.tagBackfilledCount, 1);
  assert.equal(stats.skippedCount, 0);
  assert.equal(stats.runtimeCreatedCount, 0);
});

test('processWordLexiconResolutionWords skips deleted and already resolved words', async () => {
  const existingWordId = '55555555-5555-4555-8555-555555555555';
  const missingWordId = '66666666-6666-4666-8666-666666666666';
  const supabase = new FakeResolutionSupabase(
    [
      {
        id: existingWordId,
        english: 'cat',
        japanese: '猫',
        lexicon_entry_id: '77777777-7777-4777-8777-777777777777',
        part_of_speech_tags: ['noun'],
      },
    ],
    [],
  );

  const stats = await processWordLexiconResolutionWords([existingWordId, missingWordId], {
    supabaseAdmin: supabase as never,
    lookupEntries: async () => {
      throw new Error('lookupEntries should not be called');
    },
  });

  assert.equal(stats.wordCount, 2);
  assert.equal(stats.resolvedCount, 0);
  assert.equal(stats.tagBackfilledCount, 0);
  assert.equal(stats.skippedCount, 2);
  assert.deepEqual(stats.pendingEnrichmentCandidates, []);
});
