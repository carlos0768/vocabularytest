import test from 'node:test';
import assert from 'node:assert/strict';

import { importDefaultOfficialWordbook } from './import-default';

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
  limitCount?: number;
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

  order(column: string, options: unknown) {
    this.operation.orders.push({ column, options });
    return this;
  }

  limit(count: number) {
    this.operation.limitCount = count;
    return this;
  }

  select(columns = '*') {
    this.operation.columns = columns;
    return this;
  }

  async maybeSingle<T = unknown>(): Promise<{ data: T | null; error: null }> {
    return this.client.resolveMaybeSingle<T>(this.operation);
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
      officialWordbook?: Record<string, unknown> | null;
      officialWords?: Array<Record<string, unknown>>;
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

  async resolveMaybeSingle<T>(operation: QueryOperation): Promise<{ data: T | null; error: null }> {
    if (operation.table === 'official_wordbooks' && operation.action === 'select') {
      return {
        data: (this.fixtures.officialWordbook ?? null) as T | null,
        error: null,
      };
    }
    throw new Error(`Unexpected maybeSingle operation: ${operation.table}.${operation.action}`);
  }

  async resolveSingle<T>(operation: QueryOperation): Promise<{ data: T | null; error: null }> {
    if (operation.table === 'projects' && operation.action === 'insert') {
      return {
        data: { id: 'project-1' } as T,
        error: null,
      };
    }
    throw new Error(`Unexpected single operation: ${operation.table}.${operation.action}`);
  }

  async resolveQuery(operation: QueryOperation): Promise<{ data: unknown; error: null }> {
    if (operation.table === 'official_wordbook_words' && operation.action === 'select') {
      return {
        data: this.fixtures.officialWords ?? [],
        error: null,
      };
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

test('default official wordbook import skips null eiken levels', async () => {
  const client = new FakeOfficialWordbookClient();

  const result = await importDefaultOfficialWordbook(client as never, 'user-1', null);

  assert.equal(result, null);
  assert.equal(client.operations.length, 0);
});

test('default official wordbook import returns null when the level has no official data', async () => {
  const client = new FakeOfficialWordbookClient({ officialWordbook: null });

  const result = await importDefaultOfficialWordbook(client as never, 'user-1', '3');

  assert.equal(result, null);

  const wordbookSelect = findOperation(client, 'official_wordbooks', 'select');
  assert.deepEqual(wordbookSelect.filters, [
    { field: 'eiken_level', value: '3' },
    { field: 'is_active', value: true },
  ]);
});

test('default official wordbook import copies official words into a user project', async () => {
  const client = new FakeOfficialWordbookClient({
    officialWordbook: {
      id: 'official-pre2',
      title: '英検準2級 公式単語帳',
      source_labels: ['official', 'eiken:pre2'],
      icon_image: 'icon.png',
    },
    officialWords: [
      {
        id: 'official-word-1',
        english: 'improve',
        japanese: '改善する',
        translations: [{ translationJa: '改善する', normalizedTranslationJa: '改善する', source: 'user' }],
        distractors: ['悪化する', '維持する'],
        vocabulary_type: 'active',
        japanese_source: 'scan',
        part_of_speech_tags: ['verb'],
        custom_sections: [{ id: 'memo', title: 'Memo', content: 'Core verb' }],
      },
    ],
  });

  const result = await importDefaultOfficialWordbook(client as never, 'user-1', 'pre2');

  assert.deepEqual(result, {
    officialWordbookId: 'official-pre2',
    projectId: 'project-1',
    wordCount: 1,
  });

  const projectInsert = findOperation(client, 'projects', 'insert');
  assert.deepEqual(projectInsert.payload, {
    user_id: 'user-1',
    title: '英検準2級 公式単語帳',
    source_labels: ['official', 'eiken:pre2'],
    icon_image: 'icon.png',
  });

  const wordsInsert = findOperation(client, 'words', 'insert');
  assert.deepEqual(wordsInsert.payload, [{
    project_id: 'project-1',
    english: 'improve',
    japanese: '改善する',
    japanese_source: 'scan',
    vocabulary_type: 'active',
    lexicon_entry_id: null,
    lexicon_sense_id: null,
    distractors: ['悪化する', '維持する'],
    example_sentence: null,
    example_sentence_ja: null,
    pronunciation: null,
    part_of_speech_tags: ['verb'],
    related_words: null,
    usage_patterns: null,
    word_order_quiz: null,
    custom_sections: [{ id: 'memo', title: 'Memo', content: 'Core verb' }],
    status: 'new',
    ease_factor: 2.5,
    interval_days: 0,
    repetition: 0,
    is_favorite: false,
  }]);

  const translationsUpsert = findOperation(client, 'word_translations', 'upsert');
  assert.deepEqual(translationsUpsert.options, { onConflict: 'word_id,normalized_translation_ja' });
  assert.deepEqual(translationsUpsert.payload, [{
    word_id: 'word-1',
    lexicon_sense_id: null,
    translation_ja: '改善する',
    normalized_translation_ja: '改善する',
    source: 'user',
    meaning_rank: 1,
    position: 0,
    is_primary: true,
  }]);
});
