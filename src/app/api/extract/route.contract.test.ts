import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';

import {
  handleExtractPost,
  type ExtractRouteDeps,
} from './route';

interface ScanUsageData {
  requires_pro: boolean;
  allowed: boolean;
  current_count: number;
  limit: number | null;
  is_pro: boolean;
}

interface RpcCall {
  name: string;
  args: Record<string, unknown>;
}

function allowedScanData(overrides: Partial<ScanUsageData> = {}): ScanUsageData {
  return {
    requires_pro: false,
    allowed: true,
    current_count: 1,
    limit: 5,
    is_pro: false,
    ...overrides,
  };
}

class FakeExtractClient {
  readonly rpcCalls: RpcCall[] = [];
  readonly authTokens: Array<string | undefined> = [];

  constructor(
    private readonly options: {
      user?: { id: string } | null;
      authError?: { message: string } | null;
      scanData?: ScanUsageData | null;
      scanError?: { message: string } | null;
    } = {},
  ) {}

  auth = {
    getUser: async (token?: string) => {
      this.authTokens.push(token);
      const user = this.options.user === undefined
        ? { id: 'user-1' }
        : this.options.user;

      return {
        data: { user },
        error: this.options.authError ?? null,
      };
    },
  };

  async rpc(name: string, args: Record<string, unknown>) {
    this.rpcCalls.push({ name, args });
    const scanData = this.options.scanData === undefined
      ? allowedScanData()
      : this.options.scanData;

    return {
      data: scanData,
      error: this.options.scanError ?? null,
    };
  }
}

function jsonRequest(
  body: unknown,
  headers: Record<string, string> = {},
): NextRequest {
  return new NextRequest('http://localhost/api/extract', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

function createDeps(
  client: FakeExtractClient,
  calls: string[] = [],
  overrides: ExtractRouteDeps = {},
): ExtractRouteDeps {
  return {
    createClient: async () => client as never,
    getApiKeys: () => ({
      gemini: 'dummy-gemini-key',
      openai: 'dummy-openai-key',
    }),
    getProvidersForModes: () => ['gemini'],
    getMissingProviderKeyForModes: () => null,
    getMissingProviderKey: () => null,
    extractWords: async (_image, _apiKeys, options) => {
      calls.push(`extractWords:${String(options?.includeExamples)}`);
      return {
        success: true,
        data: {
          words: [
            {
              english: 'book',
              japanese: '本',
              japaneseSource: 'scan',
              sourceModes: ['idiom'],
              distractors: ['ペン', '机', '紙'],
              partOfSpeechTags: ['noun'],
            },
          ],
          sourceLabels: ['教材', '鉄壁', '鉄壁'],
        },
      };
    },
    extractCircledWords: async () => {
      calls.push('extractCircledWords');
      return {
        success: true,
        data: {
          words: [],
          sourceLabels: ['ノート'],
        },
      };
    },
    extractEikenWords: async () => {
      calls.push('extractEikenWords');
      return {
        success: true,
        extractedText: 'mock ocr',
        data: {
          words: [],
          sourceLabels: ['ノート'],
        },
      };
    },
    extractIdioms: async () => {
      calls.push('extractIdioms');
      return {
        success: true,
        data: {
          words: [],
          sourceLabels: ['ノート'],
        },
      };
    },
    extractCompositeWords: async (_image, _apiKeys, options) => {
      calls.push(`extractCompositeWords:${options.modes.join(',')}:${options.eikenLevel ?? ''}`);
      return {
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
              exampleSentence: 'I look forward to hearing from you.',
              exampleSentenceJa: 'ご連絡をお待ちしています。',
            },
          ],
          sourceLabels: ['教材'],
        },
      };
    },
    resolveImmediateWords: async (words) => {
      calls.push('resolveImmediateWords');
      return {
        words: words as never,
        lexiconEntries: [
          {
            id: 'lexicon-book',
            headword: 'book',
            normalizedHeadword: 'book',
            pos: 'noun',
            datasetSources: ['鉄壁'],
            createdAt: '2026-05-08T00:00:00.000Z',
            updatedAt: '2026-05-08T00:00:00.000Z',
          },
        ],
        metrics: {
          lookupKeyCount: 1,
          masterHitCount: 1,
          masterTranslationHitCount: 1,
          masterPronunciationHitCount: 0,
          masterDistractorHitCount: 0,
          aiMissCount: 0,
          lookupElapsedMs: 0,
          translationElapsedMs: 0,
          totalElapsedMs: 0,
        },
      };
    },
    backfillWords: async (words) => ({
      words,
      aiBackfilledIndexes: [],
    }),
    generateExamples: async () => {
      calls.push('generateExamples');
      return {
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
      };
    },
    saveExamples: async () => {
      calls.push('saveExamples');
      return { updated: 0, errors: 0 };
    },
    ...overrides,
  };
}

async function jsonPayload(response: Response): Promise<Record<string, unknown>> {
  return await response.json() as Record<string, unknown>;
}

