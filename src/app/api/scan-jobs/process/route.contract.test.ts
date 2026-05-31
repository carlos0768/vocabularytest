import test from 'node:test';
import assert from 'node:assert/strict';

import type { SupabaseClient } from '@supabase/supabase-js';

import {
  processJobById,
  type ProcessJobDeps,
} from '@/app/api/scan-jobs/process/route';

const JOB_ID = '0dd8f4d8-22cf-4010-b6e7-99485683023c';
const USER_ID = '11111111-1111-4111-8111-111111111111';
const NEW_PROJECT_ID = '22222222-2222-4222-8222-222222222222';
const EXISTING_PROJECT_ID = '33333333-3333-4333-8333-333333333333';

type QueryAction = 'update' | 'select' | 'insert' | 'delete' | 'storage.download';

interface QueryFilter {
  field: string;
  value: unknown;
}

interface QueryOperation {
  table: string;
  action: QueryAction;
  payload?: unknown;
  columns?: string;
  filters: QueryFilter[];
}

interface ScanJobRow {
  id: string;
  status: string;
  user_id: string;
  image_paths: string[];
  image_path: string | null;
  save_mode: 'client_local' | 'server_cloud';
  target_project_id: string | null;
  scan_mode: string;
  scan_modes?: string[] | null;
  eiken_level: string | null;
  project_title: string;
  project_icon_image: string | null;
}

interface ProjectRow {
  id: string;
  title: string | null;
  source_labels?: string[] | null;
}

interface InsertedWordRow {
  id: string;
  english: string;
  japanese: string;
  lexicon_entry_id: string | null;
  distractors: string[];
  example_sentence: string | null;
  example_sentence_ja: string | null;
  part_of_speech_tags?: string[];
  word_order_quiz?: unknown | null;
}

type QueryError = { message: string; code?: string; details?: string; hint?: string };
type QueryResult<T = unknown> = { data: T | null; error: QueryError | null };

function pendingClientLocalJob(): ScanJobRow {
  return {
    id: JOB_ID,
    status: 'pending',
    user_id: USER_ID,
    image_paths: ['jobs/test-image.png'],
    image_path: null,
    save_mode: 'client_local',
    target_project_id: null,
    scan_mode: 'all',
    eiken_level: null,
    project_title: 'Scan Result',
    project_icon_image: null,
  };
}

function pendingServerCloudJob(overrides: Partial<ScanJobRow> = {}): ScanJobRow {
  return {
    ...pendingClientLocalJob(),
    save_mode: 'server_cloud',
    project_title: 'Scan Result',
    project_icon_image: null,
    ...overrides,
  };
}

class FakeScanProcessQuery {
  constructor(
    private readonly client: FakeScanProcessClient,
    private readonly operation: QueryOperation,
  ) {}

  eq(field: string, value: unknown) {
    this.operation.filters.push({ field, value });
    return this;
  }

  select(columns = '*') {
    this.operation.columns = columns;
    return this;
  }

  in(field: string, value: unknown) {
    this.operation.filters.push({ field, value });
    return this;
  }

  not(field: string, _operator: string, value: unknown) {
    this.operation.filters.push({ field, value });
    return this;
  }

  async maybeSingle<T = unknown>(): Promise<{ data: T | null; error: null }> {
    return this.client.resolveMaybeSingle<T>(this.operation);
  }

  async single<T = unknown>(): Promise<{ data: T | null; error: QueryError | null }> {
    return this.client.resolveSingle<T>(this.operation);
  }

  then<TResult1 = QueryResult, TResult2 = never>(
    onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.client.resolveThen(this.operation).then(onfulfilled, onrejected);
  }
}

class FakeScanProcessClient {
  readonly operations: QueryOperation[] = [];
  readonly storageDownloads: string[] = [];

