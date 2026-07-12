import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import type {
  ReelBook,
  ReelCandidate,
  ReelComment,
  ReelFeedback,
  ReelFeedPage,
  ReelItem,
  ReelSource,
} from '@/lib/reels/types';
import { decodeReelCursor, encodeReelCursor } from '@/lib/reels/cursor';
import { eikenLevelsAround } from '@/lib/reels/eiken-cefr';
import { selectReelCandidates } from '@/lib/reels/ranking';
import {
  sampleBookWords,
  sharedCefrLookupHeadwords,
  withSharedCefrLevels,
} from '@/lib/reels/sampling';
import { lookupLexiconCefrLevels } from '@/lib/lexicon/eiken-cefr-filter';
import { createSharedSearchEmbedding } from '@/lib/shared-projects/tag-embeddings';
import { getCachedMorphologyByHeadword } from '@/lib/morphology/lexicon';
import { normalizeHeadword } from '../../../../shared/lexicon';

type SupabaseAdminClient = ReturnType<typeof getSupabaseAdmin>;

export const REEL_FEED_DEFAULT_LIMIT = 8;
export const REEL_FEED_MAX_LIMIT = 12;

// Pool sizes: fetch deep so the per-page sampler has material to rotate
// through. The long-term fix for even deeper books is a DB-side per-book
// sampling RPC (needs a migration); until then these limits bound payload.
const SHARED_POPULAR_BOOK_COUNT = 40;
const SHARED_RECENT_BOOK_COUNT = 15;
const SHARED_WORDS_PER_BOOK = 8;
const SHARED_WORDS_FETCH_LIMIT = 1500;
const OFFICIAL_WORDS_PER_BOOK = 12;
const OFFICIAL_WORDS_FETCH_LIMIT = 1000;
const SEEN_WINDOW_DAYS = 7;
const SEEN_FETCH_LIMIT = 3000;

// ---------- row shapes ----------

type SharedBookRow = {
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

type SharedWordRow = {
  id: string;
  shared_wordbook_id: string;
  english: string;
  japanese: string;
  pronunciation: string | null;
  example_sentence: string | null;
  example_sentence_ja: string | null;
  part_of_speech_tags: unknown;
};

type OfficialProjectRow = {
  id: string;
  official_slug: string | null;
  official_title: string | null;
  title: string;
  icon_image: string | null;
  official_eiken_level: string | null;
  created_at: string | null;
};

type OfficialWordRow = {
  id: string;
  project_id: string;
  english: string;
  japanese: string | null;
  pronunciation: string | null;
  example_sentence: string | null;
  example_sentence_ja: string | null;
  part_of_speech_tags: unknown;
  lexicon_entries: { cefr_level: string | null } | { cefr_level: string | null }[] | null;
};

// ---------- small helpers ----------

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.trim() !== '');
}

function firstOrNull<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export function reelItemKey(source: ReelSource, wordId: string): string {
  return `${source === 'shared' ? 's' : 'o'}:${wordId}`;
}

// ---------- candidate fetchers ----------

/** Per-request sampling context so each page surfaces different words. */
type CandidateSampling = {
  seed: number;
  seenKeys: ReadonlySet<string>;
  excludedKeys: ReadonlySet<string>;
};

