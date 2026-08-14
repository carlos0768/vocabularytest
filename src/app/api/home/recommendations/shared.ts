import { getSupabaseAdmin } from '@/lib/supabase/admin';
import {
  EIKEN_TO_CEFR_BAND,
  cefrDistance,
  eikenDistance,
  type CefrLevel,
} from '@/lib/reels/eiken-cefr';
import { lookupLexiconCefrLevels } from '@/lib/lexicon/eiken-cefr-filter';
import { EIKEN_LEVEL_TAG_LABELS } from '@/lib/shared-projects/eiken-level-tag';
import type {
  HomeRecommendedBook,
  HomeRecommendationsPayload,
} from '@/lib/home/recommendations-types';
import { normalizeHeadword } from '../../../../../shared/lexicon';

type SupabaseAdminClient = ReturnType<typeof getSupabaseAdmin>;

export const HOME_BOOKS_DEFAULT_LIMIT = 6;
export const HOME_BOOKS_MAX_LIMIT = 12;

// Pool sizes: the home preview is fetched on (almost) every home visit, so
// these stay far smaller than the full reel feed's pools.
const BOOK_CANDIDATE_POOL = 60;
// CEFR フィットを実測する単語帳数と、1冊あたりのサンプル語数。
const BOOK_CEFR_SCORED_POOL = 24;
const BOOK_CEFR_WORDS_PER_BOOK = 40;
const BOOK_CEFR_WORDS_FETCH_LIMIT = 1200;

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

/**
 * 級の近さ > 人気 > 新しさ の順に効くスコア。級不明の単語帳は中立扱い。
 * levelFit は「単語帳内の単語の CEFR × ユーザーの志望英検級」から実測した
 * 値（cefrLevelFit）があればそれを優先し、無ければ英検タグから推定する。
 */
export function scoreSharedBookForHome(
  row: { sharedTags: string[]; likeCount: number; createdAt: string | null },
  userEikenLevel: string | null,
  nowMs: number,
  cefrLevelFit: number | null = null,
): number {
  const { level } = eikenLevelFromTags(row.sharedTags);
  const distance = eikenDistance(userEikenLevel, level);
  const tagLevelFit = distance === null ? 0.35 : 1 - Math.min(distance, 3) / 3;
  const levelFit = cefrLevelFit ?? tagLevelFit;
  const popularity = Math.min(1, Math.log10(Math.max(0, row.likeCount) + 1) / 2);
  const created = row.createdAt ? Date.parse(row.createdAt) : Number.NaN;
  const recency = Number.isNaN(created)
    ? 0
    : Math.exp(-Math.max(0, nowMs - created) / (14 * 86_400_000));
  return 3 * levelFit + popularity + 0.5 * recency;
}

/**
 * 単語帳内のサンプル語の CEFR とユーザーの志望英検級（の CEFR バンド）を比較し、
 * 0〜1 のフィット値を返す。CEFR が引けた語の割合（coverage）が低い場合は
 * 信頼できないので null（呼び出し側でタグ推定にフォールバック）。
 */