  constructor(
    private readonly options: {
      claimedJob?: ScanJobRow | null;
      existingJob?: Pick<ScanJobRow, 'id' | 'status'> | null;
      userPreference?: { ai_enabled: boolean | null } | null;
      insertedProject?: ProjectRow | null;
      existingProject?: ProjectRow | null;
      wordsInsertError?: QueryError | null;
      wordsInsertResults?: QueryResult[];
      insertedWords?: InsertedWordRow[] | null;
      trace?: string[];
    },
  ) {}

  storage = {
    from: (bucket: string) => ({
      download: async (path: string) => {
        this.storageDownloads.push(path);
        this.options.trace?.push('storage:scan-images.download');
        this.operations.push({
          table: `storage:${bucket}`,
          action: 'storage.download',
          payload: path,
          filters: [],
        });
        return {
          data: new Blob(['fake image bytes']),
          error: null,
        };
      },
    }),
  };

  from(table: string) {
    return {
      update: (payload: unknown) => this.createOperation(table, 'update', payload),
      select: (columns = '*') => this.createOperation(table, 'select', undefined, columns),
      insert: (payload: unknown) => this.createOperation(table, 'insert', payload),
      delete: () => this.createOperation(table, 'delete'),
    };
  }

  createOperation(
    table: string,
    action: QueryAction,
    payload?: unknown,
    columns?: string,
  ) {
    const operation: QueryOperation = {
      table,
      action,
      payload,
      columns,
      filters: [],
    };
    this.operations.push(operation);
    this.options.trace?.push(describeOperation(operation));
    return new FakeScanProcessQuery(this, operation);
  }

  async resolveMaybeSingle<T>(operation: QueryOperation): Promise<{ data: T | null; error: null }> {
    if (
      operation.table === 'scan_jobs' &&
      operation.action === 'update' &&
      isRecord(operation.payload) &&
      operation.payload.status === 'processing'
    ) {
      return {
        data: (this.options.claimedJob ?? null) as T | null,
        error: null,
      };
    }

    if (operation.table === 'user_preferences' && operation.action === 'select') {
      return {
        data: (this.options.userPreference ?? { ai_enabled: true }) as T,
        error: null,
      };
    }

    throw new Error(`Unexpected maybeSingle operation: ${operation.table}.${operation.action}`);
  }

  async resolveSingle<T>(operation: QueryOperation): Promise<{ data: T | null; error: QueryError | null }> {
    if (operation.table === 'scan_jobs' && operation.action === 'select') {
      if (!this.options.existingJob) {
        return {
          data: null,
          error: { message: 'not found' },
        };
      }
      return {
        data: this.options.existingJob as T,
        error: null,
      };
    }

    if (operation.table === 'projects' && operation.action === 'select') {
      if (!this.options.existingProject) {
        return {
          data: null,
          error: { message: 'project not found' },
        };
      }
      return {
        data: this.options.existingProject as T,
        error: null,
      };
    }

    if (operation.table === 'projects' && operation.action === 'insert') {
      const insertedProject = this.options.insertedProject ?? {
        id: NEW_PROJECT_ID,
        title: isRecord(operation.payload) && typeof operation.payload.title === 'string'
          ? operation.payload.title
          : 'Scan Result',
        source_labels: isRecord(operation.payload) && Array.isArray(operation.payload.source_labels)
          ? operation.payload.source_labels as string[]
          : [],
      };
      return {
        data: insertedProject as T,
        error: null,
      };
    }

    throw new Error(`Unexpected single operation: ${operation.table}.${operation.action}`);
  }