async function fetchSharedCandidates(
  admin: SupabaseAdminClient,
  sampling: CandidateSampling,
): Promise<ReelCandidate[]> {
  const bookSelect = 'id,share_id,user_id,title,icon_image,shared_tags,word_count,like_count,created_at';

  const [popularResult, recentResult] = await Promise.all([
    admin
      .from('shared_wordbooks')
      .select(bookSelect)
      .gt('word_count', 0)
      .order('like_count', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(SHARED_POPULAR_BOOK_COUNT),
    admin
      .from('shared_wordbooks')
      .select(bookSelect)
      .gt('word_count', 0)
      .order('created_at', { ascending: false })
      .limit(SHARED_RECENT_BOOK_COUNT),
  ]);

  if (popularResult.error) throw new Error(popularResult.error.message || 'reel_shared_books_failed');
  if (recentResult.error) throw new Error(recentResult.error.message || 'reel_shared_books_failed');

  const bookById = new Map<string, SharedBookRow>();
  for (const row of [...(popularResult.data ?? []), ...(recentResult.data ?? [])] as SharedBookRow[]) {
    bookById.set(row.id, row);
  }
  if (bookById.size === 0) return [];

  const { data: wordRows, error: wordsError } = await admin
    .from('shared_wordbook_words')
    .select('id,shared_wordbook_id,english,japanese,pronunciation,example_sentence,example_sentence_ja,part_of_speech_tags')
    .in('shared_wordbook_id', Array.from(bookById.keys()))
    .order('position', { ascending: true })
    .limit(SHARED_WORDS_FETCH_LIMIT);

  if (wordsError) throw new Error(wordsError.message || 'reel_shared_words_failed');

  const ownerIds = Array.from(new Set(Array.from(bookById.values()).map((book) => book.user_id)));
  const ownerNameById = new Map<string, string | null>();
  if (ownerIds.length > 0) {
    try {
      const { data: profileRows } = await admin
        .from('profiles')
        .select('user_id, display_name, username')
        .in('user_id', ownerIds);
      for (const row of profileRows ?? []) {
        ownerNameById.set(
          row.user_id as string,
          (row.display_name as string | null) ?? (row.username as string | null) ?? null,
        );
      }
    } catch {
      // profiles lookup is best-effort; degrade to anonymous.
    }
  }

  const wordsByBook = new Map<string, SharedWordRow[]>();
  for (const row of (wordRows ?? []) as SharedWordRow[]) {
    const list = wordsByBook.get(row.shared_wordbook_id) ?? [];
    list.push(row);
    wordsByBook.set(row.shared_wordbook_id, list);
  }

  const candidates: ReelCandidate[] = [];
  for (const [bookId, words] of wordsByBook) {
    const bookRow = bookById.get(bookId);
    if (!bookRow) continue;
    const book: ReelBook = {
      type: 'shared',
      id: bookRow.id,
      title: bookRow.title,
      iconImage: bookRow.icon_image,
      shareId: bookRow.share_id,
      sharedTags: toStringArray(bookRow.shared_tags),
      eikenLevel: null,
      ownerName: ownerNameById.get(bookRow.user_id) ?? null,
      wordCount: Number(bookRow.word_count ?? 0),
      likeCount: Number(bookRow.like_count ?? 0),
      createdAt: bookRow.created_at,
      importedByMe: false,
    };
    const validWords = words.filter((word) => word.english?.trim() && word.japanese?.trim());
    const sampled = sampleBookWords(
      validWords,
      SHARED_WORDS_PER_BOOK,
      (word) => reelItemKey('shared', word.id),
      { ...sampling, bookId },
    );
    for (const word of sampled) {
      candidates.push({
        id: reelItemKey('shared', word.id),
        source: 'shared',
        wordId: word.id,
        english: word.english,
        pronunciation: word.pronunciation,
        japanese: word.japanese,
        exampleSentence: word.example_sentence,
        exampleSentenceJa: word.example_sentence_ja,
        partOfSpeechTags: toStringArray(word.part_of_speech_tags),
        cefrLevel: null,
        book,
      });
    }
  }

  return candidates;
}

async function fetchOfficialCandidates(
  admin: SupabaseAdminClient,
  eikenLevel: string | null,
  sampling: CandidateSampling,
): Promise<ReelCandidate[]> {
  let bookQuery = admin
    .from('projects')
    .select('id,official_slug,official_title,title,icon_image,official_eiken_level,created_at')
    .eq('official_is_active', true)
    .order('official_sort_order', { ascending: true })
    .limit(20);

  const levels = eikenLevelsAround(eikenLevel, 1);
  if (levels.length > 0) {
    bookQuery = bookQuery.in('official_eiken_level', levels);
  }

  const { data: bookRows, error: bookError } = await bookQuery;
  if (bookError) {
    // official_* columns may not exist in older environments; degrade gracefully.
    return [];
  }

  const books = (bookRows ?? []) as OfficialProjectRow[];
  if (books.length === 0) return [];

  const { data: wordRows, error: wordsError } = await admin
    .from('words')
    .select('id,project_id,english,japanese,pronunciation,example_sentence,example_sentence_ja,part_of_speech_tags,lexicon_entries(cefr_level)')
    .in('project_id', books.map((book) => book.id))
    // Deterministic ordering so which rows fall under the limit is stable.
    .order('project_id', { ascending: true })
    .order('created_at', { ascending: true })
    .limit(OFFICIAL_WORDS_FETCH_LIMIT);

  if (wordsError) throw new Error(wordsError.message || 'reel_official_words_failed');

  const bookById = new Map(books.map((book) => [book.id, book]));
  const wordsByBook = new Map<string, OfficialWordRow[]>();
  for (const row of (wordRows ?? []) as unknown as OfficialWordRow[]) {
    const list = wordsByBook.get(row.project_id) ?? [];
    list.push(row);
    wordsByBook.set(row.project_id, list);
  }

  const candidates: ReelCandidate[] = [];
  for (const [projectId, words] of wordsByBook) {
    const bookRow = bookById.get(projectId);
    if (!bookRow || !bookRow.official_slug) continue;
    const book: ReelBook = {
      type: 'official',
      id: bookRow.id,
      title: bookRow.official_title || bookRow.title,
      iconImage: bookRow.icon_image,
      officialSlug: bookRow.official_slug,
      sharedTags: [],
      eikenLevel: bookRow.official_eiken_level,
      ownerName: null,
      wordCount: words.length,
      likeCount: 0,
      createdAt: bookRow.created_at,
      importedByMe: false,
    };
    const validWords = words.filter((word) => word.english?.trim() && word.japanese?.trim());
    const sampled = sampleBookWords(
      validWords,
      OFFICIAL_WORDS_PER_BOOK,
      (word) => reelItemKey('official', word.id),
      { ...sampling, bookId: projectId },
    );
    for (const word of sampled) {
      candidates.push({
        id: reelItemKey('official', word.id),
        source: 'official',
        wordId: word.id,
        english: word.english,
        pronunciation: word.pronunciation,
        japanese: word.japanese ?? '',
        exampleSentence: word.example_sentence,
        exampleSentenceJa: word.example_sentence_ja,
        partOfSpeechTags: toStringArray(word.part_of_speech_tags),
        cefrLevel: firstOrNull(word.lexicon_entries)?.cefr_level ?? null,
        book,
      });
    }
  }

  return candidates;
}

// ---------- personalization context ----------

async function fetchRankingInputs(admin: SupabaseAdminClient, userId: string): Promise<{
  eikenLevel: string | null;
  interestTags: string[];
}> {
  const [profileResult, preferencesResult, ownBooksResult] = await Promise.all([
    admin.from('profiles').select('eiken_level').eq('user_id', userId).maybeSingle<{ eiken_level: string | null }>(),
    admin.from('user_preferences').select('example_genres').eq('user_id', userId).maybeSingle<{ example_genres: unknown }>(),
    admin.from('shared_wordbooks').select('shared_tags').eq('user_id', userId).limit(20),
  ]);

  const eikenLevel = profileResult.data?.eiken_level ?? null;
  const interestTags = new Set<string>();
  for (const genre of toStringArray(preferencesResult.data?.example_genres)) {
    interestTags.add(genre.toLowerCase());
  }
  for (const row of ownBooksResult.data ?? []) {
    for (const tag of toStringArray((row as { shared_tags: unknown }).shared_tags)) {
      interestTags.add(tag.toLowerCase());
    }
  }

  return { eikenLevel, interestTags: Array.from(interestTags) };
}

/** item_key -> seen_at for words seen within the freshness window. */
async function fetchSeenAtByKey(
  admin: SupabaseAdminClient,
  userId: string,
): Promise<Record<string, string>> {
  const since = new Date(Date.now() - SEEN_WINDOW_DAYS * 86_400_000).toISOString();
  const { data, error } = await admin
    .from('reel_seen_words')
    .select('item_key,seen_at')
    .eq('user_id', userId)
    .gte('seen_at', since)
    .order('seen_at', { ascending: false })
    .limit(SEEN_FETCH_LIMIT);

  if (error) {
    // Dedup is best-effort; an error here must not break the feed.
    return {};
  }
  const result: Record<string, string> = {};
  for (const row of (data ?? []) as { item_key: string; seen_at: string }[]) {
    result[row.item_key] = row.seen_at;
  }
  return result;
}

type UserFeedbackSummary = {
  /** word item keys the user marked not-interested (permanently excluded) */
  excludedKeys: Set<string>;
  interestedBookRefs: string[];
  notInterestedBookCounts: Record<string, number>;
};

async function fetchUserFeedback(
  admin: SupabaseAdminClient,
  userId: string,
): Promise<UserFeedbackSummary> {
  const empty: UserFeedbackSummary = {
    excludedKeys: new Set(),
    interestedBookRefs: [],
    notInterestedBookCounts: {},
  };
  const { data, error } = await admin
    .from('reel_word_feedback')
    .select('shared_word_id,official_word_id,book_ref,feedback')
    .eq('user_id', userId)
    .limit(2000);

  if (error) {
    // Feedback is best-effort personalization; never break the feed on it.
    return empty;
  }

  const interested = new Set<string>();
  for (const row of (data ?? []) as {
    shared_word_id: string | null;
    official_word_id: string | null;
    book_ref: string;
    feedback: string;
  }[]) {
    if (row.feedback === 'not_interested') {
      if (row.shared_word_id) empty.excludedKeys.add(reelItemKey('shared', row.shared_word_id));
      if (row.official_word_id) empty.excludedKeys.add(reelItemKey('official', row.official_word_id));
      empty.notInterestedBookCounts[row.book_ref] =
        (empty.notInterestedBookCounts[row.book_ref] ?? 0) + 1;
    } else if (row.feedback === 'interested') {
      interested.add(row.book_ref);
    }
  }
  empty.interestedBookRefs = Array.from(interested);
  return empty;
}

async function fetchTagSimilarity(
  admin: SupabaseAdminClient,
  interestTags: string[],
): Promise<Record<string, number>> {
  if (interestTags.length === 0) return {};
  try {
    const embedding = await createSharedSearchEmbedding(interestTags.join('、'));
    if (!embedding) return {};
    const { data, error } = await admin.rpc('match_shared_wordbooks_by_tag_embedding', {
      query_embedding: embedding,
      match_threshold: 0.2,
      match_count: 60,
    });
    if (error) return {};
    const result: Record<string, number> = {};
    for (const row of (data ?? []) as { id: string; similarity: number }[]) {
      result[row.id] = Number(row.similarity) || 0;
    }
    return result;
  } catch {
    // No OpenAI key / RPC missing → fall back to string tag overlap.
    return {};
  }
}

// ---------- enrichment ----------

async function enrichItems(
  admin: SupabaseAdminClient,
  userId: string,
  candidates: ReelCandidate[],
): Promise<ReelItem[]> {
  if (candidates.length === 0) return [];

  const sharedWordIds = candidates.filter((c) => c.source === 'shared').map((c) => c.wordId);
  const officialWordIds = candidates.filter((c) => c.source === 'official').map((c) => c.wordId);
  const shareIds = Array.from(
    new Set(candidates.map((c) => c.book.shareId).filter((v): v is string => Boolean(v))),
  );
  const officialSlugs = Array.from(
    new Set(candidates.map((c) => c.book.officialSlug).filter((v): v is string => Boolean(v))),
  );

  const [sharedLikes, officialLikes, sharedComments, officialComments, importedProjects] = await Promise.all([
    sharedWordIds.length > 0
      ? admin.from('reel_word_likes').select('shared_word_id,user_id').in('shared_word_id', sharedWordIds)
      : Promise.resolve({ data: [], error: null }),
    officialWordIds.length > 0
      ? admin.from('reel_word_likes').select('official_word_id,user_id').in('official_word_id', officialWordIds)
      : Promise.resolve({ data: [], error: null }),
    sharedWordIds.length > 0
      ? admin.from('reel_word_comments').select('shared_word_id').in('shared_word_id', sharedWordIds)
      : Promise.resolve({ data: [], error: null }),
    officialWordIds.length > 0
      ? admin.from('reel_word_comments').select('official_word_id').in('official_word_id', officialWordIds)
      : Promise.resolve({ data: [], error: null }),
    shareIds.length > 0 || officialSlugs.length > 0
      ? admin
          .from('projects')
          .select('imported_from_share_id,imported_from_official_slug')
          .eq('user_id', userId)
          .or(
            [
              shareIds.length > 0 ? `imported_from_share_id.in.(${shareIds.join(',')})` : null,
              officialSlugs.length > 0 ? `imported_from_official_slug.in.(${officialSlugs.join(',')})` : null,
            ]
              .filter(Boolean)
              .join(','),
          )
      : Promise.resolve({ data: [], error: null }),
  ]);

  const likeCountByKey = new Map<string, number>();
  const likedByMeKeys = new Set<string>();
  for (const row of (sharedLikes.data ?? []) as { shared_word_id: string; user_id: string }[]) {
    const key = reelItemKey('shared', row.shared_word_id);
    likeCountByKey.set(key, (likeCountByKey.get(key) ?? 0) + 1);
    if (row.user_id === userId) likedByMeKeys.add(key);
  }
  for (const row of (officialLikes.data ?? []) as { official_word_id: string; user_id: string }[]) {
    const key = reelItemKey('official', row.official_word_id);
    likeCountByKey.set(key, (likeCountByKey.get(key) ?? 0) + 1);
    if (row.user_id === userId) likedByMeKeys.add(key);
  }

  const commentCountByKey = new Map<string, number>();
  for (const row of (sharedComments.data ?? []) as { shared_word_id: string }[]) {
    const key = reelItemKey('shared', row.shared_word_id);
    commentCountByKey.set(key, (commentCountByKey.get(key) ?? 0) + 1);
  }
  for (const row of (officialComments.data ?? []) as { official_word_id: string }[]) {
    const key = reelItemKey('official', row.official_word_id);
    commentCountByKey.set(key, (commentCountByKey.get(key) ?? 0) + 1);
  }

  const importedShareIds = new Set<string>();
  const importedOfficialSlugs = new Set<string>();
  for (const row of (importedProjects.data ?? []) as {
    imported_from_share_id: string | null;
    imported_from_official_slug: string | null;
  }[]) {
    if (row.imported_from_share_id) importedShareIds.add(row.imported_from_share_id);
    if (row.imported_from_official_slug) importedOfficialSlugs.add(row.imported_from_official_slug);
  }

  return candidates.map((candidate) => ({
    ...candidate,
    likeCount: likeCountByKey.get(candidate.id) ?? 0,
    likedByMe: likedByMeKeys.has(candidate.id),
    commentCount: commentCountByKey.get(candidate.id) ?? 0,
    book: {
      ...candidate.book,
      importedByMe:
        (candidate.book.shareId ? importedShareIds.has(candidate.book.shareId) : false) ||
        (candidate.book.officialSlug ? importedOfficialSlugs.has(candidate.book.officialSlug) : false),
    },
  }));
}

// ---------- feed ----------

type ReelUsageRpcResult = {
  granted: number;
  current_count: number;
  limit: number | null;
  is_pro: boolean;
};

export async function buildReelFeedPage(options: {
  userId: string;
  /** request-scoped client — the RPC must run with the user's auth context */
  userClient: SupabaseClient;
  cursor: string | null;
  limit: number;
  admin?: SupabaseAdminClient;
}): Promise<ReelFeedPage> {
  const admin = options.admin ?? getSupabaseAdmin();
  const limit = Math.max(1, Math.min(REEL_FEED_MAX_LIMIT, Math.floor(options.limit)));

  const cursor = decodeReelCursor(options.cursor);
  const seed = cursor?.seed ?? Math.floor(Math.random() * 0xffffffff);
  const page = cursor?.page ?? 0;

  const rankSeed = (seed ^ Math.imul(page + 1, 0x9e3779b1)) >>> 0;

  const [rankingInputs, seenAtByKey, feedback] = await Promise.all([
    fetchRankingInputs(admin, options.userId),
    fetchSeenAtByKey(admin, options.userId),
    fetchUserFeedback(admin, options.userId),
  ]);

  // Page-scoped sampling: fetchers rotate which words of each book become
  // candidates (unseen-first), so successive pages keep surfacing new words.
  const sampling: CandidateSampling = {
    seed: rankSeed,
    seenKeys: new Set(Object.keys(seenAtByKey)),
    excludedKeys: feedback.excludedKeys,
  };

  const [sharedCandidates, officialCandidates, tagSimilarityByBookId] = await Promise.all([
    fetchSharedCandidates(admin, sampling),
    fetchOfficialCandidates(admin, rankingInputs.eikenLevel, sampling),
    fetchTagSimilarity(admin, rankingInputs.interestTags),
  ]);

  // Only not-interested words are excluded outright; seen words stay in
  // the pool and get recycled as review cards when the unseen pool runs dry.
  let candidates = [...sharedCandidates, ...officialCandidates].filter(
    (candidate) => !feedback.excludedKeys.has(candidate.id),
  );

  if (rankingInputs.eikenLevel) {
    // Shared words carry no CEFR level; fill it from the lexicon so levelFit
    // can personalize them too. Best-effort — never break the feed on it.
    try {
      const headwords = sharedCefrLookupHeadwords(candidates);
      if (headwords.length > 0) {
        const levels = await lookupLexiconCefrLevels(headwords, { supabaseAdmin: admin });
        candidates = withSharedCefrLevels(candidates, levels);
      }
    } catch {
      // cefrLevel stays null → neutral level fit.
    }
  }
  const selections = selectReelCandidates(
    candidates,
    seenAtByKey,
    {
      eikenLevel: rankingInputs.eikenLevel,
      interestTags: rankingInputs.interestTags,
      now: new Date().toISOString(),
      tagSimilarityByBookId,
      interestedBookRefs: feedback.interestedBookRefs,
      notInterestedBookCounts: feedback.notInterestedBookCounts,
    },
    rankSeed,
    limit,
  );

  // Count the page against the daily limit (batch; must run as the user).
  const { data: usageData, error: usageError } = await options.userClient.rpc(
    'check_and_increment_reel_views',
    { p_requested: selections.length },
  );
  if (usageError || !usageData) {
    throw new Error(usageError?.message || 'reel_usage_rpc_failed');
  }
  const usage = usageData as ReelUsageRpcResult;

  const granted = Math.max(0, Math.min(selections.length, usage.granted));
  const grantedSelections = selections.slice(0, granted);

  if (grantedSelections.length > 0) {
    // Refresh seen_at on every serve so recycled words rotate to the back
    // of the LRU queue instead of repeating immediately.
    await admin.from('reel_seen_words').upsert(
      grantedSelections.map((selection) => ({
        user_id: options.userId,
        item_key: selection.candidate.id,
        seen_at: new Date().toISOString(),
      })),
      { onConflict: 'user_id,item_key' },
    );
  }

  const recycledByKey = new Map(
    grantedSelections.map((selection) => [selection.candidate.id, selection.recycled]),
  );

  // 語源（morphology）を lexicon キャッシュから1バッチで結合する。
  // キャッシュ専用（フィード内で生成はしない）。best-effort — フィードは絶対に壊さない。
  const grantedCandidates = grantedSelections.map((s) => s.candidate);
  try {
    const morphologyByHeadword = await getCachedMorphologyByHeadword(
      grantedCandidates.map((candidate) => normalizeHeadword(candidate.english)),
      { supabaseAdmin: admin },
    );
    for (const candidate of grantedCandidates) {
      const morphology = morphologyByHeadword.get(normalizeHeadword(candidate.english));
      candidate.morphology = morphology && !morphology.none && morphology.formula.length > 0
        ? morphology
        : null;
    }
  } catch {
    // morphology は任意情報。失敗時は全カード2面のまま配信する。
  }

  const items = (
    await enrichItems(admin, options.userId, grantedCandidates)
  ).map((item) => ({ ...item, isRecycled: recycledByKey.get(item.id) ?? false }));

  const limitReached = usage.limit !== null && usage.current_count >= usage.limit;
  // The feed never runs dry (seen words recycle); nextCursor is null only
  // at the free daily limit or when the platform has no content at all.
  const nextCursor =
    limitReached || items.length === 0 ? null : encodeReelCursor({ seed, page: page + 1 });

  return {
    items,
    nextCursor,
    usage: {
      remaining: usage.limit === null ? null : Math.max(0, usage.limit - usage.current_count),
      limit: usage.limit,
      isPro: usage.is_pro,
    },
    limitReached,
  };
}

// ---------- word resolution (shared by likes / comments / feedback) ----------

/**
 * Validate that a reel word exists and belongs to public reel content,
 * returning its book ref ('s:<shareId>' | 'o:<officialSlug>').
 */
export async function resolveReelWordSource(
  source: ReelSource,
  wordId: string,
  admin: SupabaseAdminClient = getSupabaseAdmin(),
): Promise<{ bookRef: string } | null> {
  if (source === 'shared') {
    const { data: word } = await admin
      .from('shared_wordbook_words')
      .select('id,shared_wordbook_id')
      .eq('id', wordId)
      .maybeSingle<{ id: string; shared_wordbook_id: string }>();
    if (!word) return null;
    const { data: book } = await admin
      .from('shared_wordbooks')
      .select('share_id')
      .eq('id', word.shared_wordbook_id)
      .maybeSingle<{ share_id: string }>();
    if (!book) return null;
    return { bookRef: `s:${book.share_id}` };
  }

  // Only words belonging to active official wordbooks count as reel content.
  const { data: word } = await admin
    .from('words')
    .select('id,project_id')
    .eq('id', wordId)
    .maybeSingle<{ id: string; project_id: string }>();
  if (!word) return null;
  const { data: project } = await admin
    .from('projects')
    .select('id,official_slug')
    .eq('id', word.project_id)
    .eq('official_is_active', true)
    .maybeSingle<{ id: string; official_slug: string | null }>();
  if (!project || !project.official_slug) return null;
  return { bookRef: `o:${project.official_slug}` };
}

// ---------- likes ----------

export async function setReelWordLike(options: {
  userId: string;
  source: ReelSource;
  wordId: string;
  liked: boolean;
  admin?: SupabaseAdminClient;
}): Promise<{ liked: boolean; likeCount: number } | null> {
  const admin = options.admin ?? getSupabaseAdmin();
  const { userId, source, wordId, liked } = options;

  const resolved = await resolveReelWordSource(source, wordId, admin);
  if (!resolved) return null;

  const column = source === 'shared' ? 'shared_word_id' : 'official_word_id';

  if (liked) {
    // Select-then-insert instead of upsert: the unique index is partial
    // (WHERE <col> IS NOT NULL), which Postgres cannot use for ON CONFLICT
    // inference — an upsert here fails with 42P10 and 500s the route.
    const { data: existing } = await admin
      .from('reel_word_likes')
      .select('id')
      .eq('user_id', userId)
      .eq(column, wordId)
      .maybeSingle<{ id: string }>();
    if (!existing) {
      const { error } = await admin
        .from('reel_word_likes')
        .insert([{ user_id: userId, [column]: wordId }]);
      // 23505 = unique_violation from a concurrent insert → already liked.
      if (error && (error as { code?: string }).code !== '23505') {
        throw new Error(error.message || 'reel_like_insert_failed');
      }
    }
  } else {
    const { error } = await admin
      .from('reel_word_likes')
      .delete()
      .eq('user_id', userId)
      .eq(column, wordId);
    if (error) throw new Error(error.message || 'reel_like_delete_failed');
  }

  const { count, error: countError } = await admin
    .from('reel_word_likes')
    .select('*', { count: 'exact', head: true })
    .eq(column, wordId);
  if (countError) throw new Error(countError.message || 'reel_like_count_failed');

  return { liked, likeCount: count ?? 0 };
}

// ---------- whole-book words (for + import) ----------

export type ReelBookWordPayload = {
  english: string;
  japanese: string;
  pronunciation?: string;
  exampleSentence?: string;
  exampleSentenceJa?: string;
  partOfSpeechTags?: string[];
  vocabularyType?: string;
  distractors: string[];
};

export type ReelBookImportPayload = {
  book: {
    type: ReelSource;
    title: string;
    iconImage: string | null;
    shareId?: string;
    officialSlug?: string;
  };
  words: ReelBookWordPayload[];
};

export function parseReelBookKey(bookKey: string): { type: ReelSource; code: string } | null {
  const match = /^([so]):(.+)$/.exec(bookKey.trim());
  if (!match) return null;
  return { type: match[1] === 's' ? 'shared' : 'official', code: match[2] };
}

export async function getReelBookForImport(
  bookKey: string,
  admin: SupabaseAdminClient = getSupabaseAdmin(),
): Promise<ReelBookImportPayload | null> {
  const parsed = parseReelBookKey(bookKey);
  if (!parsed) return null;

  if (parsed.type === 'shared') {
    const { data: book } = await admin
      .from('shared_wordbooks')
      .select('id,share_id,title,icon_image')
      .eq('share_id', parsed.code)
      .maybeSingle<{ id: string; share_id: string; title: string; icon_image: string | null }>();
    if (!book) return null;

    const { data: words, error } = await admin
      .from('shared_wordbook_words')
      .select('english,japanese,pronunciation,example_sentence,example_sentence_ja,part_of_speech_tags,vocabulary_type,distractors')
      .eq('shared_wordbook_id', book.id)
      .order('position', { ascending: true });
    if (error) throw new Error(error.message || 'reel_book_words_failed');

    return {
      book: { type: 'shared', title: book.title, iconImage: book.icon_image, shareId: book.share_id },
      words: (words ?? []).map((row) => ({
        english: row.english as string,
        japanese: (row.japanese as string) ?? '',
        pronunciation: (row.pronunciation as string | null) ?? undefined,
        exampleSentence: (row.example_sentence as string | null) ?? undefined,
        exampleSentenceJa: (row.example_sentence_ja as string | null) ?? undefined,
        partOfSpeechTags: toStringArray(row.part_of_speech_tags),
        vocabularyType: (row.vocabulary_type as string | null) ?? undefined,
        distractors: toStringArray(row.distractors),
      })),
    };
  }

  const { data: project } = await admin
    .from('projects')
    .select('id,official_slug,official_title,title,icon_image')
    .eq('official_slug', parsed.code)
    .eq('official_is_active', true)
    .maybeSingle<{
      id: string;
      official_slug: string;
      official_title: string | null;
      title: string;
      icon_image: string | null;
    }>();
  if (!project) return null;

  const { data: words, error } = await admin
    .from('words')
    .select('english,japanese,pronunciation,example_sentence,example_sentence_ja,part_of_speech_tags,vocabulary_type,distractors')
    .eq('project_id', project.id)
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message || 'reel_book_words_failed');

  return {
    book: {
      type: 'official',
      title: project.official_title || project.title,
      iconImage: project.icon_image,
      officialSlug: project.official_slug,
    },
    words: (words ?? [])
      .filter((row) => typeof row.english === 'string' && row.english.trim() !== '')
      .map((row) => ({
        english: row.english as string,
        japanese: (row.japanese as string | null) ?? '',
        pronunciation: (row.pronunciation as string | null) ?? undefined,
        exampleSentence: (row.example_sentence as string | null) ?? undefined,
        exampleSentenceJa: (row.example_sentence_ja as string | null) ?? undefined,
        partOfSpeechTags: toStringArray(row.part_of_speech_tags),
        vocabularyType: (row.vocabulary_type as string | null) ?? undefined,
        distractors: toStringArray(row.distractors),
      })),
  };
}

