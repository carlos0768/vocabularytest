import { getSupabaseAdmin } from '@/lib/supabase/admin';
import type {
  PublicSharedProjectListPayload,
  SharedProjectCard,
  SharedProjectPreviewPayload,
  SharedUserSummary,
} from '@/lib/shared-projects/types';
import type { Project, Word } from '@/types';
import { mapProjectFromRow, type ProjectRow } from '../../../../shared/db';
import { normalizeSharedTags } from '../../../../shared/shared-tags';
import { createSharedTagsEmbedding } from '@/lib/shared-projects/tag-embeddings';

type SupabaseAdminClient = ReturnType<typeof getSupabaseAdmin>;

const SHARED_WORDBOOK_SELECT = 'id,share_id,source_project_id,user_id,title,description,icon_image,source_labels,shared_tags,word_count,like_count,created_at';
const SHARED_WORDBOOK_WORD_SELECT = 'id,position,english,japanese,pronunciation,example_sentence,example_sentence_ja,part_of_speech_tags,vocabulary_type,distractors,created_at';
const SOURCE_WORD_SELECT = 'english,japanese,pronunciation,example_sentence,example_sentence_ja,part_of_speech_tags,vocabulary_type,distractors,created_at';

const DEFAULT_PUBLIC_PAGE_SIZE = 8;
const MAX_PUBLIC_PAGE_SIZE = 24;
const DEFAULT_SHARE_PREVIEW_WORD_LIMIT = 5;
const MAX_SHARE_PREVIEW_WORD_LIMIT = 20;

export type SharedWordbookRow = {
  id: string;
  share_id: string;
  source_project_id: string | null;
  user_id: string;
  title: string;
  description?: string | null;
  icon_image?: string | null;
  source_labels?: unknown[] | null;
  shared_tags?: unknown[] | null;
  word_count?: number | null;
  like_count?: number | null;
  created_at: string;
};

type SharedWordbookWordRow = {
  id: string;
  position?: number | null;
  english: string;
  japanese: string;
  pronunciation?: string | null;
  example_sentence?: string | null;
  example_sentence_ja?: string | null;
  part_of_speech_tags?: unknown;
  vocabulary_type?: string | null;
  distractors?: unknown;
  created_at: string;
};

type SourceWordRow = {
  english: string;
  japanese: string;
  pronunciation?: string | null;
  example_sentence?: string | null;
  example_sentence_ja?: string | null;
  part_of_speech_tags?: unknown;
  vocabulary_type?: string | null;
  distractors?: unknown;
  created_at: string;
};

type SharedProfileSummary = {
  username: string | null;
  accountId: string | null;
};

type PublicListOptions = {
  limit?: number;
  cursor?: string | null;
  query?: string | null;
};

export class SharedWordbookError extends Error {
  constructor(readonly code: 'not_found' | 'forbidden' | 'failed', message?: string) {
    super(message ?? code);
    this.name = 'SharedWordbookError';
  }
}

function generateShareId(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(9)))
    .map((b) => b.toString(36).padStart(2, '0'))
    .join('')
    .slice(0, 12);
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === 'string');
}

function normalizePartOfSpeechTags(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const tags = value.filter((entry): entry is string => typeof entry === 'string');
  return tags.length > 0 ? tags : undefined;
}

/** Project the snapshot row into the ProjectRow shape so existing mappers apply. */
function toProjectRow(row: SharedWordbookRow): ProjectRow {
  return {
    id: row.id,
    user_id: row.user_id,
    title: row.title,
    source_labels: row.source_labels ?? [],
    shared_tags: row.shared_tags ?? [],
    icon_image: row.icon_image ?? null,
    description: row.description ?? null,
    created_at: row.created_at,
    share_id: row.share_id,
    share_scope: 'public',
    is_favorite: false,
  };
}

function mapSharedWordbookCard(
  row: SharedWordbookRow,
  accessRole: SharedProjectCard['accessRole'],
  profileByUserId: Map<string, SharedProfileSummary>,
): SharedProjectCard {
  const profile = profileByUserId.get(row.user_id);
  return {
    project: mapProjectFromRow(toProjectRow(row)),
    accessRole,
    wordCount: Number(row.word_count ?? 0),
    collaboratorCount: 1,
    likeCount: Number(row.like_count ?? 0),
    ownerUsername: profile?.username ?? null,
    ownerAccountId: profile?.accountId ?? null,
  };
}