  async resolveThen<T = unknown>(operation: QueryOperation): Promise<QueryResult<T>> {
    if (operation.table === 'words' && operation.action === 'insert') {
      if (this.options.wordsInsertResults && this.options.wordsInsertResults.length > 0) {
        return this.options.wordsInsertResults.shift() as QueryResult<T>;
      }

      if (this.options.wordsInsertError) {
        return {
          data: null,
          error: this.options.wordsInsertError,
        };
      }

      return {
        data: (this.options.insertedWords ?? deriveInsertedWords(operation.payload)) as T,
        error: null,
      };
    }

    return {
      data: null,
      error: null,
    };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function describeOperation(operation: QueryOperation): string {
  if (operation.table === 'scan_jobs' && operation.action === 'update' && isRecord(operation.payload)) {
    return `db:scan_jobs.${String(operation.payload.status)}`;
  }
  return `db:${operation.table}.${operation.action}`;
}

function deriveInsertedWords(payload: unknown): InsertedWordRow[] {
  assert.ok(Array.isArray(payload), 'words insert payload must be an array');
  return payload.map((row, index) => {
    assert.ok(isRecord(row), 'words insert row must be an object');
    return {
      id: `word-${index + 1}`,
      english: String(row.english),
      japanese: String(row.japanese),
      lexicon_entry_id: typeof row.lexicon_entry_id === 'string' ? row.lexicon_entry_id : null,
      distractors: Array.isArray(row.distractors) ? row.distractors as string[] : [],
      example_sentence: typeof row.example_sentence === 'string' ? row.example_sentence : null,
      example_sentence_ja: typeof row.example_sentence_ja === 'string' ? row.example_sentence_ja : null,
      part_of_speech_tags: Array.isArray(row.part_of_speech_tags) ? row.part_of_speech_tags as string[] : undefined,
      word_order_quiz: row.word_order_quiz ?? null,
    };
  });
}

function findScanJobUpdate(
  client: FakeScanProcessClient,
  status: string,
): QueryOperation {
  const operation = client.operations.find((candidate) =>
    candidate.table === 'scan_jobs' &&
    candidate.action === 'update' &&
    isRecord(candidate.payload) &&
    candidate.payload.status === status
  );
  assert.ok(operation, `missing scan_jobs ${status} update`);
  return operation;
}

function findOperation(
  client: FakeScanProcessClient,
  predicate: (operation: QueryOperation) => boolean,
  message: string,
): QueryOperation {
  const operation = client.operations.find(predicate);
  assert.ok(operation, message);
  return operation;
}

function assertClaimContract(operation: QueryOperation) {
  assert.equal(operation.table, 'scan_jobs');
  assert.equal(operation.action, 'update');
  assert.ok(isRecord(operation.payload));
  assert.equal(operation.payload.status, 'processing');
  assert.equal(typeof operation.payload.updated_at, 'string');
  assert.deepEqual(operation.filters, [
    { field: 'id', value: JOB_ID },
    { field: 'status', value: 'pending' },
  ]);
  assert.equal(operation.columns, '*');
}

function createContractDeps(
  client: FakeScanProcessClient,
  overrides: Partial<ProcessJobDeps> = {},
): ProcessJobDeps {
  return {
    supabaseAdmin: client as unknown as SupabaseClient,
    getApiKeys: () => ({
      gemini: 'dummy-gemini-key',
      openai: 'dummy-openai-key',
    }),
    extractImage: async () => ({
      result: {
        success: true,
        data: {
          words: [
            {
              english: 'apple',
              japanese: 'りんご',
              japaneseSource: 'scan',
              distractors: ['ばなな', 'ぶどう', 'もも'],
              partOfSpeechTags: ['noun'],
            },
          ],
          sourceLabels: ['鉄壁'],
        },
      },
    }),
    resolveImmediateWords: async (words) => ({
      words: words as never,
      lexiconEntries: [
        {
          id: 'lexicon-apple',
          headword: 'apple',
          normalizedHeadword: 'apple',
          pos: 'noun',
          datasetSources: ['鉄壁'],
          createdAt: '2026-05-07T00:00:00.000Z',
          updatedAt: '2026-05-07T00:00:00.000Z',
        },
      ],
      metrics: {
        lookupKeyCount: 1,
        masterHitCount: 1,
        masterTranslationHitCount: 1,
        aiMissCount: 0,
        lookupElapsedMs: 0,
        translationElapsedMs: 0,
        totalElapsedMs: 0,
      },
    }),
    backfillWords: async (words) => ({
      words,
      aiBackfilledIndexes: [],
    }),
    generateExamples: async () => ({
      examples: [],
      errors: [],
      summary: {
        requested: 0,
        generated: 0,
        failed: 0,
        retried: 0,
        retryRecovered: 0,
        failureKinds: {
          provider: 0,
          parse: 0,
          validation: 0,
          empty: 0,
        },
      },
    }),
    sendPushNotifications: async () => undefined,
    sendApnsNotifications: async () => undefined,
    flushTiming: async () => undefined,
    afterTask: () => undefined,
    ...overrides,
  };
}

function createServerCloudContractDeps(
  client: FakeScanProcessClient,
  overrides: Partial<ProcessJobDeps> = {},
): ProcessJobDeps {
  return createContractDeps(client, {
    resolveImmediateWords: async (words) => ({
      words: words.map((word) => ({
        ...word,
        lexiconEntryId: 'lexicon-apple',
        exampleSentence: 'I ate an apple.',
        exampleSentenceJa: '私はりんごを食べました。',
        partOfSpeechTags: ['noun'],
      })) as never,
      lexiconEntries: [
        {
          id: 'lexicon-apple',
          headword: 'apple',
          normalizedHeadword: 'apple',
          pos: 'noun',
          datasetSources: ['鉄壁'],
          createdAt: '2026-05-07T00:00:00.000Z',
          updatedAt: '2026-05-07T00:00:00.000Z',
        },
      ],
      metrics: {
        lookupKeyCount: 1,
        masterHitCount: 1,
        masterTranslationHitCount: 1,
        aiMissCount: 0,
        lookupElapsedMs: 0,
        translationElapsedMs: 0,
        totalElapsedMs: 0,
      },
    }),
    ...overrides,
  });
}

test('processJobById claims only pending jobs before doing downstream work', async () => {
  const client = new FakeScanProcessClient({
    claimedJob: pendingClientLocalJob(),
    userPreference: { ai_enabled: false },
  });

  const response = await processJobById(
    JOB_ID,
    createContractDeps(client, {
      generateExamples: async () => {
        throw new Error('JSON parse failed');
      },
    }),
  );

  assert.equal(response.status, 200);
  assertClaimContract(client.operations[0]);
  assert.deepEqual(client.storageDownloads, ['jobs/test-image.png']);
});

test('processJobById does not reprocess jobs that are already completed', async () => {
  const client = new FakeScanProcessClient({
    claimedJob: null,
    existingJob: {
      id: JOB_ID,
      status: 'completed',
    },
  });

  const response = await processJobById(JOB_ID, createContractDeps(client));

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    message: 'Job already processed',
    status: 'completed',
  });
  assertClaimContract(client.operations[0]);
  assert.equal(client.operations.some((operation) =>
    operation.table === 'scan_jobs' &&
    operation.action === 'update' &&
    isRecord(operation.payload) &&
    operation.payload.status === 'failed'
  ), false);
  assert.deepEqual(client.storageDownloads, []);
});

