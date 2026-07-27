import assert from 'node:assert/strict';
import test from 'node:test';

import {
  listMyPublicGrammarBooks,
  listPublicGrammarBooks,
  unpublishGrammarBook,
} from '@/app/api/grammar/shared-grammar-books';

type BookRow = {
  id: string;
  share_id: string | null;
  user_id: string;
  title: string;
  published_at: string | null;
  import_count?: number | null;
};

type QueryResult<T> = { data: T[] | null; error: { message: string } | null };

/** listPublicGrammarBooks の第2引数 (service-role client) の差し替え型 */
type FakeAdmin = Parameters<typeof listPublicGrammarBooks>[1];

const BOOKS: BookRow[] = [
  { id: 'book-1', share_id: 'share-1', user_id: 'user-1', title: '仮定法編', published_at: '2026-07-20T00:00:00Z', import_count: 3 },
  { id: 'book-2', share_id: 'share-2', user_id: 'user-2', title: '関係詞編', published_at: '2026-07-19T00:00:00Z', import_count: 0 },
  { id: 'book-3', share_id: null, user_id: 'user-1', title: '未公開', published_at: null },
];

const QUESTIONS = [
  { book_id: 'book-1' },
  { book_id: 'book-1' },
  { book_id: 'book-2' },
];

const PROFILES = [
  { user_id: 'user-1', username: 'ゆうき', account_id: 'yuki' },
  { user_id: 'user-2', username: null, account_id: 'ken' },
];

type UnpublishState = { payloads: Record<string, unknown>[]; matches: boolean };

/**
 * PostgREST のクエリビルダを最小限だけ模したフェイク。
 * `.select().eq().not().order().order().limit(n)` (公開一覧) と
 * `.select().eq().eq().not().order()` (自分の公開中一覧) の両方を
 * await できるよう、ビルダ自身も thenable にしている。
 */
function buildBooksBuilder(books: BookRow[], unpublish?: UnpublishState) {
  const builder = {
    select: () => builder,
    eq: () => builder,
    not: () => builder,
    order: () => builder,
    limit: async (size: number): Promise<QueryResult<BookRow>> => ({ data: books.slice(0, size), error: null }),
    then: (resolve: (value: QueryResult<BookRow>) => void) => resolve({ data: books, error: null }),
    update: (payload: Record<string, unknown>) => ({
      eq: () => ({
        eq: () => ({
          select: async (): Promise<QueryResult<{ id: string }>> => {
            unpublish?.payloads.push(payload);
            return { data: unpublish?.matches ? [{ id: 'book-1' }] : [], error: null };
          },
        }),
      }),
    }),
  };
  return builder;
}

function buildFakeAdmin(options: { books?: BookRow[]; unpublish?: UnpublishState } = {}): FakeAdmin {
  const books = options.books ?? BOOKS;

  return {
    from(table: string) {
      if (table === 'grammar_books') {
        return buildBooksBuilder(books, options.unpublish);
      }
      if (table === 'grammar_questions') {
        return {
          select: () => ({
            in: async (_column: string, ids: string[]) => ({
              data: QUESTIONS.filter((question) => ids.includes(question.book_id)),
              error: null,
            }),
          }),
        };
      }
      if (table === 'profiles') {
        return {
          select: () => ({
            in: async (_column: string, ids: string[]) => ({
              data: PROFILES.filter((profile) => ids.includes(profile.user_id)),
              error: null,
            }),
          }),
        };
      }
      throw new Error(`unexpected table: ${table}`);
    },
  } as unknown as FakeAdmin;
}

test('公開一覧は share_id のない問題集を除外し、問題数と投稿者を埋める', async () => {
  const result = await listPublicGrammarBooks({ limit: 10 }, buildFakeAdmin());

  assert.deepEqual(result.items.map((item) => item.id), ['book-1', 'book-2']);
  assert.equal(result.items[0].questionCount, 2);
  assert.equal(result.items[0].shareId, 'share-1');
  assert.equal(result.items[0].ownerAccountId, 'yuki');
  assert.equal(result.items[0].importCount, 3);
  assert.equal(result.items[1].questionCount, 1);
  assert.equal(result.nextCursor, null);
});

test('公開一覧はタイトル・投稿者で検索できる', async () => {
  const byTitle = await listPublicGrammarBooks({ query: '関係詞' }, buildFakeAdmin());
  assert.deepEqual(byTitle.items.map((item) => item.id), ['book-2']);

  const byAccount = await listPublicGrammarBooks({ query: '@yuki' }, buildFakeAdmin());
  assert.deepEqual(byAccount.items.map((item) => item.id), ['book-1']);

  const noHit = await listPublicGrammarBooks({ query: '存在しない' }, buildFakeAdmin());
  assert.deepEqual(noHit.items, []);
});

test('公開一覧は続きがあるときだけカーソルを返し、カーソルで次ページに進む', async () => {
  const firstPage = await listPublicGrammarBooks({ limit: 1 }, buildFakeAdmin());
  assert.deepEqual(firstPage.items.map((item) => item.id), ['book-1']);
  assert.ok(firstPage.nextCursor);

  const secondPage = await listPublicGrammarBooks(
    { limit: 1, cursor: firstPage.nextCursor },
    buildFakeAdmin(),
  );
  assert.deepEqual(secondPage.items.map((item) => item.id), ['book-2']);
  assert.equal(secondPage.nextCursor, null);
});

test('公開一覧は列が無いなどの取得失敗で空一覧にフォールバックする', async () => {
  const failingAdmin = {
    from: () => ({
      select: () => ({
        eq: () => ({
          not: () => ({
            order: () => ({
              order: () => ({
                limit: async () => ({ data: null, error: { message: 'column is_public does not exist' } }),
              }),
            }),
          }),
        }),
      }),
    }),
  } as unknown as FakeAdmin;

  const result = await listPublicGrammarBooks({}, failingAdmin);
  assert.deepEqual(result, { items: [], nextCursor: null });
});

test('自分の公開中一覧も share_id のない問題集を除外する', async () => {
  const books = await listMyPublicGrammarBooks('user-1', buildFakeAdmin());
  assert.deepEqual(books.map((book) => book.id), ['book-1', 'book-2']);
});

test('共有停止は公開フラグと共有リンクの両方を落とす', async () => {
  const state: UnpublishState = { payloads: [], matches: true };
  const stopped = await unpublishGrammarBook('user-1', 'book-1', buildFakeAdmin({ unpublish: state }));

  assert.equal(stopped, true);
  assert.deepEqual(state.payloads[0], { is_public: false, published_at: null, share_id: null });
});

test('共有停止は他人の問題集には効かない', async () => {
  const state: UnpublishState = { payloads: [], matches: false };
  const stopped = await unpublishGrammarBook('user-9', 'book-1', buildFakeAdmin({ unpublish: state }));
  assert.equal(stopped, false);
});