function mapSharedWordbookWord(row: SharedWordbookWordRow, sharedWordbookId: string): Word {
  return {
    id: row.id,
    projectId: sharedWordbookId,
    english: row.english,
    japanese: row.japanese,
    pronunciation: row.pronunciation ?? undefined,
    exampleSentence: row.example_sentence ?? undefined,
    exampleSentenceJa: row.example_sentence_ja ?? undefined,
    partOfSpeechTags: normalizePartOfSpeechTags(row.part_of_speech_tags),
    vocabularyType: row.vocabulary_type === 'active' || row.vocabulary_type === 'passive'
      ? row.vocabulary_type
      : undefined,
    distractors: Array.isArray(row.distractors)
      ? (row.distractors as string[])
      : [],
    status: 'new',
    createdAt: row.created_at,
    easeFactor: 2.5,
    intervalDays: 0,
    repetition: 0,
    isFavorite: false,
  };
}

async function getProfilesByUserIds(
  admin: SupabaseAdminClient,
  userIds: string[],
): Promise<Map<string, SharedProfileSummary>> {
  const result = new Map<string, SharedProfileSummary>();
  const uniqueIds = Array.from(new Set(userIds.filter(Boolean)));
  if (uniqueIds.length === 0) return result;

  try {
    const { data, error } = await admin
      .from('profiles')
      .select('user_id, username, account_id')
      .in('user_id', uniqueIds);

    if (error) {
      const { data: fallback, error: fallbackError } = await admin
        .from('profiles')
        .select('user_id, username')
        .in('user_id', uniqueIds);
      if (!fallbackError) {
        for (const profileRow of fallback ?? []) {
          result.set(profileRow.user_id as string, {
            username: (profileRow.username as string | null) ?? null,
            accountId: null,
          });
        }
      }
      return result;
    }

    for (const profileRow of data ?? []) {
      result.set(profileRow.user_id as string, {
        username: (profileRow.username as string | null) ?? null,
        accountId: (profileRow.account_id as string | null) ?? null,
      });
    }
  } catch {
    // profiles table may be unavailable; degrade gracefully.
  }

  return result;
}

function clampPublicPageSize(limit?: number): number {
  if (!Number.isFinite(limit)) return DEFAULT_PUBLIC_PAGE_SIZE;
  return Math.max(1, Math.min(MAX_PUBLIC_PAGE_SIZE, Number(limit)));
}

function clampSharePreviewWordLimit(limit: number): number {
  if (!Number.isFinite(limit)) return DEFAULT_SHARE_PREVIEW_WORD_LIMIT;
  return Math.max(0, Math.min(MAX_SHARE_PREVIEW_WORD_LIMIT, Math.floor(limit)));
}

function normalizeSearchQuery(query?: string | null): string {
  return (query ?? '').trim().replace(/^@+/, '').toLowerCase();
}

function includesSearchText(value: string | null | undefined, query: string): boolean {
  return value?.toLowerCase().includes(query) ?? false;
}

function rowMatchesSearch(
  row: SharedWordbookRow,
  profile: SharedProfileSummary | undefined,
  query: string,
): boolean {
  if (!query) return true;
  if (includesSearchText(row.title, query)) return true;
  if (includesSearchText(profile?.username, query)) return true;
  if (includesSearchText(profile?.accountId, query)) return true;
  return normalizeStringArray(row.shared_tags).some((tag) => includesSearchText(tag, query));
}

function encodeOffsetCursor(offset: number): string {
  return Buffer.from(JSON.stringify({ offset }), 'utf8').toString('base64url');
}

