import { getSupabaseAdmin } from '@/lib/supabase/admin';
import type { PublicGrammarBookCard, PublicGrammarBookListPayload } from '@/lib/grammar/types';

/**
 * 共有ページに公開された語法問題集の読み出しヘルパー。
 *
 * grammar_books の RLS は本人限定のままなので、他人が公開した問題集の一覧は
 * service-role client でのみ読む (共有単語帳と同じ方針)。ここで返すのは
 * タイトル・問題数などの要約だけで、問題文や解説は含めない
 * (中身は /api/grammar/share/[shareId] のログイン必須ルートから取得する)。
 */

type SupabaseAdminClient = ReturnType<typeof getSupabaseAdmin>;

const PUBLIC_BOOK_SELECT = 'id,share_id,user_id,title,published_at,import_count';
const DEFAULT_PAGE_SIZE = 12;
const MAX_PAGE_SIZE = 40;
/** 検索はタイトル・投稿者名をメモリ側で突き合わせるため、広めに取る */
const SEARCH_FETCH_SIZE = 200;

type PublicGrammarBookRow = {
  id: string;
  share_id: string | null;
  user_id: string;
  title: string;
  published_at?: string | null;
  import_count?: number | null;
};

type ProfileSummary = {
  username: string | null;
  accountId: string | null;
};

export type PublicGrammarBookListOptions = {
  limit?: number;
  cursor?: string | null;
  query?: string | null;
};

function clampPageSize(limit?: number): number {
  if (!Number.isFinite(limit)) return DEFAULT_PAGE_SIZE;
  return Math.max(1, Math.min(MAX_PAGE_SIZE, Math.floor(Number(limit))));
}

function encodeOffsetCursor(offset: number): string {
  return Buffer.from(JSON.stringify({ offset }), 'utf8').toString('base64url');
}

function decodeOffsetCursor(cursor: string | null | undefined): number {
  if (!cursor) return 0;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as { offset?: unknown };
    return typeof parsed.offset === 'number' && Number.isFinite(parsed.offset) && parsed.offset > 0
      ? Math.floor(parsed.offset)
      : 0;
  } catch {
    return 0;
  }
}

function normalizeSearchQuery(query?: string | null): string {
  return (query ?? '').trim().replace(/^@+/, '').toLowerCase();
}

function includesSearchText(value: string | null | undefined, query: string): boolean {
  return value?.toLowerCase().includes(query) ?? false;
}

function rowMatchesSearch(row: PublicGrammarBookRow, profile: ProfileSummary | undefined, query: string): boolean {
  if (!query) return true;
  return includesSearchText(row.title, query)
    || includesSearchText(profile?.username, query)
    || includesSearchText(profile?.accountId, query);
}

/** 投稿者表示用のプロフィール。取得できなくても一覧は返す (best-effort)。 */
async function getProfilesByUserIds(
  admin: SupabaseAdminClient,
  userIds: string[],
): Promise<Map<string, ProfileSummary>> {
  const result = new Map<string, ProfileSummary>();
  const uniqueIds = Array.from(new Set(userIds.filter(Boolean)));
  if (uniqueIds.length === 0) return result;

  try {
    const { data, error } = await admin
      .from('profiles')
      .select('user_id,username,account_id')
      .in('user_id', uniqueIds);

    if (error) return result;

    for (const row of data ?? []) {
      result.set(row.user_id as string, {
        username: (row.username as string | null) ?? null,
        accountId: (row.account_id as string | null) ?? null,
      });
    }
  } catch {
    // profiles が読めなくても公開一覧自体は表示する。
  }

  return result;
}

/** book_id -> 問題数。問題が1問もない問題集は 0 になる。 */
async function getQuestionCounts(
  admin: SupabaseAdminClient,
  bookIds: string[],
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (bookIds.length === 0) return counts;

  const { data, error } = await admin
    .from('grammar_questions')
    .select('book_id')
    .in('book_id', bookIds);

  if (error) {
    console.warn('[grammar/public] question count lookup failed:', error.message);
    return counts;
  }

  for (const row of (data ?? []) as { book_id: string }[]) {
    counts.set(row.book_id, (counts.get(row.book_id) ?? 0) + 1);
  }
  return counts;
}