test('/api/extract returns 401 when the route client has no authenticated user', async () => {
  const client = new FakeExtractClient({ user: null });

  const response = await handleExtractPost(
    jsonRequest({ image: 'data:image/png;base64,AAAA' }),
    createDeps(client),
  );

  assert.equal(response.status, 401);
  assert.deepEqual(await jsonPayload(response), {
    success: false,
    error: '認証が必要です。ログインしてください。',
  });
  assert.deepEqual(client.authTokens, [undefined]);
  assert.deepEqual(client.rpcCalls, []);
});

test('/api/extract rejects strict request schema errors before usage increment', async () => {
  const client = new FakeExtractClient();

  const response = await handleExtractPost(
    jsonRequest({
      image: 'data:image/png;base64,AAAA',
      userId: 'another-user',
    }),
    createDeps(client),
  );

  assert.equal(response.status, 400);
  assert.deepEqual(await jsonPayload(response), {
    error: 'リクエストの解析に失敗しました',
  });
  assert.deepEqual(client.rpcCalls, []);
});

test('/api/extract rejects unsupported file types before usage increment', async () => {
  const client = new FakeExtractClient();

  const response = await handleExtractPost(
    jsonRequest({ image: 'data:text/plain;base64,AAAA' }),
    createDeps(client),
  );

  assert.equal(response.status, 400);
  assert.deepEqual(await jsonPayload(response), {
    success: false,
    error: 'ファイル形式が不正です。JPEG/PNG形式の画像またはPDFを使用してください。',
  });
  assert.deepEqual(client.rpcCalls, []);
});

test('/api/extract rejects PDF when the selected mode uses OpenAI before usage increment', async () => {
  const client = new FakeExtractClient();

  const response = await handleExtractPost(
    jsonRequest({ image: 'data:application/pdf;base64,AAAA' }),
    createDeps(client, [], {
      getProvidersForModes: () => ['openai'],
    }),
  );

  assert.equal(response.status, 400);
  assert.deepEqual(await jsonPayload(response), {
    success: false,
    error: '現在のサーバー設定ではPDF解析に対応していません。PDFを画像（PNG/JPEG）に変換して再アップロードしてください。',
  });
  assert.deepEqual(client.rpcCalls, []);
});

test('/api/extract rejects HEIC and HEIF before usage increment', async () => {
  const client = new FakeExtractClient();

  const response = await handleExtractPost(
    jsonRequest({ image: 'data:image/heic;base64,AAAA' }),
    createDeps(client),
  );

  assert.equal(response.status, 400);
  assert.deepEqual(await jsonPayload(response), {
    success: false,
    error: 'HEIC/HEIF形式は対応していません。カメラアプリの設定で「互換性優先」を選択するか、スクリーンショットをお試しください。',
  });
  assert.deepEqual(client.rpcCalls, []);
});

test('/api/extract uses scan usage response to reject free users from Pro-only modes', async () => {
  const client = new FakeExtractClient({
    scanData: allowedScanData({
      requires_pro: true,
      allowed: false,
      current_count: 0,
      limit: 5,
      is_pro: false,
    }),
  });
  const calls: string[] = [];

  const response = await handleExtractPost(
    jsonRequest(
      {
        image: 'data:image/png;base64,AAAA',
        mode: 'idiom',
      },
      {
        authorization: 'Bearer bearer-token-1',
      },
    ),
    createDeps(client, calls),
  );

  assert.equal(response.status, 403);
  assert.deepEqual(await jsonPayload(response), {
    success: false,
    error: 'この機能はProプラン限定です。',
  });
  assert.deepEqual(client.authTokens, ['bearer-token-1']);
  assert.deepEqual(client.rpcCalls, [
    {
      name: 'check_and_increment_scan',
      args: { p_require_pro: true },
    },
  ]);
  assert.deepEqual(calls, []);
});

test('/api/extract runs one composite extraction and overwrites sourceModes from normalized scanModes', async () => {
  const client = new FakeExtractClient({
    scanData: allowedScanData({
      current_count: 2,
      limit: 5,
      is_pro: true,
    }),
  });
  const calls: string[] = [];

  const response = await handleExtractPost(
    jsonRequest({
      image: 'data:image/png;base64,AAAA',
      mode: 'all',
      scanModes: ['all', 'idiom', 'eiken'],
      eikenLevel: '2',
    }),
    createDeps(client, calls),
  );

  const payload = await jsonPayload(response);
  assert.equal(response.status, 200);
  assert.equal(payload.success, true);
  assert.deepEqual(client.rpcCalls, [
    {
      name: 'check_and_increment_scan',
      args: { p_require_pro: true },
    },
  ]);
  assert.deepEqual(calls, [
    'extractCompositeWords:all,idiom,eiken:2',
    'resolveImmediateWords',
  ]);
  assert.deepEqual(payload.words, [
    {
      english: 'look forward to',
      japanese: '楽しみに待つ',
      japaneseSource: 'scan',
      translations: [
        {
          translationJa: '楽しみに待つ',
          normalizedTranslationJa: '楽しみに待つ',
          source: 'scan',
          meaningRank: 1,
          position: 0,
          isPrimary: true,
        },
      ],
      sourceModes: ['all', 'idiom', 'eiken'],
      distractors: [],
      partOfSpeechTags: ['idiom'],
      exampleSentence: 'I look forward to hearing from you.',
      exampleSentenceJa: 'ご連絡をお待ちしています。',
    },
  ]);
});