test('processJobById returns 404 when a valid job id has no row', async () => {
  const client = new FakeScanProcessClient({
    claimedJob: null,
    existingJob: null,
  });

  const response = await processJobById(JOB_ID, createContractDeps(client));

  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), {
    error: 'Job not found',
  });
  assertClaimContract(client.operations[0]);
});

test('client_local completion keeps result payload successful when example generation fails', async () => {
  const client = new FakeScanProcessClient({
    claimedJob: pendingClientLocalJob(),
    userPreference: { ai_enabled: false },
  });
  const pushNotifications: unknown[] = [];
  const apnsNotifications: unknown[] = [];

  const response = await processJobById(
    JOB_ID,
    createContractDeps(client, {
      generateExamples: async () => {
        throw new Error('JSON parse failed');
      },
      sendPushNotifications: async (_client, params) => {
        pushNotifications.push(params);
      },
      sendApnsNotifications: async (_client, params) => {
        apnsNotifications.push(params);
      },
    }),
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    success: true,
    saveMode: 'client_local',
    projectId: null,
    wordCount: 1,
  });

  const completedUpdate = findScanJobUpdate(client, 'completed');
  assert.ok(isRecord(completedUpdate.payload));
  assert.deepEqual(Object.keys(completedUpdate.payload).sort(), [
    'project_id',
    'result',
    'status',
    'updated_at',
  ]);
  assert.equal(completedUpdate.payload.project_id, null);
  assert.equal(completedUpdate.payload.status, 'completed');
  assert.equal(typeof completedUpdate.payload.updated_at, 'string');
  assert.equal(typeof completedUpdate.payload.result, 'string');

  const resultPayload = JSON.parse(String(completedUpdate.payload.result));
  assert.equal(resultPayload.wordCount, 1);
  assert.equal(resultPayload.saveMode, 'client_local');
  assert.deepEqual(resultPayload.sourceLabels, ['鉄壁']);
  assert.equal(resultPayload.extractedWords[0].english, 'apple');
  assert.equal(resultPayload.extractedWords[0].japaneseSource, 'scan');
  assert.equal(resultPayload.lexiconEntries[0].id, 'lexicon-apple');
  assert.deepEqual(resultPayload.warnings, ['example_generation_failed']);
  assert.equal(resultPayload.exampleGeneration.requested, 1);
  assert.equal(resultPayload.exampleGeneration.failed, 1);
  assert.equal(resultPayload.exampleGeneration.failureKinds.parse, 1);

  assert.equal(client.operations.some((operation) =>
    operation.table === 'scan_jobs' &&
    operation.action === 'update' &&
    isRecord(operation.payload) &&
    operation.payload.status === 'failed'
  ), false);
  assert.deepEqual(pushNotifications, [
    {
      userId: USER_ID,
      jobId: JOB_ID,
      projectId: null,
      projectTitle: 'Scan Result',
      status: 'completed',
      wordCount: 1,
    },
  ]);
  assert.deepEqual(apnsNotifications, pushNotifications);
});