async function mapCards(
  admin: SupabaseAdminClient,
  rows: PublicGrammarBookRow[],
): Promise<PublicGrammarBookCard[]> {
  const [profileByUserId, questionCounts] = await Promise.all([
    getProfilesByUserIds(admin, rows.map((row) => row.user_id)),
    getQuestionCounts(admin, rows.map((row) => row.id)),
  ]);

  return rows.map((row) => {
    const profile = profileByUserId.get(row.user_id);
    return {
      id: row.id,
      shareId: row.share_id as string,
      title: row.title,
      questionCount: questionCounts.get(row.id) ?? 0,
      importCount: Number(row.import_count ?? 0),
      publishedAt: row.published_at ?? null,
      ownerUsername: profile?.username ?? null,
      ownerAccountId: profile?.accountId ?? null,
    };
  });
}

/**
 * 共有ページに公開されている語法問題集の一覧。
 * is_public 列が未マイグレーションの環境では空一覧にフォールバックする
 * (共有ページ全体を壊さないため)。
 */
export async function listPublicGrammarBooks(
  options: PublicGrammarBookListOptions = {},
  admin: SupabaseAdminClient = getSupabaseAdmin(),
): Promise<PublicGrammarBookListPayload> {
  const limit = clampPageSize(options.limit);
  const query = normalizeSearchQuery(options.query);
  const offset = decodeOffsetCursor(options.cursor);
  const fetchSize = query ? Math.max(SEARCH_FETCH_SIZE, (offset + limit + 1) * 4) : offset + limit + 1;

  const { data, error } = await admin
    .from('grammar_books')
    .select(PUBLIC_BOOK_SELECT)
    .eq('is_public', true)
    .not('share_id', 'is', null)
    .order('published_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(fetchSize);

  if (error) {
    console.warn('[grammar/public] public grammar book lookup failed:', error.message);
    return { items: [], nextCursor: null };
  }

  const rows = ((data ?? []) as unknown as PublicGrammarBookRow[]).filter((row) => Boolean(row.share_id));
  const profileByUserId = query
    ? await getProfilesByUserIds(admin, rows.map((row) => row.user_id))
    : new Map<string, ProfileSummary>();
  const matchingRows = query
    ? rows.filter((row) => rowMatchesSearch(row, profileByUserId.get(row.user_id), query))
    : rows;
  const pageRows = matchingRows.slice(offset, offset + limit);

  return {
    items: await mapCards(admin, pageRows),
    nextCursor: matchingRows.length > offset + limit ? encodeOffsetCursor(offset + limit) : null,
  };
}

/** 自分が共有ページに公開している問題集 (共有停止のUI用)。 */
export async function listMyPublicGrammarBooks(
  userId: string,
  admin: SupabaseAdminClient = getSupabaseAdmin(),
): Promise<PublicGrammarBookCard[]> {
  const { data, error } = await admin
    .from('grammar_books')
    .select(PUBLIC_BOOK_SELECT)
    .eq('user_id', userId)
    .eq('is_public', true)
    .not('share_id', 'is', null)
    .order('published_at', { ascending: false });

  if (error) {
    console.warn('[grammar/public] my published grammar book lookup failed:', error.message);
    return [];
  }

  const rows = ((data ?? []) as unknown as PublicGrammarBookRow[]).filter((row) => Boolean(row.share_id));
  return mapCards(admin, rows);
}

/**
 * 共有ページへの公開を停止する。リンクも同時に失効させる (共有単語帳の
 * 「共有停止」がスナップショットごと消すのと同じ挙動に合わせる)。
 * 本人の行だけを対象にするため user_id で明示的に絞る。
 */
export async function unpublishGrammarBook(
  userId: string,
  bookId: string,
  admin: SupabaseAdminClient = getSupabaseAdmin(),
): Promise<boolean> {
  const { data, error } = await admin
    .from('grammar_books')
    .update({ is_public: false, published_at: null, share_id: null })
    .eq('id', bookId)
    .eq('user_id', userId)
    .select('id');

  if (error) {
    throw new Error(error.message || 'grammar_book_unpublish_failed');
  }
  return (data ?? []).length > 0;
}

/** 取り込み回数の加算 (人気順の材料)。失敗しても取り込み自体は成功扱いにする。 */
export async function incrementGrammarBookImportCount(
  bookId: string,
  admin: SupabaseAdminClient = getSupabaseAdmin(),
): Promise<void> {
  try {
    const { data, error } = await admin
      .from('grammar_books')
      .select('import_count')
      .eq('id', bookId)
      .maybeSingle<{ import_count: number | null }>();

    if (error || !data) return;

    await admin
      .from('grammar_books')
      .update({ import_count: Number(data.import_count ?? 0) + 1 })
      .eq('id', bookId);
  } catch (error) {
    console.warn('[grammar/public] import count increment skipped:', error);
  }
}
