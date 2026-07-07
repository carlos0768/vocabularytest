import test from 'node:test';
import assert from 'node:assert/strict';

import {
  fetchDefaultOfficialWordbooksForLocalImport,
  persistDefaultOfficialWordbooksToDb,
  type DefaultOfficialWordbookImportItem,
} from './import-default';

type QueryAction = 'select' | 'insert' | 'upsert' | 'delete';

interface QueryFilter {
  field: string;
  value: unknown;
}

interface QueryOrder {
  column: string;
  options: unknown;
}

interface QueryOperation {
  table: string;
  action: QueryAction;
  payload?: unknown;
  options?: unknown;
  columns?: string;
  filters: QueryFilter[];
  orders: QueryOrder[];
}

class FakeOfficialWordbookQuery {
  constructor(
    private readonly client: FakeOfficialWordbookClient,
    private readonly operation: QueryOperation,
  ) {}

  eq(field: string, value: unknown) {
    this.operation.filters.push({ field, value });
    return this;
  }

  in(field: string, values: unknown[]) {
    this.operation.filters.push({ field, value: values });
    return this;
  }

  order(column: string, options: unknown) {
    this.operation.orders.push({ column, options });
    return this;
  }

  select(columns = '*') {
    this.operation.columns = columns;
    return this;
  }

  async single<T = unknown>(): Promise<{ data: T | null; error: null }> {
    return this.client.resolveSingle<T>(this.operation);
  }