// ---------- comments ----------

const COMMENT_FETCH_LIMIT = 50;

type CommentRow = {
  id: string;
  user_id: string;
  body: string;
  created_at: string;
};

async function fetchDisplayNames(
  admin: SupabaseAdminClient,
  userIds: string[],
): Promise<Map<string, string | null>> {
  const result = new Map<string, string | null>();
  const uniqueIds = Array.from(new Set(userIds.filter(Boolean)));
  if (uniqueIds.length === 0) return result;
  try {
    const { data } = await admin
      .from('profiles')
      .select('user_id, display_name, username')
      .in('user_id', uniqueIds);
    for (const row of data ?? []) {
      result.set(
        row.user_id as string,
        (row.display_name as string | null) ?? (row.username as string | null) ?? null,
      );
    }
  } catch {
    // profiles lookup is best-effort; degrade to anonymous.
  }
  return result;
}

export async function listReelWordComments(options: {
  viewerId: string;
  source: ReelSource;
  wordId: string;
  admin?: SupabaseAdminClient;
}): Promise<ReelComment[] | null> {
  const admin = options.admin ?? getSupabaseAdmin();
  const resolved = await resolveReelWordSource(options.source, options.wordId, admin);
  if (!resolved) return null;

  const column = options.source === 'shared' ? 'shared_word_id' : 'official_word_id';
  const { data, error } = await admin
    .from('reel_word_comments')
    .select('id,user_id,body,created_at')
    .eq(column, options.wordId)
    .order('created_at', { ascending: false })
    .limit(COMMENT_FETCH_LIMIT);
  if (error) throw new Error(error.message || 'reel_comments_list_failed');

  const rows = (data ?? []) as CommentRow[];
  const names = await fetchDisplayNames(admin, rows.map((row) => row.user_id));

  return rows.map((row) => ({
    id: row.id,
    body: row.body,
    createdAt: row.created_at,
    authorName: names.get(row.user_id) ?? '匿名ユーザー',
    isMine: row.user_id === options.viewerId,
  }));
}

