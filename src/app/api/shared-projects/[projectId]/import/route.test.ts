import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest } from 'next/server';
import { handleSharedProjectImportPost } from './route';

type SubscriptionRow = {
  status?: string | null;
  plan?: string | null;
  pro_source?: string | null;
  test_pro_expires_at?: string | null;
  current_period_end?: string | null;
};

type FakeWordRow = {
  id: string;
  project_id: string;
  english: string;
  japanese: string;
  vocabulary_type?: 'active' | 'passive' | null;
  lexicon_entry_id?: string | null;
  distractors: string[];
  example_sentence?: string | null;
  example_sentence_ja?: string | null;
  pronunciation?: string | null;
  part_of_speech_tags?: string[] | null;
  related_words?: unknown;
  usage_patterns?: unknown;
  insights_generated_at?: string | null;
  insights_version?: number | null;
  status: 'new' | 'review' | 'mastered';
  created_at: string;
  ease_factor: number;
  interval_days: number;
  repetition: number;
  is_favorite: boolean;
  lexicon_entries?: {
    id: string;
    headword: string;
    normalized_headword: string;
    pos: string;
    translation_ja?: string | null;
    example_sentence?: string | null;
    example_sentence_ja?: string | null;
    created_at: string;
    updated_at: string;
  } | null;
};

class FakeSharedImportClient {
  public insertedProjects: Record<string, unknown>[] = [];
  public insertedWordChunks: Record<string, unknown>[][] = [];
  public deletedProjectIds: string[] = [];

  constructor(
    private readonly userId: string | null,
    private readonly subscriptionRow: SubscriptionRow | null,
    private readonly sourceWords: FakeWordRow[],
  ) {}

  auth = {
    getUser: async () => ({
      data: {
        user: this.userId ? { id: this.userId } : null,
      },
      error: this.userId ? null : { message: 'not_authenticated' },
    }),
  };

  from(table: string) {
    if (table === 'subscriptions') {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: this.subscriptionRow,
              error: null,
            }),
          }),
        }),
      };
    }

    if (table === 'projects') {
      return {
        insert: async (row: Record<string, unknown>) => {
          this.insertedProjects.push({ ...row });
          return { error: null };
        },
        delete: () => ({
          eq: async (_field: string, id: string) => {
            this.deletedProjectIds.push(id);
            return { error: null };
          },
        }),
      };
    }

    if (table === 'words') {
      return {
        select: () => ({
          eq: (_field: string, projectId: string) => ({
            in: async (_idField: string, ids: string[]) => ({
              data: this.sourceWords.filter((row) => row.project_id === projectId && ids.includes(row.id)),
              error: null,
            }),
          }),
        }),
        insert: async (rows: Record<string, unknown>[]) => {
          this.insertedWordChunks.push(rows.map((row) => ({ ...row })));
          return { error: null };
        },
      };
    }

    throw new Error(`Unexpected table: ${table}`);
  }
}

