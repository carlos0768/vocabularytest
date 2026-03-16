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

  getWord(id: string): WordRow | undefined {
    const row = this.words.get(id);
    return row ? { ...row } : undefined;
  }
}

test('needsWordLexiconResolution returns true only when linkage or tags are missing', () => {
  assert.equal(needsWordLexiconResolution({ lexiconEntryId: null, partOfSpeechTags: ['noun'] }), true);
  assert.equal(needsWordLexiconResolution({ lexiconEntryId: '11111111-1111-4111-8111-111111111111', partOfSpeechTags: [] }), true);
  assert.equal(needsWordLexiconResolution({ lexiconEntryId: '11111111-1111-4111-8111-111111111111', partOfSpeechTags: ['noun'] }), false);
});

test('processWordLexiconResolutionWords resolves unresolved words without overwriting stored text', async () => {
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

  let resolveCalls = 0;
  const stats = await processWordLexiconResolutionWords([wordId], {
    supabaseAdmin: supabase as never,
    resolveWords: async (words) => {
      resolveCalls += 1;
      assert.equal(words.length, 1);
      return {
        words: [
          {
            english: 'go',
            japanese: '行く',
            distractors: [],
            partOfSpeechTags: ['verb'],
            lexiconEntryId,
          },
        ],
        lexiconEntries: [],
        pendingEnrichmentCandidates: [
          {
            lexiconEntryId,
            english: 'go',
            pos: 'verb',
            japaneseHint: '行く',
          },
        ],
        metrics: {
          syncTranslationCount: 0,
          queuedHintValidationCount: 0,
          posInferredCount: 0,
          olpReusedCount: 0,
          runtimeCreatedCount: 0,
          resolverElapsedMs: 1,
        },
      };
    },
  });

  const updated = supabase.getWord(wordId);
  assert.equal(resolveCalls, 1);
  assert.equal(updated?.english, 'went');
  assert.equal(updated?.japanese, '行った');
  assert.equal(updated?.lexicon_entry_id, lexiconEntryId);
  assert.deepEqual(updated?.part_of_speech_tags, ['verb']);
  assert.equal(stats.wordCount, 1);
  assert.equal(stats.resolvedCount, 1);
  assert.equal(stats.tagBackfilledCount, 1);
  assert.equal(stats.skippedCount, 0);
  assert.deepEqual(stats.pendingEnrichmentCandidates, [
    {
      lexiconEntryId,
      english: 'go',
      pos: 'verb',
      japaneseHint: '行く',
    },
  ]);
});

test('processWordLexiconResolutionWords marks AI-backfilled rows with japaneseSource=ai', async () => {
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

  let receivedJapaneseSource: string | undefined;
  await processWordLexiconResolutionWords([wordId], {
    supabaseAdmin: supabase as never,
    aiTranslatedWordIds: [wordId],
    resolveWords: async (words) => {
      receivedJapaneseSource = words[0]?.japaneseSource;
      return {
        words: [
          {
            english: 'springboard',
            japanese: '出発点',
            distractors: [],
            partOfSpeechTags: ['noun'],
            japaneseSource: words[0]?.japaneseSource,
            lexiconEntryId: 'bbbbbbbb-2222-4222-8222-222222222222',
          },
        ],
        lexiconEntries: [],
        pendingEnrichmentCandidates: [],
        metrics: {
          syncTranslationCount: 0,
          queuedHintValidationCount: 0,
          posInferredCount: 0,
          olpReusedCount: 0,
          runtimeCreatedCount: 0,
          resolverElapsedMs: 1,
        },
      };
    },
  });

  assert.equal(receivedJapaneseSource, 'ai');
});

test('processWordLexiconResolutionWords backfills tags from lexicon entries without calling resolver', async () => {
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
      },
    ],
  );

  let resolveCalls = 0;
  const stats = await processWordLexiconResolutionWords([wordId], {
    supabaseAdmin: supabase as never,
    resolveWords: async () => {
      resolveCalls += 1;
      throw new Error('resolver should not be called');
    },
  });

  const updated = supabase.getWord(wordId);
  assert.equal(resolveCalls, 0);
  assert.equal(updated?.lexicon_entry_id, lexiconEntryId);
  assert.deepEqual(updated?.part_of_speech_tags, ['noun']);
  assert.equal(stats.resolvedCount, 0);
  assert.equal(stats.tagBackfilledCount, 1);
  assert.equal(stats.skippedCount, 0);
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

  let resolveCalls = 0;
  const stats = await processWordLexiconResolutionWords([existingWordId, missingWordId], {
    supabaseAdmin: supabase as never,
    resolveWords: async () => {
      resolveCalls += 1;
      return {
        words: [],
        lexiconEntries: [],
        pendingEnrichmentCandidates: [],
        metrics: {
          syncTranslationCount: 0,
          queuedHintValidationCount: 0,
          posInferredCount: 0,
          olpReusedCount: 0,
          runtimeCreatedCount: 0,
          resolverElapsedMs: 1,
        },
      };
    },
  });

  assert.equal(resolveCalls, 0);
  assert.equal(stats.wordCount, 2);
  assert.equal(stats.resolvedCount, 0);
  assert.equal(stats.tagBackfilledCount, 0);
  assert.equal(stats.skippedCount, 2);
  assert.deepEqual(stats.pendingEnrichmentCandidates, []);
});