function decodeOffsetCursor(cursor: string | null): number {
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

// ============ Public discovery reads ============

export async function listPublicSharedWordbooks(
  options: PublicListOptions = {},
  admin: SupabaseAdminClient = getSupabaseAdmin(),
): Promise<PublicSharedProjectListPayload> {
  const limit = clampPublicPageSize(options.limit);
  const query = normalizeSearchQuery(options.query);
  const offset = decodeOffsetCursor(options.cursor ?? null);

  // Fetch a generous window so we can filter by search text in-memory.
  const fetchSize = query ? Math.max(200, (offset + limit + 1) * 4) : offset + limit + 1;
  const { data, error } = await admin
    .from('shared_wordbooks')
    .select(SHARED_WORDBOOK_SELECT)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(fetchSize);

  if (error) {
    throw new Error(error.message || 'public_shared_wordbooks_lookup_failed');
  }

  const rows = (data ?? []) as SharedWordbookRow[];
  const profileByUserId = await getProfilesByUserIds(admin, rows.map((row) => row.user_id));
  const matchingRows = query
    ? rows.filter((row) => rowMatchesSearch(row, profileByUserId.get(row.user_id), query))
    : rows;
  const pageRows = matchingRows.slice(offset, offset + limit);

  return {
    items: pageRows.map((row) => mapSharedWordbookCard(row, 'viewer', profileByUserId)),
    nextCursor: matchingRows.length > offset + limit ? encodeOffsetCursor(offset + limit) : null,
  };
}

export async function listPublicSharedWordbookUsers(
  options: PublicListOptions = {},
  admin: SupabaseAdminClient = getSupabaseAdmin(),
): Promise<{ users: SharedUserSummary[]; nextCursor: string | null }> {
  const limit = clampPublicPageSize(options.limit);
  const query = normalizeSearchQuery(options.query);
  const offset = decodeOffsetCursor(options.cursor ?? null);

  const { data, error } = await admin
    .from('shared_wordbooks')
    .select(SHARED_WORDBOOK_SELECT)
    .order('created_at', { ascending: false })
    .limit(400);

  if (error) {
    throw new Error(error.message || 'public_shared_wordbook_users_lookup_failed');
  }

  const rows = (data ?? []) as SharedWordbookRow[];
  const profileByUserId = await getProfilesByUserIds(admin, rows.map((row) => row.user_id));
  const matchingRows = query
    ? rows.filter((row) => rowMatchesSearch(row, profileByUserId.get(row.user_id), query))
    : rows;

  const userById = new Map<string, SharedUserSummary>();
  for (const row of matchingRows) {
    const existing = userById.get(row.user_id);
    if (existing) {
      existing.projectCount += 1;
      existing.wordCount += Number(row.word_count ?? 0);
      existing.likeCount += Number(row.like_count ?? 0);
      continue;
    }
    const profile = profileByUserId.get(row.user_id);
    userById.set(row.user_id, {
      userId: row.user_id,
      username: profile?.username ?? null,
      accountId: profile?.accountId ?? null,
      projectCount: 1,
      wordCount: Number(row.word_count ?? 0),
      likeCount: Number(row.like_count ?? 0),
    });
  }

  const users = Array.from(userById.values())
    .sort((a, b) => b.projectCount - a.projectCount || b.likeCount - a.likeCount);
  const pageUsers = users.slice(offset, offset + limit);

  return {
    users: pageUsers,
    nextCursor: users.length > offset + limit ? encodeOffsetCursor(offset + limit) : null,
  };
}

export async function getSharedWordbookByShareId(
  shareId: string,
  admin: SupabaseAdminClient = getSupabaseAdmin(),
): Promise<SharedWordbookRow | null> {
  const { data, error } = await admin
    .from('shared_wordbooks')
    .select(SHARED_WORDBOOK_SELECT)
    .eq('share_id', shareId)
    .maybeSingle<SharedWordbookRow>();

  if (error) {
    throw new Error(error.message || 'shared_wordbook_lookup_failed');
  }
  return data ?? null;
}

export async function getSharedWordbookPreview(
  shareId: string,
  wordLimit = DEFAULT_SHARE_PREVIEW_WORD_LIMIT,
  admin: SupabaseAdminClient = getSupabaseAdmin(),
): Promise<SharedProjectPreviewPayload | null> {
  const row = await getSharedWordbookByShareId(shareId, admin);
  if (!row) return null;

  const limit = clampSharePreviewWordLimit(wordLimit);
  const [wordsResult, profileByUserId] = await Promise.all([
    admin
      .from('shared_wordbook_words')
      .select(SHARED_WORDBOOK_WORD_SELECT)
      .eq('shared_wordbook_id', row.id)
      .order('position', { ascending: true })
      .limit(limit),
    getProfilesByUserIds(admin, [row.user_id]),
  ]);

  if (wordsResult.error) {
    throw new Error(wordsResult.error.message || 'shared_wordbook_preview_words_failed');
  }

  const profile = profileByUserId.get(row.user_id);
  return {
    project: mapProjectFromRow(toProjectRow(row)),
    words: ((wordsResult.data ?? []) as SharedWordbookWordRow[]).map((word) => mapSharedWordbookWord(word, row.id)),
    totalWordCount: Number(row.word_count ?? wordsResult.data?.length ?? 0),
    likeCount: Number(row.like_count ?? 0),
    ownerUsername: profile?.username ?? null,
    ownerAccountId: profile?.accountId ?? null,
  };
}

export async function getSharedWordbookWords(
  shareId: string,
  admin: SupabaseAdminClient = getSupabaseAdmin(),
): Promise<Word[]> {
  const row = await getSharedWordbookByShareId(shareId, admin);
  if (!row) return [];

  const { data, error } = await admin
    .from('shared_wordbook_words')
    .select(SHARED_WORDBOOK_WORD_SELECT)
    .eq('shared_wordbook_id', row.id)
    .order('position', { ascending: true });

  if (error) {
    throw new Error(error.message || 'shared_wordbook_words_failed');
  }
  return ((data ?? []) as SharedWordbookWordRow[]).map((word) => mapSharedWordbookWord(word, row.id));
}

// ============ Owner management ============

export async function listMySharedWordbooks(
  userId: string,
  admin: SupabaseAdminClient = getSupabaseAdmin(),
): Promise<SharedProjectCard[]> {
  const { data, error } = await admin
    .from('shared_wordbooks')
    .select(SHARED_WORDBOOK_SELECT)
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(error.message || 'my_shared_wordbooks_lookup_failed');
  }

  const rows = (data ?? []) as SharedWordbookRow[];
  const profileByUserId = await getProfilesByUserIds(admin, [userId]);
  return rows.map((row) => mapSharedWordbookCard(row, 'owner', profileByUserId));
}