test('processJobById uses scanModesOverride when scan_modes is not available on the job row', async () => {
  const observedModes: string[][] = [];
  const client = new FakeScanProcessClient({
    claimedJob: pendingServerCloudJob({
      scan_mode: 'all',
      scan_modes: null,
      eiken_level: '2',
    }),
    userPreference: { ai_enabled: false },
  });

  const response = await processJobById(
    JOB_ID,
    createServerCloudContractDeps(client, {
      scanModesOverride: ['all', 'idiom', 'eiken'],
      extractImage: async (_base64Image, modes) => {
        observedModes.push(Array.isArray(modes) ? modes : [modes]);
        return {
          result: {
            success: true,
            data: {
              words: [
                {
                  english: 'look forward to',
                  japanese: '楽しみに待つ',
                  japaneseSource: 'scan',
                  sourceModes: ['idiom'],
                  distractors: [],
                  partOfSpeechTags: ['idiom'],
                },
              ],
              sourceLabels: ['鉄壁'],
            },
          },
        };
      },
    }),
  );

  assert.equal(response.status, 200);
  assert.deepEqual(observedModes, [['all', 'idiom', 'eiken']]);

  const wordsInsert = findOperation(
    client,
    (operation) => operation.table === 'words' && operation.action === 'insert',
    'missing words insert',
  );
  assert.ok(Array.isArray(wordsInsert.payload));
  assert.deepEqual(wordsInsert.payload[0]?.source_modes, ['all', 'idiom', 'eiken']);
});