export async function createReelWordComment(options: {
  userId: string;
  source: ReelSource;
  wordId: string;
  body: string;
  admin?: SupabaseAdminClient;
}): Promise<ReelComment | null> {
  const admin = options.admin ?? getSupabaseAdmin();
  const resolved = await resolveReelWordSource(options.source, options.wordId, admin);
  if (!resolved) return null;

  const column = options.source === 'shared' ? 'shared_word_id' : 'official_word_id';
  const { data, error } = await admin
    .from('reel_word_comments')
    .insert([{ user_id: options.userId, [column]: options.wordId, body: options.body }])
    .select('id,user_id,body,created_at')
    .single<CommentRow>();
  if (error || !data) throw new Error(error?.message || 'reel_comment_create_failed');

  const names = await fetchDisplayNames(admin, [options.userId]);
  return {
    id: data.id,
    body: data.body,
    createdAt: data.created_at,
    authorName: names.get(options.userId) ?? '匿名ユーザー',
    isMine: true,
  };
}

export async function deleteReelWordComment(options: {
  userId: string;
  commentId: string;
  admin?: SupabaseAdminClient;
}): Promise<boolean> {
  const admin = options.admin ?? getSupabaseAdmin();
  const { data, error } = await admin
    .from('reel_word_comments')
    .delete()
    .eq('id', options.commentId)
    .eq('user_id', options.userId)
    .select('id');
  if (error) throw new Error(error.message || 'reel_comment_delete_failed');
  return (data ?? []).length > 0;
}