function jsonRequest(body: unknown) {
  return new NextRequest('http://localhost/api/shared-projects/project-1/import', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

function createSourceWordRow(overrides: Partial<FakeWordRow> = {}): FakeWordRow {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    project_id: 'project-1',
    english: 'book',
    japanese: '本',
    vocabulary_type: 'active',
    lexicon_entry_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    distractors: ['pen', 'desk', 'lamp'],
    example_sentence: null,
    example_sentence_ja: null,
    pronunciation: '/bʊk/',
    part_of_speech_tags: ['noun'],
    related_words: [{ term: 'volume', relation: 'synonym' }],
    usage_patterns: [{ pattern: 'book a flight', meaning_ja: '予約する' }],
    insights_generated_at: '2026-04-01T00:00:00.000Z',
    insights_version: 3,
    status: 'mastered',
    created_at: '2026-04-01T00:00:00.000Z',
    ease_factor: 3.2,
    interval_days: 10,
    repetition: 4,
    is_favorite: true,
    lexicon_entries: {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      headword: 'book',
      normalized_headword: 'book',
      pos: 'noun',
      translation_ja: '本',
      example_sentence: 'I read a book.',
      example_sentence_ja: '私は本を読む。',
      created_at: '2026-04-01T00:00:00.000Z',
      updated_at: '2026-04-01T00:00:00.000Z',
    },
    ...overrides,
  };
}

test('shared-project import returns 401 when unauthenticated', async () => {
  const client = new FakeSharedImportClient(null, null, []);

  const response = await handleSharedProjectImportPost(
    jsonRequest({
      sourceWordIds: ['11111111-1111-4111-8111-111111111111'],
    }),
    { projectId: 'project-1' },
    {
      createClient: async () => client as never,
      requireAccess: async () => {
        throw new Error('requireAccess should not be called');
      },
    },
  );

  assert.equal(response.status, 401);
});

test('shared-project import returns 403 when user is not active pro', async () => {
  const client = new FakeSharedImportClient(
    'user-1',
    {
      status: 'free',
      plan: 'free',
    },
    [],
  );

  const response = await handleSharedProjectImportPost(
    jsonRequest({
      sourceWordIds: ['11111111-1111-4111-8111-111111111111'],
    }),
    { projectId: 'project-1' },
    {
      createClient: async () => client as never,
      requireAccess: async () => {
        throw new Error('requireAccess should not be called');
      },
    },
  );

  assert.equal(response.status, 403);
});

test('shared-project import copies selected words and stores imported_from_share_id', async () => {
  const sourceWordId = '11111111-1111-4111-8111-111111111111';
  const client = new FakeSharedImportClient(
    'user-1',
    {
      status: 'active',
      plan: 'pro',
      pro_source: 'billing',
      current_period_end: '2099-01-01T00:00:00.000Z',
    },
    [createSourceWordRow({ id: sourceWordId })],
  );

  const response = await handleSharedProjectImportPost(
    jsonRequest({
      sourceWordIds: [sourceWordId],
    }),
    { projectId: 'project-1' },
    {
      createClient: async () => client as never,
      requireAccess: async () => ({
        ok: true as const,
        user: { id: 'user-1' },
        access: {
          project: {
            id: 'project-1',
            userId: 'owner-1',
            title: '共有単語帳',
            sourceLabels: [],
            createdAt: '2026-04-01T00:00:00.000Z',
            shareId: 'share-abc',
            shareScope: 'public' as const,
            isFavorite: false,
          },
          accessRole: 'viewer' as const,
          wordCount: 1,
          collaboratorCount: 1,
          likeCount: 0,
        },
      }),
      now: () => new Date('2026-04-09T00:00:00.000Z'),
      createId: (() => {
        const ids = [
          '22222222-2222-4222-8222-222222222222',
          '33333333-3333-4333-8333-333333333333',
        ];
        return () => ids.shift() ?? '44444444-4444-4444-8444-444444444444';
      })(),
    },
  );

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.project.id, '22222222-2222-4222-8222-222222222222');
  assert.equal(payload.project.importedFromShareId, 'share-abc');
  assert.deepEqual(payload.wordMappings, [
    {
      sourceWordId,
      targetWordId: '33333333-3333-4333-8333-333333333333',
    },
  ]);
  assert.equal(client.insertedProjects.length, 1);
  assert.equal(client.insertedProjects[0]?.['imported_from_share_id'], 'share-abc');
  assert.equal(client.insertedWordChunks.length, 1);
  assert.equal(client.insertedWordChunks[0]?.[0]?.['english'], 'book');
  assert.equal(client.insertedWordChunks[0]?.[0]?.['example_sentence'], 'I read a book.');
  assert.equal(client.insertedWordChunks[0]?.[0]?.['lexicon_entry_id'], undefined);
  assert.equal(client.insertedWordChunks[0]?.[0]?.['related_words'], undefined);
  assert.equal(client.insertedWordChunks[0]?.[0]?.['usage_patterns'], undefined);
  assert.equal(client.insertedWordChunks[0]?.[0]?.['insights_generated_at'], undefined);
  assert.equal(client.insertedWordChunks[0]?.[0]?.['status'], 'new');
  assert.equal(client.insertedWordChunks[0]?.[0]?.['is_favorite'], false);
});

test('shared-project import inserts words in 200-word chunks', async () => {
  const sourceWords = Array.from({ length: 250 }, (_, index) => createSourceWordRow({
    id: `${String(index + 1).padStart(8, '0')}-1111-4111-8111-111111111111`,
    english: `word-${index + 1}`,
  }));
  const client = new FakeSharedImportClient(
    'user-1',
    {
      status: 'active',
      plan: 'pro',
      pro_source: 'billing',
      current_period_end: '2099-01-01T00:00:00.000Z',
    },
    sourceWords,
  );

  const sourceWordIds = sourceWords.map((word) => word.id);
  let nextId = 1;

  const response = await handleSharedProjectImportPost(
    jsonRequest({ sourceWordIds }),
    { projectId: 'project-1' },
    {
      createClient: async () => client as never,
      requireAccess: async () => ({
        ok: true as const,
        user: { id: 'user-1' },
        access: {
          project: {
            id: 'project-1',
            userId: 'owner-1',
            title: '大量共有単語帳',
            sourceLabels: [],
            createdAt: '2026-04-01T00:00:00.000Z',
            shareId: 'share-bulk',
            shareScope: 'public' as const,
            isFavorite: false,
          },
          accessRole: 'viewer' as const,
          wordCount: 250,
          collaboratorCount: 1,
          likeCount: 0,
        },
      }),
      now: () => new Date('2026-04-09T00:00:00.000Z'),
      createId: () => `${String(nextId++).padStart(8, '0')}-2222-4222-8222-222222222222`,
    },
  );

  assert.equal(response.status, 200);
  assert.equal(client.insertedWordChunks.length, 2);
  assert.equal(client.insertedWordChunks[0]?.length, 200);
  assert.equal(client.insertedWordChunks[1]?.length, 50);
});
