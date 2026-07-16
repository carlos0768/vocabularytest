import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { eikenDistance, eikenLevelsAround } from '@/lib/reels/eiken-cefr';
import { rankReelCandidates } from '@/lib/reels/ranking';
import type { ReelBook, ReelCandidate } from '@/lib/reels/types';
import { getCachedMorphologyByHeadword } from '@/lib/morphology/lexicon';
import { lookupLexiconCefrLevels } from '@/lib/lexicon/eiken-cefr-filter';
import { EIKEN_LEVEL_TAG_LABELS } from '@/lib/shared-projects/eiken-level-tag';
import type {
  HomeRecommendedBook,
  HomeRecommendationsPayload,
  HomeReelPreviewItem,
} from '@/lib/home/recommendations-types';
import { normalizeHeadword } from '../../../../../shared/lexicon';

type SupabaseAdminClient = ReturnType<typeof getSupabaseAdmin>;

export const HOME_BOOKS_DEFAULT_LIMIT = 6;
export const HOME_BOOKS_MAX_LIMIT = 12;
export const HOME_REELS_DEFAULT_LIMIT = 10;
export const HOME_REELS_MAX_LIMIT = 16;

// Pool sizes: the home preview is fetched on (almost) every home visit, so
// these stay far smaller than the full reel feed's pools.
const BOOK_CANDIDATE_POOL = 60;
const REEL_SHARED_BOOK_POOL = 12;
const REEL_OFFICIAL_BOOK_POOL = 12;
const REEL_WORDS_PER_BOOK = 30;
const REEL_WORDS_FETCH_LIMIT = 500;

// ---------- helpers ----------

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.trim() !== '');
}

const EIKEN_LEVEL_BY_TAG = new Map(
  Object.entries(EIKEN_LEVEL_TAG_LABELS).map(([level, label]) => [label, level]),
);