// ---------- interested / not-interested feedback ----------

export async function setReelWordFeedback(options: {
  userId: string;
  source: ReelSource;
  wordId: string;
  feedback: ReelFeedback;
  admin?: SupabaseAdminClient;
}): Promise<{ feedback: ReelFeedback } | null> {
  const admin = options.admin ?? getSupabaseAdmin();
  const resolved = await resolveReelWordSource(options.source, options.wordId, admin);
  if (!resolved) return null;

  const column = options.source === 'shared' ? 'shared_word_id' : 'official_word_id';
  const nowIso = new Date().toISOString();

  // Select-then-update/insert instead of upsert: the unique index is partial
  // (WHERE <col> IS NOT NULL), which Postgres cannot use for ON CONFLICT
  // inference — an upsert here fails with 42P10 and 500s the route.
  const { data: existing } = await admin
    .from('reel_word_feedback')
    .select('id')
    .eq('user_id', options.userId)
    .eq(column, options.wordId)
    .maybeSingle<{ id: string }>();

  if (existing) {
    const { error } = await admin
      .from('reel_word_feedback')
      .update({ feedback: options.feedback, book_ref: resolved.bookRef, updated_at: nowIso })
      .eq('id', existing.id);
    if (error) throw new Error(error.message || 'reel_feedback_update_failed');
  } else {
    const { error } = await admin
      .from('reel_word_feedback')
      .insert([{
        user_id: options.userId,
        [column]: options.wordId,
        book_ref: resolved.bookRef,
        feedback: options.feedback,
        updated_at: nowIso,
      }]);
    // 23505 = unique_violation from a concurrent insert → treat as applied.
    if (error && (error as { code?: string }).code !== '23505') {
      throw new Error(error.message || 'reel_feedback_insert_failed');
    }
  }

  return { feedback: options.feedback };
}