test('server_cloud writes source_modes from normalized scan_modes instead of AI sourceModes', async () => {
  const observedModes: string[][] = [];
  const client = new FakeScanProcessClient({
    claimedJob: pendingServerCloudJob({
      scan_mode: 'all',
      scan_modes: ['all', 'idiom', 'eiken'],
      eiken_level: '2',
    }),
    userPreference: { ai_enabled: false },
  });

  const response = await processJobById(
    JOB_ID,
    createServerCloudContractDeps(client, {
      extractImage: async (_base64Image, modes) => {
        observedModes.push(Array.isArray(modes) ? modes : [modes]);
        return {
          result: {
            success: true,
            data: {
              words: [
                {
                  english: 'look forward to',
                  japanese: '楽しみに待つ',
                  japaneseSource: 'scan',
                  sourceModes: ['idiom'],
                  distractors: [],
                  partOfSpeechTags: ['idiom'],
                },
              ],
              sourceLabels: ['鉄壁'],
            },
          },
        };
      },
    }),
  );

  assert.equal(response.status, 200);
  assert.deepEqual(observedModes, [['all', 'idiom', 'eiken']]);

  const wordsInsert = findOperation(
    client,
    (operation) => operation.table === 'words' && operation.action === 'insert',
    'missing words insert',
  );
  assert.ok(Array.isArray(wordsInsert.payload));
  assert.deepEqual(wordsInsert.payload[0]?.source_modes, ['all', 'idiom', 'eiken']);
});

test('server_cloud new project completion keeps project insert, words insert, and completed update contract', async () => {
  const trace: string[] = [];
  const client = new FakeScanProcessClient({
    claimedJob: pendingServerCloudJob(),
    userPreference: { ai_enabled: false },
    trace,
  });
  const pushNotifications: unknown[] = [];
  const apnsNotifications: unknown[] = [];
  const timingFlushes: unknown[] = [];

  const response = await processJobById(
    JOB_ID,
    createServerCloudContractDeps(client, {
      sendPushNotifications: async (_client, params) => {
        pushNotifications.push(params);
        trace.push(`push:${params.status}`);
      },
      sendApnsNotifications: async (_client, params) => {
        apnsNotifications.push(params);
        trace.push(`apns:${params.status}`);
      },
      flushTiming: async (_entries, _timing, jobId, userId, status) => {
        timingFlushes.push({ jobId, userId, status });
        trace.push(`timing:${status}`);
      },
    }),
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    success: true,
    saveMode: 'server_cloud',
    projectId: NEW_PROJECT_ID,
    wordCount: 1,
  });

  assert.deepEqual(trace.filter((event) => [
    'db:projects.insert',
    'db:words.insert',
    'db:scan_jobs.completed',
    'push:completed',
    'apns:completed',
    'timing:completed',
  ].includes(event)), [
    'db:projects.insert',
    'db:words.insert',
    'db:scan_jobs.completed',
    'push:completed',
    'apns:completed',
    'timing:completed',
  ]);

  const projectInsert = findOperation(
    client,
    (operation) => operation.table === 'projects' && operation.action === 'insert',
    'missing project insert',
  );
  assert.deepEqual(projectInsert.payload, {
    user_id: USER_ID,
    title: 'Scan Result',
    source_labels: ['鉄壁'],
    icon_image: null,
  });

  const wordsInsert = findOperation(
    client,
    (operation) => operation.table === 'words' && operation.action === 'insert',
    'missing words insert',
  );
  assert.equal(
    wordsInsert.columns,
    'id, english, japanese, lexicon_entry_id, distractors, example_sentence, example_sentence_ja, pronunciation, part_of_speech_tags, word_order_quiz',
  );
  assert.deepEqual(wordsInsert.payload, [
    {
      project_id: NEW_PROJECT_ID,
      english: 'apple',
      japanese: 'りんご',
      lexicon_entry_id: 'lexicon-apple',
      distractors: ['ばなな', 'ぶどう', 'もも'],
      example_sentence: 'I ate an apple.',
      example_sentence_ja: '私はりんごを食べました。',
      pronunciation: null,
      part_of_speech_tags: ['noun'],
      source_modes: ['all'],
    },
  ]);

  const completedUpdate = findScanJobUpdate(client, 'completed');
  assert.ok(isRecord(completedUpdate.payload));
  assert.equal(completedUpdate.payload.project_id, NEW_PROJECT_ID);
  assert.equal(completedUpdate.payload.status, 'completed');
  assert.equal(typeof completedUpdate.payload.updated_at, 'string');
  assert.equal(typeof completedUpdate.payload.result, 'string');
  assert.deepEqual(JSON.parse(String(completedUpdate.payload.result)), {
    wordCount: 1,
    saveMode: 'server_cloud',
    targetProjectId: NEW_PROJECT_ID,
    sourceLabels: ['鉄壁'],
  });

  assert.deepEqual(pushNotifications, [
    {
      userId: USER_ID,
      jobId: JOB_ID,
      projectId: NEW_PROJECT_ID,
      projectTitle: 'Scan Result',
      status: 'completed',
      wordCount: 1,
    },
  ]);
  assert.deepEqual(apnsNotifications, pushNotifications);
  assert.deepEqual(timingFlushes, [
    {
      jobId: JOB_ID,
      userId: USER_ID,
      status: 'completed',
    },
  ]);
});