test('/api/extract preserves usage-limit response shape', async () => {
  const client = new FakeExtractClient({
    scanData: allowedScanData({
      requires_pro: false,
      allowed: false,
      current_count: 5,
      limit: 5,
      is_pro: false,
    }),
  });

  const response = await handleExtractPost(
    jsonRequest({ image: 'data:image/png;base64,AAAA' }),
    createDeps(client),
  );

  assert.equal(response.status, 429);
  assert.deepEqual(await jsonPayload(response), {
    success: false,
    error: '本日のスキャン上限（5回）に達しました。Proプランにアップグレードすると無制限にスキャンできます。',
    limitReached: true,
    scanInfo: {
      currentCount: 5,
      limit: 5,
      isPro: false,
    },
  });
  assert.deepEqual(client.rpcCalls, [
    {
      name: 'check_and_increment_scan',
      args: { p_require_pro: false },
    },
  ]);
});

test('/api/extract keeps missing EIKEN level validation after usage increment and before AI extraction', async () => {
  const client = new FakeExtractClient();
  const calls: string[] = [];

  const response = await handleExtractPost(
    jsonRequest({
      image: 'data:image/png;base64,AAAA',
      mode: 'eiken',
    }),
    createDeps(client, calls),
  );

  assert.equal(response.status, 400);
  assert.deepEqual(await jsonPayload(response), {
    success: false,
    error: '英検レベルを指定してください',
  });
  assert.deepEqual(client.rpcCalls, [
    {
      name: 'check_and_increment_scan',
      args: { p_require_pro: true },
    },
  ]);
  assert.deepEqual(calls, []);
});

test('/api/extract returns 500 when scan usage check fails', async () => {
  const client = new FakeExtractClient({
    scanData: null,
    scanError: { message: 'rpc failed' },
  });

  const response = await handleExtractPost(
    jsonRequest({ image: 'data:image/png;base64,AAAA' }),
    createDeps(client),
  );

  assert.equal(response.status, 500);
  assert.deepEqual(await jsonPayload(response), {
    success: false,
    error: 'スキャン制限の確認に失敗しました',
  });
});

test('/api/extract returns 422 when AI extraction reports a model-level failure', async () => {
  const client = new FakeExtractClient();

  const response = await handleExtractPost(
    jsonRequest({ image: 'data:image/png;base64,AAAA' }),
    createDeps(client, [], {
      extractWords: async () => ({
        success: false,
        error: '単語を抽出できませんでした',
      }),
    }),
  );

  assert.equal(response.status, 422);
  assert.deepEqual(await jsonPayload(response), {
    success: false,
    error: '単語を抽出できませんでした',
  });
});

test('/api/extract success response keeps scanInfo, sourceLabels, lexiconEntries, and non-blocking examples', async () => {
  const client = new FakeExtractClient({
    scanData: allowedScanData({
      current_count: 2,
      limit: 5,
      is_pro: true,
    }),
  });
  const calls: string[] = [];

  const response = await handleExtractPost(
    jsonRequest({ image: 'data:image/png;base64,AAAA' }),
    createDeps(client, calls, {
      generateExamples: async () => {
        calls.push('generateExamples');
        throw new Error('example provider failed');
      },
    }),
  );

  const payload = await jsonPayload(response);

  assert.equal(response.status, 200);
  assert.equal(payload.success, true);
  assert.equal(payload.limitReached, undefined);
  assert.deepEqual(payload.scanInfo, {
    currentCount: 2,
    limit: 5,
    isPro: true,
  });
  assert.deepEqual(payload.sourceLabels, ['鉄壁']);
  assert.deepEqual(payload.lexiconEntries, [
    {
      id: 'lexicon-book',
      headword: 'book',
      normalizedHeadword: 'book',
      pos: 'noun',
      datasetSources: ['鉄壁'],
      createdAt: '2026-05-08T00:00:00.000Z',
      updatedAt: '2026-05-08T00:00:00.000Z',
    },
  ]);
  assert.deepEqual(payload.words, [
    {
      english: 'book',
      japanese: '本',
      japaneseSource: 'scan',
      translations: [
        {
          translationJa: '本',
          normalizedTranslationJa: '本',
          source: 'scan',
          meaningRank: 1,
          position: 0,
          isPrimary: true,
        },
      ],
      sourceModes: ['all'],
      distractors: ['ペン', '机', '紙'],
      partOfSpeechTags: ['noun'],
    },
  ]);
  assert.deepEqual(calls, [
    'extractWords:false',
    'resolveImmediateWords',
    'generateExamples',
  ]);
});