export function cefrFitForBand(
  band: readonly CefrLevel[],
  wordCefrLevels: readonly (string | null)[],
): number | null {
  if (band.length === 0 || wordCefrLevels.length === 0) return null;

  let known = 0;
  let sum = 0;
  for (const level of wordCefrLevels) {
    const distance = cefrDistance([...band], level);
    if (distance === null) continue;
    known += 1;
    sum += Math.max(0, 1 - distance / 3);
  }

  // CEFR が引けた語が3割未満なら実測値としては採用しない。
  if (known === 0 || known / wordCefrLevels.length < 0.3) return null;
  return sum / known;
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

/**
 * 上位候補の単語帳について、サンプル語の CEFR（lexicon 由来）を単語帳ごとに集める。
 * best-effort — 失敗しても空 Map を返し、タグ推定にフォールバックさせる。
 */
async function fetchBookCefrLevels(
  admin: SupabaseAdminClient,
  bookIds: readonly string[],
): Promise<Map<string, (string | null)[]>> {
  const result = new Map<string, (string | null)[]>();
  if (bookIds.length === 0) return result;

  try {
    const { data, error } = await admin
      .from('shared_wordbook_words')
      .select('shared_wordbook_id,english')
      .in('shared_wordbook_id', bookIds as string[])
      .order('position', { ascending: true })
      .limit(BOOK_CEFR_WORDS_FETCH_LIMIT);
    if (error) return result;

    const sampled: { bookId: string; headword: string }[] = [];
    const countByBook = new Map<string, number>();
    for (const row of (data ?? []) as { shared_wordbook_id: string; english: string | null }[]) {
      const headword = normalizeHeadword(row.english ?? '');
      if (!headword) continue;
      const used = countByBook.get(row.shared_wordbook_id) ?? 0;
      if (used >= BOOK_CEFR_WORDS_PER_BOOK) continue;
      countByBook.set(row.shared_wordbook_id, used + 1);
      sampled.push({ bookId: row.shared_wordbook_id, headword });
    }
    if (sampled.length === 0) return result;

    const cefrByHeadword = await lookupLexiconCefrLevels(
      Array.from(new Set(sampled.map((item) => item.headword))),
      { supabaseAdmin: admin },
    );
    for (const { bookId, headword } of sampled) {
      const levels = result.get(bookId) ?? [];
      levels.push(cefrByHeadword.get(headword) ?? null);
      result.set(bookId, levels);
    }
    return result;
  } catch {
    return result;
  }
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
  const candidates = ((data ?? []) as HomeSharedBookRow[])
    .filter((row) => !importedShareIds.has(row.share_id))
    .map((row) => {
      const sharedTags = toStringArray(row.shared_tags);
      return {
        row,
        sharedTags,
        // タグ・人気・新しさによる一次スコア（CEFR 実測前の粗い並び）。
        score: scoreSharedBookForHome(
          { sharedTags, likeCount: Number(row.like_count ?? 0), createdAt: row.created_at },
          eikenLevel,
          nowMs,
        ),
      };
    })
    .sort((a, b) => b.score - a.score || a.row.id.localeCompare(b.row.id));

  // 志望英検級があるユーザーは、上位候補について単語帳内の単語の CEFR を実測し、
  // 級の CEFR バンドとのフィットでスコアを付け直す（タグだけの推定より正確）。
  const band = eikenLevel ? EIKEN_TO_CEFR_BAND[eikenLevel] ?? [] : [];
  if (band.length > 0 && candidates.length > 0) {
    const scoredPool = candidates.slice(0, BOOK_CEFR_SCORED_POOL);
    const cefrByBook = await fetchBookCefrLevels(
      admin,
      scoredPool.map((candidate) => candidate.row.id),
    );
    for (const candidate of scoredPool) {
      const cefrLevelFit = cefrFitForBand(band, cefrByBook.get(candidate.row.id) ?? []);
      candidate.score = scoreSharedBookForHome(
        {
          sharedTags: candidate.sharedTags,
          likeCount: Number(candidate.row.like_count ?? 0),
          createdAt: candidate.row.created_at,
        },
        eikenLevel,
        nowMs,
        cefrLevelFit,
      );
    }
    candidates.sort((a, b) => b.score - a.score || a.row.id.localeCompare(b.row.id));
  }

  return candidates
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

// ---------- entry point ----------

export function clampHomeLimit(raw: string | null, fallback: number, max: number): number {
  const parsed = Number(raw);
  if (raw === null || raw.trim() === '' || !Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.min(max, Math.floor(parsed)));
}

export async function buildHomeRecommendations(options: {
  userId: string;
  booksLimit: number;
  admin?: SupabaseAdminClient;
}): Promise<HomeRecommendationsPayload> {
  const admin = options.admin ?? getSupabaseAdmin();

  const { data: profile } = await admin
    .from('profiles')
    .select('eiken_level')
    .eq('user_id', options.userId)
    .maybeSingle<{ eiken_level: string | null }>();
  const eikenLevel = profile?.eiken_level ?? null;

  const books = await buildBookRecommendations(admin, options.userId, eikenLevel, options.booksLimit);

  return { books };
}
