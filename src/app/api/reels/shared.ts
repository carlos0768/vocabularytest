import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import type {
  ReelBook,
  ReelCandidate,
  ReelFeedPage,
  ReelItem,
  ReelSource,
} from '@/lib/reels/types';
import { decodeReelCursor, encodeReelCursor } from '@/lib/reels/cursor';
import { eikenLevelsAround } from '@/lib/reels/eiken-cefr';
import { rankReelCandidates } from '@/lib/reels/ranking';

type SupabaseAdminClient = ReturnType<typeof getSupabaseAdmin>;

export const REEL_FEED_DEFAULT_LIMIT = 8;
export const REEL_FEED_MAX_LIMIT = 12;

const SHARED_POPULAR_BOOK_COUNT = 30;
const SHARED_RECENT_BOOK_COUNT = 10;
const SHARED_WORDS_PER_BOOK = 5;
const SHARED_WORDS_FETCH_LIMIT = 600;
const OFFICIAL_WORDS_PER_BOOK = 10;
const OFFICIAL_WORDS_FETCH_LIMIT = 300;
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

/** Pick up to `count` items spread evenly across the list. */
function spreadPick<T>(items: T[], count: number): T[] {
  if (items.length <= count) return items;
  const picked: T[] = [];
  const step = items.length / count;
  for (let i = 0; i < count; i += 1) {
    picked.push(items[Math.floor(i * step)]);
  }
  return picked;
}

export function reelItemKey(source: ReelSource, wordId: string): string {
  return `${source === 'shared' ? 's' : 'o'}:${wordId}`;
}

// ---------- candidate fetchers ----------

async function fetchSharedCandidates(admin: SupabaseAdminClient): Promise<ReelCandidate[]> {
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
    for (const word of spreadPick(words, SHARED_WORDS_PER_BOOK)) {
      if (!word.english?.trim() || !word.japanese?.trim()) continue;
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
    for (const word of spreadPick(words, OFFICIAL_WORDS_PER_BOOK)) {
      if (!word.english?.trim() || !word.japanese?.trim()) continue;
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

async function fetchSeenKeys(admin: SupabaseAdminClient, userId: string): Promise<Set<string>> {
  const since = new Date(Date.now() - SEEN_WINDOW_DAYS * 86_400_000).toISOString();
  const { data, error } = await admin
    .from('reel_seen_words')
    .select('item_key')
    .eq('user_id', userId)
    .gte('seen_at', since)
    .order('seen_at', { ascending: false })
    .limit(SEEN_FETCH_LIMIT);

  if (error) {
    // Dedup is best-effort; an error here must not break the feed.
    return new Set();
  }
  return new Set((data ?? []).map((row) => row.item_key as string));
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

  const [sharedLikes, officialLikes, importedProjects] = await Promise.all([
    sharedWordIds.length > 0
      ? admin.from('reel_word_likes').select('shared_word_id,user_id').in('shared_word_id', sharedWordIds)
      : Promise.resolve({ data: [], error: null }),
    officialWordIds.length > 0
      ? admin.from('reel_word_likes').select('official_word_id,user_id').in('official_word_id', officialWordIds)
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

  const rankingInputs = await fetchRankingInputs(admin, options.userId);
  const [sharedCandidates, officialCandidates, seenKeys] = await Promise.all([
    fetchSharedCandidates(admin),
    fetchOfficialCandidates(admin, rankingInputs.eikenLevel),
    fetchSeenKeys(admin, options.userId),
  ]);

  const unseen = [...sharedCandidates, ...officialCandidates].filter(
    (candidate) => !seenKeys.has(candidate.id),
  );

  const rankSeed = (seed ^ Math.imul(page + 1, 0x9e3779b1)) >>> 0;
  const picked = rankReelCandidates(
    unseen,
    { eikenLevel: rankingInputs.eikenLevel, interestTags: rankingInputs.interestTags, now: new Date().toISOString() },
    rankSeed,
    limit,
  );

  // Count the page against the daily limit (batch; must run as the user).
  const { data: usageData, error: usageError } = await options.userClient.rpc(
    'check_and_increment_reel_views',
    { p_requested: picked.length },
  );
  if (usageError || !usageData) {
    throw new Error(usageError?.message || 'reel_usage_rpc_failed');
  }
  const usage = usageData as ReelUsageRpcResult;

  const granted = Math.max(0, Math.min(picked.length, usage.granted));
  const grantedCandidates = picked.slice(0, granted);

  if (grantedCandidates.length > 0) {
    await admin.from('reel_seen_words').upsert(
      grantedCandidates.map((candidate) => ({
        user_id: options.userId,
        item_key: candidate.id,
      })),
      { onConflict: 'user_id,item_key', ignoreDuplicates: true },
    );
  }

  const items = await enrichItems(admin, options.userId, grantedCandidates);

  const limitReached = usage.limit !== null && usage.current_count >= usage.limit;
  const poolExhausted = picked.length < limit && unseen.length <= picked.length;
  const nextCursor =
    limitReached || poolExhausted || items.length === 0
      ? null
      : encodeReelCursor({ seed, page: page + 1 });

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

  if (source === 'shared') {
    const { data: word } = await admin
      .from('shared_wordbook_words')
      .select('id')
      .eq('id', wordId)
      .maybeSingle<{ id: string }>();
    if (!word) return null;
  } else {
    // Only words belonging to active official wordbooks are likeable.
    const { data: word } = await admin
      .from('words')
      .select('id,project_id')
      .eq('id', wordId)
      .maybeSingle<{ id: string; project_id: string }>();
    if (!word) return null;
    const { data: project } = await admin
      .from('projects')
      .select('id')
      .eq('id', word.project_id)
      .eq('official_is_active', true)
      .maybeSingle<{ id: string }>();
    if (!project) return null;
  }

  const column = source === 'shared' ? 'shared_word_id' : 'official_word_id';

  if (liked) {
    const { error } = await admin
      .from('reel_word_likes')
      .upsert([{ user_id: userId, [column]: wordId }], {
        onConflict: `user_id,${column}`,
        ignoreDuplicates: true,
      });
    if (error) throw new Error(error.message || 'reel_like_upsert_failed');
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