test('server_cloud retries words insert without source_modes when the database schema is older', async () => {
  const trace: string[] = [];
  const client = new FakeScanProcessClient({
    claimedJob: pendingServerCloudJob(),
    userPreference: { ai_enabled: false },
    wordsInsertResults: [
      {
        data: null,
        error: {
          code: 'PGRST204',
          message: "Could not find the 'source_modes' column of 'words' in the schema cache",
        },
      },
    ],
    trace,
  });

  const response = await processJobById(JOB_ID, createServerCloudContractDeps(client));

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    success: true,
    saveMode: 'server_cloud',
    projectId: NEW_PROJECT_ID,
    wordCount: 1,
  });

  const wordsInserts = client.operations.filter((operation) =>
    operation.table === 'words' &&
    operation.action === 'insert'
  );
  assert.equal(wordsInserts.length, 2);
  assert.ok(Array.isArray(wordsInserts[0].payload));
  assert.deepEqual(wordsInserts[0].payload[0]?.source_modes, ['all']);
  assert.ok(Array.isArray(wordsInserts[1].payload));
  assert.equal('source_modes' in wordsInserts[1].payload[0], false);

  const completedUpdate = findScanJobUpdate(client, 'completed');
  assert.ok(isRecord(completedUpdate.payload));
  assert.equal(completedUpdate.payload.status, 'completed');
  assert.equal(client.operations.some((operation) =>
    operation.table === 'projects' &&
    operation.action === 'delete'
  ), false);
});

test('server_cloud words insert failure rolls back only the newly created project before failed side effects', async () => {
  const trace: string[] = [];
  const client = new FakeScanProcessClient({
    claimedJob: pendingServerCloudJob(),
    userPreference: { ai_enabled: false },
    wordsInsertError: { message: 'words insert failed' },
    trace,
  });
  const pushNotifications: unknown[] = [];
  const apnsNotifications: unknown[] = [];
  const timingFlushes: unknown[] = [];

  const response = await processJobById(
    JOB_ID,
    createServerCloudContractDeps(client, {
      sendPushNotifications: async (_client, params) => {
        pushNotifications.push(params);
        trace.push(`push:${params.status}`);
      },
      sendApnsNotifications: async (_client, params) => {
        apnsNotifications.push(params);
        trace.push(`apns:${params.status}`);
      },
      flushTiming: async (_entries, _timing, jobId, userId, status) => {
        timingFlushes.push({ jobId, userId, status });
        trace.push(`timing:${status}`);
      },
    }),
  );

  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), {
    error: 'Processing failed',
  });
  assert.deepEqual(trace.filter((event) => [
    'db:projects.insert',
    'db:words.insert',
    'db:projects.delete',
    'db:scan_jobs.failed',
    'push:failed',
    'apns:failed',
    'timing:failed',
  ].includes(event)), [
    'db:projects.insert',
    'db:words.insert',
    'db:projects.delete',
    'db:scan_jobs.failed',
    'push:failed',
    'apns:failed',
    'timing:failed',
  ]);

  const projectDelete = findOperation(
    client,
    (operation) => operation.table === 'projects' && operation.action === 'delete',
    'missing rollback project delete',
  );
  assert.deepEqual(projectDelete.filters, [
    { field: 'id', value: NEW_PROJECT_ID },
  ]);

  const failedUpdate = findScanJobUpdate(client, 'failed');
  assert.ok(isRecord(failedUpdate.payload));
  assert.equal(failedUpdate.payload.status, 'failed');
  assert.equal(failedUpdate.payload.error_message, 'Failed to insert words');
  assert.equal(typeof failedUpdate.payload.updated_at, 'string');
  assert.deepEqual(pushNotifications, [
    {
      userId: USER_ID,
      jobId: JOB_ID,
      projectId: null,
      projectTitle: 'Scan Result',
      status: 'failed',
      wordCount: 0,
    },
  ]);
  assert.deepEqual(apnsNotifications, pushNotifications);
  assert.deepEqual(timingFlushes, [
    {
      jobId: JOB_ID,
      userId: USER_ID,
      status: 'failed',
    },
  ]);
});