export async function publishSharedWordbook(
  userId: string,
  projectId: string,
  sharedTags: readonly string[],
  admin: SupabaseAdminClient = getSupabaseAdmin(),
): Promise<SharedProjectCard> {
  const { data: projectRow, error: projectError } = await admin
    .from('projects')
    .select('id,user_id,title,description,icon_image,source_labels')
    .eq('id', projectId)
    .maybeSingle<{
      id: string;
      user_id: string;
      title: string;
      description: string | null;
      icon_image: string | null;
      source_labels: unknown[] | null;
    }>();

  if (projectError) {
    throw new Error(projectError.message || 'shared_wordbook_publish_project_lookup_failed');
  }
  if (!projectRow) {
    throw new SharedWordbookError('not_found', 'project_not_found');
  }
  if (projectRow.user_id !== userId) {
    throw new SharedWordbookError('forbidden', 'project_not_owned');
  }

  const tags = normalizeSharedTags(sharedTags);

  // Snapshot the words from the source project.
  const { data: wordRows, error: wordError } = await admin
    .from('words')
    .select(SOURCE_WORD_SELECT)
    .eq('project_id', projectId)
    .order('created_at', { ascending: true });

  if (wordError) {
    throw new Error(wordError.message || 'shared_wordbook_publish_words_failed');
  }
  const sourceWords = (wordRows ?? []) as SourceWordRow[];

  // Reuse an existing snapshot for this source project, if present.
  const { data: existing, error: existingError } = await admin
    .from('shared_wordbooks')
    .select('id,share_id,user_id')
    .eq('source_project_id', projectId)
    .maybeSingle<{ id: string; share_id: string; user_id: string }>();

  if (existingError) {
    throw new Error(existingError.message || 'shared_wordbook_publish_existing_lookup_failed');
  }
  if (existing && existing.user_id !== userId) {
    throw new SharedWordbookError('forbidden', 'shared_wordbook_not_owned');
  }

  const shareId = existing?.share_id ?? generateShareId();
  const basePayload = {
    share_id: shareId,
    source_project_id: projectId,
    user_id: userId,
    title: projectRow.title,
    description: projectRow.description,
    icon_image: projectRow.icon_image,
    source_labels: normalizeStringArray(projectRow.source_labels),
    shared_tags: tags,
    word_count: sourceWords.length,
    updated_at: new Date().toISOString(),
  };

  let sharedWordbookId: string;
  if (existing) {
    const { error: updateError } = await admin
      .from('shared_wordbooks')
      .update(basePayload)
      .eq('id', existing.id);
    if (updateError) {
      throw new Error(updateError.message || 'shared_wordbook_update_failed');
    }
    sharedWordbookId = existing.id;

    const { error: deleteError } = await admin
      .from('shared_wordbook_words')
      .delete()
      .eq('shared_wordbook_id', sharedWordbookId);
    if (deleteError) {
      throw new Error(deleteError.message || 'shared_wordbook_words_clear_failed');
    }
  } else {
    const { data: inserted, error: insertError } = await admin
      .from('shared_wordbooks')
      .insert({ ...basePayload, like_count: 0 })
      .select('id')
      .single<{ id: string }>();
    if (insertError || !inserted) {
      throw new Error(insertError?.message || 'shared_wordbook_insert_failed');
    }
    sharedWordbookId = inserted.id;
  }

  if (sourceWords.length > 0) {
    const wordPayload = sourceWords.map((word, index) => ({
      shared_wordbook_id: sharedWordbookId,
      position: index,
      english: word.english,
      japanese: word.japanese,
      pronunciation: word.pronunciation ?? null,
      example_sentence: word.example_sentence ?? null,
      example_sentence_ja: word.example_sentence_ja ?? null,
      part_of_speech_tags: word.part_of_speech_tags ?? null,
      vocabulary_type: word.vocabulary_type ?? null,
      distractors: Array.isArray(word.distractors) ? word.distractors : [],
      created_at: word.created_at,
    }));

    const { error: wordsInsertError } = await admin
      .from('shared_wordbook_words')
      .insert(wordPayload);
    if (wordsInsertError) {
      throw new Error(wordsInsertError.message || 'shared_wordbook_words_insert_failed');
    }
  }

  // Best-effort: store a tag embedding on the snapshot for semantic
  // reel-feed affinity. Failure (no API key, missing column) must not
  // break publishing.
  try {
    const embedding = await createSharedTagsEmbedding(tags);
    await admin
      .from('shared_wordbooks')
      .update({ shared_tags_embedding: embedding })
      .eq('id', sharedWordbookId);
  } catch (embeddingError) {
    console.warn('[shared-wordbooks] tag embedding skipped:', embeddingError);
  }

  const { data: finalRow, error: finalError } = await admin
    .from('shared_wordbooks')
    .select(SHARED_WORDBOOK_SELECT)
    .eq('id', sharedWordbookId)
    .single<SharedWordbookRow>();

  if (finalError || !finalRow) {
    throw new Error(finalError?.message || 'shared_wordbook_reload_failed');
  }

  const profileByUserId = await getProfilesByUserIds(admin, [userId]);
  return mapSharedWordbookCard(finalRow, 'owner', profileByUserId);
}