  then<TResult1 = { data: unknown; error: null }, TResult2 = never>(
    onfulfilled?: ((value: { data: unknown; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.client.resolveQuery(this.operation).then(onfulfilled, onrejected);
  }
}

class FakeOfficialWordbookClient {
  readonly operations: QueryOperation[] = [];

  constructor(
    private readonly fixtures: {
      officialWordbooks?: Array<Record<string, unknown>>;
      wordsByWordbookId?: Record<string, Array<Record<string, unknown>>>;
    } = {},
  ) {}

  from(table: string) {
    return {
      select: (columns = '*') => this.createOperation(table, 'select', undefined, columns),
      insert: (payload: unknown) => this.createOperation(table, 'insert', payload),
      upsert: (payload: unknown, options?: unknown) => this.createOperation(table, 'upsert', payload, undefined, options),
      delete: () => this.createOperation(table, 'delete'),
    };
  }

  createOperation(
    table: string,
    action: QueryAction,
    payload?: unknown,
    columns?: string,
    options?: unknown,
  ) {
    const operation: QueryOperation = {
      table,
      action,
      payload,
      options,
      columns,
      filters: [],
      orders: [],
    };
    this.operations.push(operation);
    return new FakeOfficialWordbookQuery(this, operation);
  }

  async resolveSingle<T>(operation: QueryOperation): Promise<{ data: T | null; error: null }> {
    if (operation.table === 'official_wordbooks' && operation.action === 'insert') {
      const projectIndex = this.operations
        .filter((item) => item.table === 'official_wordbooks' && item.action === 'insert')
        .indexOf(operation) + 1;
      return {
        data: { id: `project-${projectIndex}` } as T,
        error: null,
      };
    }
    throw new Error(`Unexpected single operation: ${operation.table}.${operation.action}`);
  }

  async resolveQuery(operation: QueryOperation): Promise<{ data: unknown; error: null }> {
    if (operation.table === 'official_wordbooks' && operation.action === 'select') {
      return {
        data: this.fixtures.officialWordbooks ?? [],
        error: null,
      };
    }

    if (operation.table === 'official_wordbook_words' && operation.action === 'select') {
      const projectId = operation.filters.find((filter) => filter.field === 'official_wordbook_id')?.value;
      return {
        data: typeof projectId === 'string' ? this.fixtures.wordsByWordbookId?.[projectId] ?? [] : [],
        error: null,
      };
    }

    if (operation.table === 'official_wordbook_words' && operation.action === 'insert') {
      const rows = Array.isArray(operation.payload) ? operation.payload : [];
      return {
        data: rows.map((_, index) => ({ id: `word-${index + 1}` })),
        error: null,
      };
    }

    if (operation.table === 'official_wordbooks' && operation.action === 'delete') {
      return { data: null, error: null };
    }

    throw new Error(`Unexpected query operation: ${operation.table}.${operation.action}`);
  }
}

function findOperation(client: FakeOfficialWordbookClient, table: string, action: QueryAction): QueryOperation {
  const operation = client.operations.find((item) => item.table === table && item.action === action);
  assert.ok(operation, `expected ${table}.${action} operation`);
  return operation;
}

function findOperations(client: FakeOfficialWordbookClient, table: string, action: QueryAction): QueryOperation[] {
  return client.operations.filter((item) => item.table === table && item.action === action);
}

test('default official wordbook local payload skips null eiken levels', async () => {
  const client = new FakeOfficialWordbookClient();

  const result = await fetchDefaultOfficialWordbooksForLocalImport(client as never, null);

  assert.equal(result, null);
  assert.equal(client.operations.length, 0);
});

test('default official wordbook local payload returns null when the level has no official wordbooks', async () => {
  const client = new FakeOfficialWordbookClient({ officialWordbooks: [] });

  const result = await fetchDefaultOfficialWordbooksForLocalImport(client as never, '3');

  assert.equal(result, null);

  const projectSelect = findOperation(client, 'official_wordbooks', 'select');
  assert.deepEqual(projectSelect.filters, [
    { field: 'eiken_level', value: '3' },
    { field: 'is_active', value: true },
  ]);
});

test('default official wordbook local payload reads dedicated official tables without creating remote user rows', async () => {
  const client = new FakeOfficialWordbookClient({
    officialWordbooks: [
      {
        id: 'official-wordbook-pre2',
        title: '英検準2級 公式単語帳',
        slug: 'merken-eiken-pre2-1',
        icon_image: 'icon.png',
        source_labels: ['official', 'eiken:pre2'],
        is_default: true,
      },
    ],
    wordsByWordbookId: {
      'official-wordbook-pre2': [
        {
          id: 'source-word-1',
          english: 'improve',
          japanese: '改善する',
          translations: [{
            translationJa: '改善する',
            normalizedTranslationJa: '改善する',
            source: 'user',
            meaningRank: 1,
            position: 0,
            isPrimary: true,
          }],
          distractors: ['悪化する', '維持する'],
          vocabulary_type: 'active',
          japanese_source: 'scan',
          part_of_speech_tags: ['verb'],
          custom_sections: [{ id: 'memo', title: 'Memo', content: 'Core verb' }],
        },
      ],
    },
  });

  const result = await fetchDefaultOfficialWordbooksForLocalImport(client as never, 'pre2');

  assert.deepEqual(result, [{
    officialWordbookId: 'official-wordbook-pre2',
    officialSlug: 'merken-eiken-pre2-1',
    title: '英検準2級 公式単語帳',
    sourceLabels: ['official', 'eiken:pre2'],
    iconImage: 'icon.png',
    words: [{
      english: 'improve',
      japanese: '改善する',
      translations: [{
        lexiconSenseId: undefined,
        translationJa: '改善する',
        normalizedTranslationJa: '改善する',
        source: 'user',
        meaningRank: 1,
        position: 0,
        isPrimary: true,
      }],
      distractors: ['悪化する', '維持する'],
      vocabularyType: 'active',
      japaneseSource: 'scan',
      partOfSpeechTags: ['verb'],
      customSections: [{ id: 'memo', title: 'Memo', content: 'Core verb' }],
    }],
  }]);

  const projectSelect = findOperation(client, 'official_wordbooks', 'select');
  assert.match(projectSelect.columns ?? '', /slug/);

  const sourceWordsSelect = findOperation(client, 'official_wordbook_words', 'select');
  assert.deepEqual(sourceWordsSelect.filters, [
    { field: 'official_wordbook_id', value: 'official-wordbook-pre2' },
  ]);

  assert.equal(findOperations(client, 'official_wordbooks', 'insert').length, 0);
  assert.equal(findOperations(client, 'official_wordbook_words', 'insert').length, 0);
  assert.equal(findOperations(client, 'word_translations', 'upsert').length, 0);
});

test('default official wordbook local payload includes every active default wordbook for a level', async () => {
  const client = new FakeOfficialWordbookClient({
    officialWordbooks: [
      {
        id: 'official-pre1-1',
        title: '英検準一級単語集1',
        slug: 'merken-eiken-pre1-1',
        source_labels: ['official', 'eiken:pre1'],
        is_default: true,
      },
      {
        id: 'official-pre1-2',
        title: '英検準一級単語集2',
        slug: 'merken-eiken-pre1-2',
        source_labels: ['official', 'eiken:pre1'],
        is_default: true,
      },
      {
        id: 'official-pre1-extra',
        title: '英検準一級 補助単語集',
        slug: 'merken-eiken-pre1-extra',
        is_default: false,
      },
    ],
    wordsByWordbookId: {
      'official-pre1-1': [
        {
          id: 'source-word-1',
          english: 'notion',
          japanese: '概念',
          translations: [{
            translationJa: '概念',
            normalizedTranslationJa: '概念',
            meaningRank: 1,
            position: 0,
            isPrimary: true,
          }],
        },
      ],
      'official-pre1-2': [
        {
          id: 'source-word-2',
          english: 'obscure',
          japanese: '曖昧な',
          translations: [{
            translationJa: '曖昧な',
            normalizedTranslationJa: '曖昧な',
            meaningRank: 1,
            position: 0,
            isPrimary: true,
          }],
        },
      ],
    },
  });

  const result = await fetchDefaultOfficialWordbooksForLocalImport(client as never, 'pre1');

  assert.deepEqual(result, [
    {
      officialWordbookId: 'official-pre1-1',
      officialSlug: 'merken-eiken-pre1-1',
      title: '英検準一級単語集1',
      sourceLabels: ['official', 'eiken:pre1'],
      words: [{
        english: 'notion',
        japanese: '概念',
        translations: [{
          lexiconSenseId: undefined,
          translationJa: '概念',
          normalizedTranslationJa: '概念',
          source: undefined,
          meaningRank: 1,
          position: 0,
          isPrimary: true,
        }],
        distractors: [],
      }],
    },
    {
      officialWordbookId: 'official-pre1-2',
      officialSlug: 'merken-eiken-pre1-2',
      title: '英検準一級単語集2',
      sourceLabels: ['official', 'eiken:pre1'],
      words: [{
        english: 'obscure',
        japanese: '曖昧な',
        translations: [{
          lexiconSenseId: undefined,
          translationJa: '曖昧な',
          normalizedTranslationJa: '曖昧な',
          source: undefined,
          meaningRank: 1,
          position: 0,
          isPrimary: true,
        }],
        distractors: [],
      }],
    },
  ]);

  const sourceWordSelects = findOperations(client, 'official_wordbook_words', 'select');
  assert.deepEqual(sourceWordSelects.map((operation) =>
    operation.filters.find((filter) => filter.field === 'official_wordbook_id')?.value
  ), [
    'official-pre1-1',
    'official-pre1-2',
  ]);
  assert.equal(findOperations(client, 'official_wordbooks', 'insert').length, 0);
});

// ============================================================
// persistDefaultOfficialWordbooksToDb
// ============================================================

interface CapturedInserts {
  projectInserts: unknown[];
  wordInsertBatches: Array<Array<Record<string, unknown>>>;
  translationUpserts: unknown[];
  deletedProjectIds: string[];
}

/**
 * Minimal service-role admin client stub for persistDefaultOfficialWordbooksToDb.
 * Captures the exact rows handed to `.insert()` so the test can assert the
 * bulk-insert payload is well-formed.
 */
function createFakeAdminClient(
  captured: CapturedInserts,
  overrides: { wordInsertError?: { message: string } } = {},
) {
  return {
    from(table: string) {
      if (table === 'projects') {
        return {
          select: () => ({
            eq: async () => ({ data: [], error: null }),
          }),
          insert: async (payload: unknown) => {
            captured.projectInserts.push(payload);
            return { error: null };
          },
          delete: () => ({
            eq: async (_column: string, value: string) => {
              captured.deletedProjectIds.push(value);
              return { error: null };
            },
          }),
        };
      }
      if (table === 'words') {
        return {
          insert: async (rows: Array<Record<string, unknown>>) => {
            captured.wordInsertBatches.push(rows);
            return { error: overrides.wordInsertError ?? null };
          },
        };
      }
      if (table === 'word_translations') {
        return {
          upsert: async (rows: unknown) => {
            captured.translationUpserts.push(rows);
            return { error: null };
          },
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    },
  };
}

function makeHeterogeneousWordbook(slug: string): DefaultOfficialWordbookImportItem {
  return {
    officialWordbookId: `ow-${slug}`,
    officialSlug: slug,
    title: `単語帳 ${slug}`,
    sourceLabels: ['official', 'eiken:3'],
    words: [
      // Word with several optional fields populated.
      {
        english: 'improve',
        japanese: '改善する',
        distractors: ['悪化する', '維持する'],
        vocabularyType: 'active',
        japaneseSource: 'scan',
        exampleSentence: 'We must improve the plan.',
        exampleSentenceJa: '計画を改善しなければならない。',
        partOfSpeechTags: ['verb'],
        customSections: [{ id: 'memo', title: 'Memo', content: 'Core verb' }],
      },
      // Word with NONE of the optional fields — this is what previously produced
      // a different JSON key set and triggered PostgREST's PGRST102 error.
      {
        english: 'run',
        japanese: '走る',
        distractors: ['歩く', '座る'],
      },
    ],
  };
}

test('persistDefaultOfficialWordbooksToDb inserts homogeneous word rows for heterogeneous words', async () => {
  const captured: CapturedInserts = {
    projectInserts: [],
    wordInsertBatches: [],
    translationUpserts: [],
    deletedProjectIds: [],
  };
  const client = createFakeAdminClient(captured);

  await persistDefaultOfficialWordbooksToDb(
    client as never,
    'user-1',
    [makeHeterogeneousWordbook('merken-eiken-3-1')],
  );

  assert.equal(captured.wordInsertBatches.length, 1);
  const rows = captured.wordInsertBatches[0];
  assert.equal(rows.length, 2);

  // Every row in a bulk insert must expose the same JSON keys, otherwise
  // PostgREST rejects the batch with "All object keys must match" (PGRST102).
  const keySets = rows.map((row) => Object.keys(row).sort());
  assert.deepEqual(keySets[0], keySets[1]);

  // No key may serialize away as `undefined` (JSON.stringify drops those and
  // re-introduces the key-set mismatch).
  for (const row of rows) {
    for (const [key, value] of Object.entries(row)) {
      assert.notEqual(value, undefined, `word row key "${key}" must not be undefined`);
    }
    // custom_sections is NOT NULL in the DB — it must be an array, never null.
    assert.ok(Array.isArray(row.custom_sections), 'custom_sections must be an array');
  }
});

test('persistDefaultOfficialWordbooksToDb isolates a failing wordbook and rolls back its empty project', async () => {
  const captured: CapturedInserts = {
    projectInserts: [],
    wordInsertBatches: [],
    translationUpserts: [],
    deletedProjectIds: [],
  };
  const client = createFakeAdminClient(captured, {
    wordInsertError: { message: 'simulated words insert failure' },
  });

  // Should not throw even though the words insert fails.
  await persistDefaultOfficialWordbooksToDb(
    client as never,
    'user-1',
    [makeHeterogeneousWordbook('merken-eiken-3-1')],
  );

  // The just-created (empty) project is rolled back so no empty wordbook remains.
  assert.equal(captured.projectInserts.length, 1);
  assert.equal(captured.deletedProjectIds.length, 1);
});