test('server_cloud existing project words insert failure does not delete the project', async () => {
  const trace: string[] = [];
  const client = new FakeScanProcessClient({
    claimedJob: pendingServerCloudJob({
      target_project_id: EXISTING_PROJECT_ID,
    }),
    existingProject: {
      id: EXISTING_PROJECT_ID,
      title: 'Existing Project',
      source_labels: ['鉄壁'],
    },
    userPreference: { ai_enabled: false },
    wordsInsertError: { message: 'words insert failed' },
    trace,
  });
  const pushNotifications: unknown[] = [];
  const apnsNotifications: unknown[] = [];
  const timingFlushes: unknown[] = [];

  const response = await processJobById(
    JOB_ID,
    createServerCloudContractDeps(client, {
      sendPushNotifications: async (_client, params) => {
        pushNotifications.push(params);
        trace.push(`push:${params.status}`);
      },
      sendApnsNotifications: async (_client, params) => {
        apnsNotifications.push(params);
        trace.push(`apns:${params.status}`);
      },
      flushTiming: async (_entries, _timing, jobId, userId, status) => {
        timingFlushes.push({ jobId, userId, status });
        trace.push(`timing:${status}`);
      },
    }),
  );

  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), {
    error: 'Processing failed',
  });
  assert.equal(client.operations.some((operation) =>
    operation.table === 'projects' &&
    operation.action === 'delete'
  ), false);
  assert.deepEqual(trace.filter((event) => [
    'db:projects.select',
    'db:projects.update',
    'db:words.insert',
    'db:scan_jobs.failed',
    'push:failed',
    'apns:failed',
    'timing:failed',
  ].includes(event)), [
    'db:projects.select',
    'db:projects.update',
    'db:words.insert',
    'db:scan_jobs.failed',
    'push:failed',
    'apns:failed',
    'timing:failed',
  ]);

  const wordsInsert = findOperation(
    client,
    (operation) => operation.table === 'words' && operation.action === 'insert',
    'missing words insert',
  );
  assert.ok(Array.isArray(wordsInsert.payload));
  assert.equal(wordsInsert.payload[0]?.project_id, EXISTING_PROJECT_ID);

  const failedUpdate = findScanJobUpdate(client, 'failed');
  assert.ok(isRecord(failedUpdate.payload));
  assert.equal(failedUpdate.payload.error_message, 'Failed to insert words');
  assert.deepEqual(pushNotifications, [
    {
      userId: USER_ID,
      jobId: JOB_ID,
      projectId: null,
      projectTitle: 'Scan Result',
      status: 'failed',
      wordCount: 0,
    },
  ]);
  assert.deepEqual(apnsNotifications, pushNotifications);
  assert.deepEqual(timingFlushes, [
    {
      jobId: JOB_ID,
      userId: USER_ID,
      status: 'failed',
    },
  ]);
});