export async function renameSharedWordbook(
  userId: string,
  sharedWordbookId: string,
  title: string,
  admin: SupabaseAdminClient = getSupabaseAdmin(),
): Promise<SharedProjectCard> {
  const trimmed = title.trim();
  if (!trimmed) {
    throw new SharedWordbookError('failed', 'title_required');
  }

  const { data: row, error } = await admin
    .from('shared_wordbooks')
    .select('id,user_id')
    .eq('id', sharedWordbookId)
    .maybeSingle<{ id: string; user_id: string }>();

  if (error) {
    throw new Error(error.message || 'shared_wordbook_rename_lookup_failed');
  }
  if (!row) {
    throw new SharedWordbookError('not_found', 'shared_wordbook_not_found');
  }
  if (row.user_id !== userId) {
    throw new SharedWordbookError('forbidden', 'shared_wordbook_not_owned');
  }

  const { data: updated, error: updateError } = await admin
    .from('shared_wordbooks')
    .update({ title: trimmed, updated_at: new Date().toISOString() })
    .eq('id', sharedWordbookId)
    .select(SHARED_WORDBOOK_SELECT)
    .single<SharedWordbookRow>();

  if (updateError || !updated) {
    throw new Error(updateError?.message || 'shared_wordbook_rename_failed');
  }

  const profileByUserId = await getProfilesByUserIds(admin, [userId]);
  return mapSharedWordbookCard(updated, 'owner', profileByUserId);
}