/** shared_tags から英検級タグを引く（例: "#英検準2級" → { level: 'pre2', tag: '英検準2級' }）。 */
export function eikenLevelFromTags(tags: readonly string[]): { level: string | null; tag: string | null } {
  for (const raw of tags) {
    const tag = raw.trim().replace(/^[#＃]/, '');
    const level = EIKEN_LEVEL_BY_TAG.get(tag);
    if (level) return { level, tag };
  }
  return { level: null, tag: null };
}

// ---------- shared wordbook recommendations (英検級ベース) ----------

type HomeSharedBookRow = {
  id: string;
  share_id: string;
  user_id: string;
  title: string;
  icon_image: string | null;
  shared_tags: unknown;
  word_count: number | null;
  like_count: number | null;
  created_at: string | null;
};

/** 級の近さ > 人気 > 新しさ の順に効くスコア。級不明の単語帳は中立扱い。 */
export function scoreSharedBookForHome(
  row: { sharedTags: string[]; likeCount: number; createdAt: string | null },
  userEikenLevel: string | null,
  nowMs: number,
): number {
  const { level } = eikenLevelFromTags(row.sharedTags);
  const distance = eikenDistance(userEikenLevel, level);
  const levelFit = distance === null ? 0.35 : 1 - Math.min(distance, 3) / 3;
  const popularity = Math.min(1, Math.log10(Math.max(0, row.likeCount) + 1) / 2);
  const created = row.createdAt ? Date.parse(row.createdAt) : Number.NaN;
  const recency = Number.isNaN(created)
    ? 0
    : Math.exp(-Math.max(0, nowMs - created) / (14 * 86_400_000));
  return 3 * levelFit + popularity + 0.5 * recency;
}

async function fetchImportedShareIds(
  admin: SupabaseAdminClient,
  userId: string,
): Promise<Set<string>> {
  const { data, error } = await admin
    .from('projects')
    .select('imported_from_share_id')
    .eq('user_id', userId)
    .not('imported_from_share_id', 'is', null);
  if (error) {
    // Dedup against imports is best-effort; never break the home preview.
    return new Set();
  }
  return new Set(
    ((data ?? []) as { imported_from_share_id: string | null }[])
      .map((row) => row.imported_from_share_id)
      .filter((value): value is string => Boolean(value)),
  );
}

async function buildBookRecommendations(
  admin: SupabaseAdminClient,
  userId: string,
  eikenLevel: string | null,
  limit: number,
): Promise<HomeRecommendedBook[]> {
  if (limit <= 0) return [];

  const [{ data, error }, importedShareIds] = await Promise.all([
    admin
      .from('shared_wordbooks')
      .select('id,share_id,user_id,title,icon_image,shared_tags,word_count,like_count,created_at')
      .gt('word_count', 0)
      .neq('user_id', userId)
      .order('like_count', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(BOOK_CANDIDATE_POOL),
    fetchImportedShareIds(admin, userId),
  ]);
  if (error) throw new Error(error.message || 'home_recommended_books_failed');

  const nowMs = Date.now();
  return ((data ?? []) as HomeSharedBookRow[])
    .filter((row) => !importedShareIds.has(row.share_id))
    .map((row) => {
      const sharedTags = toStringArray(row.shared_tags);
      return {
        row,
        sharedTags,
        score: scoreSharedBookForHome(
          { sharedTags, likeCount: Number(row.like_count ?? 0), createdAt: row.created_at },
          eikenLevel,
          nowMs,
        ),
      };
    })
    .sort((a, b) => b.score - a.score || a.row.id.localeCompare(b.row.id))
    .slice(0, limit)
    .map(({ row, sharedTags }) => ({
      shareId: row.share_id,
      title: row.title,
      iconImage: row.icon_image,
      wordCount: Number(row.word_count ?? 0),
      likeCount: Number(row.like_count ?? 0),
      eikenLevelTag: eikenLevelFromTags(sharedTags).tag,
    }));
}

// ---------- reel preview (語源がある単語限定) ----------

type SharedPreviewWordRow = {
  id: string;
  shared_wordbook_id: string;
  english: string;
  japanese: string;
  pronunciation: string | null;
};

type OfficialPreviewBookRow = {
  id: string;
  official_slug: string | null;
  official_title: string | null;
  title: string;
  icon_image: string | null;
  official_eiken_level: string | null;
  created_at: string | null;
};

type OfficialPreviewWordRow = {
  id: string;
  project_id: string;
  english: string;
  japanese: string | null;
  pronunciation: string | null;
  lexicon_entries: { cefr_level: string | null } | { cefr_level: string | null }[] | null;
};

function firstOrNull<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function previewCandidate(options: {
  source: 'shared' | 'official';
  wordId: string;
  english: string;
  japanese: string;
  pronunciation: string | null;
  cefrLevel: string | null;
  book: ReelBook;
}): ReelCandidate {
  return {
    id: `${options.source === 'shared' ? 's' : 'o'}:${options.wordId}`,
    source: options.source,
    wordId: options.wordId,
    english: options.english,
    pronunciation: options.pronunciation,
    japanese: options.japanese,
    exampleSentence: null,
    exampleSentenceJa: null,
    partOfSpeechTags: [],
    cefrLevel: options.cefrLevel,
    book: options.book,
  };
}

async function fetchSharedPreviewCandidates(admin: SupabaseAdminClient): Promise<ReelCandidate[]> {
  const { data: bookRows, error: bookError } = await admin
    .from('shared_wordbooks')
    .select('id,share_id,user_id,title,icon_image,shared_tags,word_count,like_count,created_at')
    .gt('word_count', 0)
    .order('like_count', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(REEL_SHARED_BOOK_POOL);
  if (bookError) throw new Error(bookError.message || 'home_reel_shared_books_failed');

  const books = (bookRows ?? []) as HomeSharedBookRow[];
  if (books.length === 0) return [];

  const { data: wordRows, error: wordsError } = await admin
    .from('shared_wordbook_words')
    .select('id,shared_wordbook_id,english,japanese,pronunciation')
    .in('shared_wordbook_id', books.map((book) => book.id))
    .order('position', { ascending: true })
    .limit(REEL_WORDS_FETCH_LIMIT);
  if (wordsError) throw new Error(wordsError.message || 'home_reel_shared_words_failed');

  const bookById = new Map(books.map((book) => [book.id, book]));
  const countByBook = new Map<string, number>();
  const candidates: ReelCandidate[] = [];

  for (const row of (wordRows ?? []) as SharedPreviewWordRow[]) {
    const bookRow = bookById.get(row.shared_wordbook_id);
    if (!bookRow) continue;
    if (!row.english?.trim() || !row.japanese?.trim()) continue;
    const used = countByBook.get(bookRow.id) ?? 0;
    if (used >= REEL_WORDS_PER_BOOK) continue;
    countByBook.set(bookRow.id, used + 1);

    const sharedTags = toStringArray(bookRow.shared_tags);
    candidates.push(previewCandidate({
      source: 'shared',
      wordId: row.id,
      english: row.english,
      japanese: row.japanese,
      pronunciation: row.pronunciation,
      cefrLevel: null,
      book: {
        type: 'shared',
        id: bookRow.id,
        title: bookRow.title,
        iconImage: bookRow.icon_image,
        shareId: bookRow.share_id,
        sharedTags,
        // 共有単語帳の級は公開時に付く英検タグから読む（ランキングの levelFit 用）
        eikenLevel: eikenLevelFromTags(sharedTags).level,
        ownerName: null,
        wordCount: Number(bookRow.word_count ?? 0),
        likeCount: Number(bookRow.like_count ?? 0),
        createdAt: bookRow.created_at,
        importedByMe: false,
      },
    }));
  }

  return candidates;
}

async function fetchOfficialPreviewCandidates(
  admin: SupabaseAdminClient,
  eikenLevel: string | null,
): Promise<ReelCandidate[]> {
  let bookQuery = admin
    .from('projects')
    .select('id,official_slug,official_title,title,icon_image,official_eiken_level,created_at')
    .eq('official_is_active', true)
    .order('official_sort_order', { ascending: true })
    .limit(REEL_OFFICIAL_BOOK_POOL);

  const levels = eikenLevelsAround(eikenLevel, 1);
  if (levels.length > 0) {
    bookQuery = bookQuery.in('official_eiken_level', levels);
  }

  const { data: bookRows, error: bookError } = await bookQuery;
  if (bookError) {
    // official_* columns may not exist in older environments; degrade gracefully.
    return [];
  }

  const books = ((bookRows ?? []) as OfficialPreviewBookRow[]).filter((book) => book.official_slug);
  if (books.length === 0) return [];

  const { data: wordRows, error: wordsError } = await admin
    .from('words')
    .select('id,project_id,english,japanese,pronunciation,lexicon_entries(cefr_level)')
    .in('project_id', books.map((book) => book.id))
    .order('project_id', { ascending: true })
    .order('created_at', { ascending: true })
    .limit(REEL_WORDS_FETCH_LIMIT);
  if (wordsError) throw new Error(wordsError.message || 'home_reel_official_words_failed');

  const bookById = new Map(books.map((book) => [book.id, book]));
  const countByBook = new Map<string, number>();
  const candidates: ReelCandidate[] = [];

  for (const row of (wordRows ?? []) as unknown as OfficialPreviewWordRow[]) {
    const bookRow = bookById.get(row.project_id);
    if (!bookRow) continue;
    if (!row.english?.trim() || !row.japanese?.trim()) continue;
    const used = countByBook.get(bookRow.id) ?? 0;
    if (used >= REEL_WORDS_PER_BOOK) continue;
    countByBook.set(bookRow.id, used + 1);

    candidates.push(previewCandidate({
      source: 'official',
      wordId: row.id,
      english: row.english,
      japanese: row.japanese ?? '',
      pronunciation: row.pronunciation,
      cefrLevel: firstOrNull(row.lexicon_entries)?.cefr_level ?? null,
      book: {
        type: 'official',
        id: bookRow.id,
        title: bookRow.official_title || bookRow.title,
        iconImage: bookRow.icon_image,
        officialSlug: bookRow.official_slug ?? undefined,
        sharedTags: [],
        eikenLevel: bookRow.official_eiken_level,
        ownerName: null,
        wordCount: 0,
        likeCount: 0,
        createdAt: bookRow.created_at,
        importedByMe: false,
      },
    }));
  }

  return candidates;
}

async function buildReelPreview(
  admin: SupabaseAdminClient,
  eikenLevel: string | null,
  limit: number,
): Promise<HomeReelPreviewItem[]> {
  if (limit <= 0) return [];

  const [sharedCandidates, officialCandidates] = await Promise.all([
    fetchSharedPreviewCandidates(admin),
    fetchOfficialPreviewCandidates(admin, eikenLevel),
  ]);

  // 同じ見出し語が複数の単語帳から来たら1つに絞る（公式優先ではなく先勝ち）。
  const byHeadword = new Map<string, ReelCandidate>();
  for (const candidate of [...officialCandidates, ...sharedCandidates]) {
    const headword = normalizeHeadword(candidate.english);
    if (!headword || byHeadword.has(headword)) continue;
    byHeadword.set(headword, candidate);
  }
  if (byHeadword.size === 0) return [];

  const headwords = Array.from(byHeadword.keys());

  // ホームのリールは語源がある単語限定：lexicon キャッシュにヒットし、
  // かつ実際に分解式を持つものだけを残す（生成はしない）。
  const morphologyByHeadword = await getCachedMorphologyByHeadword(headwords, {
    supabaseAdmin: admin,
  });

  let cefrByHeadword: ReadonlyMap<string, string> = new Map();
  try {
    cefrByHeadword = await lookupLexiconCefrLevels(headwords, { supabaseAdmin: admin });
  } catch {
    // CEFR はランキング精度向上のためだけの情報。失敗しても配信は続ける。
  }

  const withMorphology: ReelCandidate[] = [];
  for (const [headword, candidate] of byHeadword) {
    const morphology = morphologyByHeadword.get(headword);
    if (!morphology || morphology.none || morphology.formula.length === 0) continue;
    withMorphology.push({
      ...candidate,
      cefrLevel: candidate.cefrLevel ?? cefrByHeadword.get(headword) ?? null,
      morphology,
    });
  }
  if (withMorphology.length === 0) return [];

  const seed = Math.floor(Math.random() * 0xffffffff);
  const picked = rankReelCandidates(
    withMorphology,
    { eikenLevel, interestTags: [], now: new Date().toISOString() },
    seed,
    limit,
  );

  return picked.flatMap((candidate) => {
    if (!candidate.morphology || candidate.morphology.none) return [];
    return [{
      id: candidate.id,
      source: candidate.source,
      english: candidate.english,
      japanese: candidate.japanese,
      pronunciation: candidate.pronunciation,
      morphology: candidate.morphology,
      bookTitle: candidate.book.title,
    }];
  });
}

// ---------- entry point ----------

export function clampHomeLimit(raw: string | null, fallback: number, max: number): number {
  const parsed = Number(raw);
  if (raw === null || raw.trim() === '' || !Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.min(max, Math.floor(parsed)));
}

export async function buildHomeRecommendations(options: {
  userId: string;
  booksLimit: number;
  reelsLimit: number;
  admin?: SupabaseAdminClient;
}): Promise<HomeRecommendationsPayload> {
  const admin = options.admin ?? getSupabaseAdmin();

  const { data: profile } = await admin
    .from('profiles')
    .select('eiken_level')
    .eq('user_id', options.userId)
    .maybeSingle<{ eiken_level: string | null }>();
  const eikenLevel = profile?.eiken_level ?? null;

  const [books, reels] = await Promise.all([
    buildBookRecommendations(admin, options.userId, eikenLevel, options.booksLimit),
    buildReelPreview(admin, eikenLevel, options.reelsLimit),
  ]);

  return { books, reels };
}
