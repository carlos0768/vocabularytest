import test from 'node:test';
import assert from 'node:assert/strict';

import { fetchDefaultOfficialWordbooksForLocalImport } from './import-default';

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
      officialProjects?: Array<Record<string, unknown>>;
      wordsByProjectId?: Record<string, Array<Record<string, unknown>>>;
      translationsByWordId?: Record<string, Array<Record<string, unknown>>>;
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
    if (operation.table === 'projects' && operation.action === 'insert') {
      const projectIndex = this.operations
        .filter((item) => item.table === 'projects' && item.action === 'insert')
        .indexOf(operation) + 1;
      return {
        data: { id: `project-${projectIndex}` } as T,
        error: null,
      };
    }
    throw new Error(`Unexpected single operation: ${operation.table}.${operation.action}`);
  }

  async resolveQuery(operation: QueryOperation): Promise<{ data: unknown; error: null }> {
    if (operation.table === 'projects' && operation.action === 'select') {
      return {
        data: this.fixtures.officialProjects ?? [],
        error: null,
      };
    }

    if (operation.table === 'words' && operation.action === 'select') {
      const projectId = operation.filters.find((filter) => filter.field === 'project_id')?.value;
      return {
        data: typeof projectId === 'string' ? this.fixtures.wordsByProjectId?.[projectId] ?? [] : [],
        error: null,
      };
    }

    if (operation.table === 'word_translations' && operation.action === 'select') {
      const wordIds = operation.filters.find((filter) => filter.field === 'word_id')?.value;
      const rows = Array.isArray(wordIds)
        ? wordIds.flatMap((wordId) => this.fixtures.translationsByWordId?.[String(wordId)] ?? [])
        : [];
      return { data: rows, error: null };
    }

    if (operation.table === 'words' && operation.action === 'insert') {
      const rows = Array.isArray(operation.payload) ? operation.payload : [];
      return {
        data: rows.map((_, index) => ({ id: `word-${index + 1}` })),
        error: null,
      };
    }

    if (operation.table === 'word_translations' && operation.action === 'upsert') {
      return { data: null, error: null };
    }

    if (operation.table === 'projects' && operation.action === 'delete') {
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

test('default official wordbook local payload returns null when the level has no official projects', async () => {
  const client = new FakeOfficialWordbookClient({ officialProjects: [] });

  const result = await fetchDefaultOfficialWordbooksForLocalImport(client as never, '3');

  assert.equal(result, null);

  const projectSelect = findOperation(client, 'projects', 'select');
  assert.deepEqual(projectSelect.filters, [
    { field: 'official_eiken_level', value: '3' },
    { field: 'official_is_active', value: true },
  ]);
});

test('default official wordbook local payload reads a normal project without creating remote user rows', async () => {
  const client = new FakeOfficialWordbookClient({
    officialProjects: [
      {
        id: 'official-project-pre2',
        title: 'Source Project Title',
        official_title: '英検準2級 公式単語帳',
        official_slug: 'merken-eiken-pre2-1',
        icon_image: 'icon.png',
        official_is_default: true,
      },
    ],
    wordsByProjectId: {
      'official-project-pre2': [
        {
          id: 'source-word-1',
          english: 'improve',
          japanese: '改善する',
          distractors: ['悪化する', '維持する'],
          vocabulary_type: 'active',
          japanese_source: 'scan',
          part_of_speech_tags: ['verb'],
          custom_sections: [{ id: 'memo', title: 'Memo', content: 'Core verb' }],
        },
      ],
    },
    translationsByWordId: {
      'source-word-1': [
        {
          word_id: 'source-word-1',
          translation_ja: '改善する',
          normalized_translation_ja: '改善する',
          source: 'user',
          meaning_rank: 1,
          position: 0,
        },
      ],
    },
  });

  const result = await fetchDefaultOfficialWordbooksForLocalImport(client as never, 'pre2');

  assert.deepEqual(result, [{
    officialWordbookId: 'official-project-pre2',
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

  const projectSelect = findOperation(client, 'projects', 'select');
  assert.match(projectSelect.columns ?? '', /official_slug/);

  const sourceWordsSelect = findOperation(client, 'words', 'select');
  assert.deepEqual(sourceWordsSelect.filters, [
    { field: 'project_id', value: 'official-project-pre2' },
  ]);

  assert.equal(findOperations(client, 'projects', 'insert').length, 0);
  assert.equal(findOperations(client, 'words', 'insert').length, 0);
  assert.equal(findOperations(client, 'word_translations', 'upsert').length, 0);
});

test('default official wordbook local payload includes every active default project for a level', async () => {
  const client = new FakeOfficialWordbookClient({
    officialProjects: [
      {
        id: 'official-pre1-1',
        title: 'ターゲット section16',
        official_title: '英検準一級単語集1',
        official_slug: 'merken-eiken-pre1-1',
        official_is_default: true,
      },
      {
        id: 'official-pre1-2',
        title: 'ターゲット section17',
        official_title: '英検準一級単語集2',
        official_slug: 'merken-eiken-pre1-2',
        official_is_default: true,
      },
      {
        id: 'official-pre1-extra',
        title: '英検準一級 補助単語集',
        official_is_default: false,
      },
    ],
    wordsByProjectId: {
      'official-pre1-1': [
        {
          id: 'source-word-1',
          english: 'notion',
          japanese: '概念',
        },
      ],
      'official-pre1-2': [
        {
          id: 'source-word-2',
          english: 'obscure',
          japanese: '曖昧な',
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

  const sourceWordSelects = findOperations(client, 'words', 'select');
  assert.deepEqual(sourceWordSelects.map((operation) =>
    operation.filters.find((filter) => filter.field === 'project_id')?.value
  ), [
    'official-pre1-1',
    'official-pre1-2',
  ]);
  assert.equal(findOperations(client, 'projects', 'insert').length, 0);
});
