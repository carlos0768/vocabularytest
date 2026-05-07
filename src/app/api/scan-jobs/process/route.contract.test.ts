import test from 'node:test';
import assert from 'node:assert/strict';

import type { SupabaseClient } from '@supabase/supabase-js';

import {
  processJobById,
  type ProcessJobDeps,
} from '@/app/api/scan-jobs/process/route';

const JOB_ID = '0dd8f4d8-22cf-4010-b6e7-99485683023c';
const USER_ID = '11111111-1111-4111-8111-111111111111';

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
  eiken_level: string | null;
  project_title: string;
  project_icon_image: string | null;
}

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

  async maybeSingle<T = unknown>(): Promise<{ data: T | null; error: null }> {
    return this.client.resolveMaybeSingle<T>(this.operation);
  }

  async single<T = unknown>(): Promise<{ data: T | null; error: { message: string } | null }> {
    return this.client.resolveSingle<T>(this.operation);
  }

  then<TResult1 = { data: null; error: null }, TResult2 = never>(
    onfulfilled?: ((value: { data: null; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return Promise.resolve({ data: null, error: null }).then(onfulfilled, onrejected);
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
    },
  ) {}

  storage = {
    from: (bucket: string) => ({
      download: async (path: string) => {
        this.storageDownloads.push(path);
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

  async resolveSingle<T>(
    operation: QueryOperation,
  ): Promise<{ data: T | null; error: { message: string } | null }> {
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

    throw new Error(`Unexpected single operation: ${operation.table}.${operation.action}`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
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
      words,
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
    ...overrides,
  };
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

  const resultPayload = JSON.parse(completedUpdate.payload.result);
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