export async function updateSharedWordbookTags(
  userId: string,
  sharedWordbookId: string,
  sharedTags: readonly string[],
  admin: SupabaseAdminClient = getSupabaseAdmin(),
): Promise<SharedProjectCard> {
  const { data: row, error } = await admin
    .from('shared_wordbooks')
    .select('id,user_id')
    .eq('id', sharedWordbookId)
    .maybeSingle<{ id: string; user_id: string }>();

  if (error) {
    throw new Error(error.message || 'shared_wordbook_tags_lookup_failed');
  }
  if (!row) {
    throw new SharedWordbookError('not_found', 'shared_wordbook_not_found');
  }
  if (row.user_id !== userId) {
    throw new SharedWordbookError('forbidden', 'shared_wordbook_not_owned');
  }

  const tags = normalizeSharedTags(sharedTags);

  let tagsEmbedding: number[] | null = null;
  try {
    tagsEmbedding = await createSharedTagsEmbedding(tags);
  } catch (embeddingError) {
    console.warn('[shared-wordbooks] tag embedding skipped:', embeddingError);
  }

  const payload: Record<string, unknown> = {
    shared_tags: tags,
    updated_at: new Date().toISOString(),
  };
  if (tagsEmbedding) {
    payload.shared_tags_embedding = tagsEmbedding;
  }

  const { data: updated, error: updateError } = await admin
    .from('shared_wordbooks')
    .update(payload)
    .eq('id', sharedWordbookId)
    .select(SHARED_WORDBOOK_SELECT)
    .single<SharedWordbookRow>();

  if (updateError || !updated) {
    throw new Error(updateError?.message || 'shared_wordbook_tags_update_failed');
  }

  const profileByUserId = await getProfilesByUserIds(admin, [userId]);
  return mapSharedWordbookCard(updated, 'owner', profileByUserId);
}

export async function unpublishSharedWordbook(
  userId: string,
  sharedWordbookId: string,
  admin: SupabaseAdminClient = getSupabaseAdmin(),
): Promise<void> {
  const { data: row, error } = await admin
    .from('shared_wordbooks')
    .select('id,user_id')
    .eq('id', sharedWordbookId)
    .maybeSingle<{ id: string; user_id: string }>();

  if (error) {
    throw new Error(error.message || 'shared_wordbook_unpublish_lookup_failed');
  }
  if (!row) {
    throw new SharedWordbookError('not_found', 'shared_wordbook_not_found');
  }
  if (row.user_id !== userId) {
    throw new SharedWordbookError('forbidden', 'shared_wordbook_not_owned');
  }

  const { error: deleteError } = await admin
    .from('shared_wordbooks')
    .delete()
    .eq('id', sharedWordbookId);

  if (deleteError) {
    throw new Error(deleteError.message || 'shared_wordbook_unpublish_failed');
  }
}

// ============ Likes ============

export async function getSharedWordbookLikeState(
  shareId: string,
  userId: string | null,
  admin: SupabaseAdminClient = getSupabaseAdmin(),
): Promise<{ liked: boolean; likeCount: number } | null> {
  const row = await getSharedWordbookByShareId(shareId, admin);
  if (!row) return null;

  let liked = false;
  if (userId) {
    const { data } = await admin
      .from('shared_wordbook_likes')
      .select('id')
      .eq('shared_wordbook_id', row.id)
      .eq('user_id', userId)
      .maybeSingle<{ id: string }>();
    liked = Boolean(data);
  }

  return { liked, likeCount: Number(row.like_count ?? 0) };
}

export async function setSharedWordbookLike(
  shareId: string,
  userId: string,
  liked: boolean,
  admin: SupabaseAdminClient = getSupabaseAdmin(),
): Promise<{ liked: boolean; likeCount: number } | null> {
  const row = await getSharedWordbookByShareId(shareId, admin);
  if (!row) return null;

  if (liked) {
    await admin
      .from('shared_wordbook_likes')
      .upsert(
        [{ shared_wordbook_id: row.id, user_id: userId }],
        { onConflict: 'shared_wordbook_id,user_id', ignoreDuplicates: true },
      );
  } else {
    await admin
      .from('shared_wordbook_likes')
      .delete()
      .eq('shared_wordbook_id', row.id)
      .eq('user_id', userId);
  }

  const { count } = await admin
    .from('shared_wordbook_likes')
    .select('*', { count: 'exact', head: true })
    .eq('shared_wordbook_id', row.id);

  const likeCount = count ?? 0;
  await admin
    .from('shared_wordbooks')
    .update({ like_count: likeCount })
    .eq('id', row.id);

  return { liked, likeCount };
}

export type { Project };
