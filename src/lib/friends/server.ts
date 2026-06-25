import { getSupabaseAdmin } from '@/lib/supabase/admin';
import type {
  FriendProfile,
  FriendSearchRelationship,
  FriendSearchResult,
  FriendshipStatus,
  FriendshipSummary,
  FriendsHomePayload,
  FriendTimelineSession,
  QuizSessionWordSummary,
} from '@/lib/friends/types';

type SupabaseAdminClient = ReturnType<typeof getSupabaseAdmin>;

type ProfileRow = {
  user_id: string;
  username: string | null;
  account_id: string | null;
};

type FriendshipRow = {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: FriendshipStatus;
  created_at: string;
  responded_at: string | null;
};

type QuizSessionRow = {
  id: string;
  user_id: string;
  started_at: string;
  expires_at: string;
  last_answered_at: string;
  answer_count: number | string | null;
  mastered_count: number | string | null;
};

type QuizSessionWordRow = {
  id: string;
  session_id: string;
  user_id: string;
  word_id: string;
  project_id: string | null;
  english: string;
  japanese: string;
  mastered_at: string;
};

type SupabaseLikeError = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
};

type FriendSchemaDependency =
  | 'profiles_account_id'
  | 'user_friendships'
  | 'quiz_sessions'
  | 'quiz_session_words';

export type QuizSessionAnswerEvent = {
  wordId: string;
  projectId?: string | null;
  english: string;
  japanese: string;
  becameMastered: boolean;
};

const FRIENDSHIP_SELECT = 'id,requester_id,addressee_id,status,created_at,responded_at';
const PROFILE_SELECT = 'user_id,username,account_id';
const QUIZ_SESSION_SELECT = 'id,user_id,started_at,expires_at,last_answered_at,answer_count,mastered_count';
const ACCOUNT_ID_PATTERN = /^[a-z0-9_]{4,24}$/;
const SESSION_LENGTH_MS = 30 * 60 * 1000;
const SKIPPED_SESSION_RECORD = { sessionId: '', masteredRecorded: false };

export function normalizeAccountIdInput(input: string): string {
  return input
    .trim()
    .replace(/^@+/, '')
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, 24);
}

export function buildDefaultAccountId(userId: string): string {
  const compact = userId.replace(/[^a-fA-F0-9]/g, '').toLowerCase();
  return `mk${compact.slice(0, 12)}`.slice(0, 24);
}

function normalizeSearchText(input: string): string {
  return input
    .trim()
    .replace(/^@+/, '')
    .replace(/[%_,]/g, ' ')
    .replace(/\s+/g, ' ')
    .slice(0, 50);
}

function isUniqueViolation(error: { code?: string | null } | null | undefined): boolean {
  return error?.code === '23505';
}

function normalizeErrorText(error: unknown): string {
  if (!error) return '';
  if (typeof error === 'string') return error.toLowerCase();

  const maybeError = error as SupabaseLikeError;
  const parts = [
    error instanceof Error ? error.message : '',
    maybeError.code ?? '',
    maybeError.message ?? '',
    maybeError.details ?? '',
    maybeError.hint ?? '',
  ];

  return parts.join(' ').trim().toLowerCase();
}

function getFriendSchemaIssue(error: unknown): FriendSchemaDependency | null {
  const normalized = normalizeErrorText(error);
  if (!normalized) return null;

  if (
    normalized.includes('account_id')
    && (
      normalized.includes('does not exist')
      || normalized.includes('column')
      || normalized.includes('schema cache')
      || normalized.includes('could not find')
    )
  ) {
    return 'profiles_account_id';
  }

  for (const table of ['user_friendships', 'quiz_sessions', 'quiz_session_words'] as const) {
    if (
      normalized.includes(table)
      && (
        normalized.includes('does not exist')
        || normalized.includes('relation')
        || normalized.includes('schema cache')
        || normalized.includes('could not find')
      )
    ) {
      return table;
    }
  }

  return null;
}

function toProfile(row: ProfileRow): FriendProfile {
  return {
    userId: row.user_id,
    username: row.username ?? null,
    accountId: row.account_id ?? buildDefaultAccountId(row.user_id),
  };
}

function fallbackProfile(userId: string): FriendProfile {
  return {
    userId,
    username: null,
    accountId: buildDefaultAccountId(userId),
  };
}

function profileRowsWithoutAccountId(
  rows: Array<{ user_id: string; username: string | null }> | null | undefined,
): ProfileRow[] {
  return (rows ?? []).map((row) => ({
    user_id: row.user_id,
    username: row.username ?? null,
    account_id: null,
  }));
}

function friendOtherUserId(row: FriendshipRow, userId: string): string {
  return row.requester_id === userId ? row.addressee_id : row.requester_id;
}

function toFriendshipSummary(
  row: FriendshipRow,
  viewerUserId: string,
  profilesByUserId: Map<string, FriendProfile>,
): FriendshipSummary {
  const otherUserId = friendOtherUserId(row, viewerUserId);
  return {
    id: row.id,
    status: row.status,
    requesterId: row.requester_id,
    addresseeId: row.addressee_id,
    createdAt: row.created_at,
    respondedAt: row.responded_at,
    profile: profilesByUserId.get(otherUserId) ?? fallbackProfile(otherUserId),
  };
}

function friendshipRelationship(row: FriendshipRow | undefined, viewerUserId: string): FriendSearchRelationship {
  if (!row) return 'none';
  if (row.status === 'accepted') return 'friend';
  return row.requester_id === viewerUserId ? 'outgoing' : 'incoming';
}

async function getProfilesByUserIds(
  userIds: string[],
  admin: SupabaseAdminClient = getSupabaseAdmin(),
): Promise<Map<string, FriendProfile>> {
  const map = new Map<string, FriendProfile>();
  const uniqueIds = [...new Set(userIds.filter(Boolean))];
  if (uniqueIds.length === 0) return map;

  const { data, error } = await admin
    .from('profiles')
    .select(PROFILE_SELECT)
    .in('user_id', uniqueIds);

  if (error) {
    if (getFriendSchemaIssue(error) === 'profiles_account_id') {
      const fallback = await admin
        .from('profiles')
        .select('user_id,username')
        .in('user_id', uniqueIds);

      if (!fallback.error) {
        for (const row of (fallback.data ?? []) as Array<{ user_id: string; username: string | null }>) {
          map.set(row.user_id, toProfile({ user_id: row.user_id, username: row.username ?? null, account_id: null }));
        }
        for (const userId of uniqueIds) {
          if (!map.has(userId)) map.set(userId, fallbackProfile(userId));
        }
        return map;
      }
    }

    console.warn('[friends] profile lookup failed:', error.message);
    for (const userId of uniqueIds) map.set(userId, fallbackProfile(userId));
    return map;
  }

  for (const row of (data ?? []) as ProfileRow[]) {
    map.set(row.user_id, toProfile(row));
  }
  for (const userId of uniqueIds) {
    if (!map.has(userId)) map.set(userId, fallbackProfile(userId));
  }

  return map;
}

export async function ensureFriendProfile(
  userId: string,
  admin: SupabaseAdminClient = getSupabaseAdmin(),
): Promise<FriendProfile> {
  const { data: existing, error: selectError } = await admin
    .from('profiles')
    .select(PROFILE_SELECT)
    .eq('user_id', userId)
    .maybeSingle<ProfileRow>();

  if (selectError) {
    if (getFriendSchemaIssue(selectError) === 'profiles_account_id') {
      const fallback = await admin
        .from('profiles')
        .select('user_id,username')
        .eq('user_id', userId)
        .maybeSingle<{ user_id: string; username: string | null }>();

      if (!fallback.error && fallback.data) {
        return toProfile({ user_id: fallback.data.user_id, username: fallback.data.username ?? null, account_id: null });
      }

      const inserted = await admin
        .from('profiles')
        .upsert({ user_id: userId }, { onConflict: 'user_id' })
        .select('user_id,username')
        .single<{ user_id: string; username: string | null }>();

      if (!inserted.error && inserted.data) {
        return toProfile({ user_id: inserted.data.user_id, username: inserted.data.username ?? null, account_id: null });
      }

      console.warn('[friends] profile upsert fallback failed:', inserted.error?.message);
      return fallbackProfile(userId);
    }

    throw new Error(selectError.message || 'profile_lookup_failed');
  }

  if (existing?.account_id) {
    return toProfile(existing);
  }

  const defaultAccountId = buildDefaultAccountId(userId);
  const { data, error } = await admin
    .from('profiles')
    .upsert(
      { user_id: userId, account_id: defaultAccountId },
      { onConflict: 'user_id' },
    )
    .select(PROFILE_SELECT)
    .single<ProfileRow>();

  if (error || !data) {
    if (getFriendSchemaIssue(error) === 'profiles_account_id') {
      return toProfile({
        user_id: userId,
        username: existing?.username ?? null,
        account_id: null,
      });
    }
    throw new Error(error?.message || 'profile_upsert_failed');
  }

  return toProfile(data);
}

async function getFriendshipRowsForUser(
  userId: string,
  admin: SupabaseAdminClient = getSupabaseAdmin(),
): Promise<FriendshipRow[]> {
  const { data, error } = await admin
    .from('user_friendships')
    .select(FRIENDSHIP_SELECT)
    .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
    .order('created_at', { ascending: false });

  if (error) {
    if (getFriendSchemaIssue(error) === 'user_friendships') {
      console.warn('[friends] friendship schema unavailable; returning empty list');
      return [];
    }
    throw new Error(error.message || 'friendships_lookup_failed');
  }

  return (data ?? []) as FriendshipRow[];
}

export async function listFriendsHome(
  userId: string,
  admin: SupabaseAdminClient = getSupabaseAdmin(),
): Promise<FriendsHomePayload> {
  const [profile, rows] = await Promise.all([
    ensureFriendProfile(userId, admin),
    getFriendshipRowsForUser(userId, admin),
  ]);
  const otherUserIds = rows.map((row) => friendOtherUserId(row, userId));
  const profilesByUserId = await getProfilesByUserIds(otherUserIds, admin);

  const summaries = rows.map((row) => toFriendshipSummary(row, userId, profilesByUserId));

  return {
    profile,
    friends: summaries.filter((item) => item.status === 'accepted'),
    incoming: summaries.filter((item) => item.status === 'pending' && item.addresseeId === userId),
    outgoing: summaries.filter((item) => item.status === 'pending' && item.requesterId === userId),
  };
}

export async function searchFriendProfiles(
  userId: string,
  query: string,
  admin: SupabaseAdminClient = getSupabaseAdmin(),
): Promise<FriendSearchResult[]> {
  const normalizedAccountId = normalizeAccountIdInput(query);
  const normalizedText = normalizeSearchText(query);
  if (!normalizedAccountId && !normalizedText) return [];

  await ensureFriendProfile(userId, admin);

  const exactAccountRows = ACCOUNT_ID_PATTERN.test(normalizedAccountId)
    ? await searchProfilesByAccountId(userId, normalizedAccountId, admin)
    : [];
  const usernameRows = normalizedText
    ? await searchProfilesByUsername(userId, normalizedText, admin)
    : [];

  const profilesByUserId = new Map<string, FriendProfile>();
  for (const row of [...exactAccountRows, ...usernameRows]) {
    profilesByUserId.set(row.user_id, toProfile(row));
  }

  if (profilesByUserId.size === 0) return [];

  const candidateIds = [...profilesByUserId.keys()];
  const { data: friendshipRows, error: friendshipError } = await admin
    .from('user_friendships')
    .select(FRIENDSHIP_SELECT)
    .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`);

  if (friendshipError) {
    if (getFriendSchemaIssue(friendshipError) === 'user_friendships') {
      return [...profilesByUserId.values()].map((profile) => ({
        ...profile,
        relationship: 'none',
        friendshipId: null,
      }));
    }
    throw new Error(friendshipError.message || 'friendship_search_lookup_failed');
  }

  const friendshipByOtherUserId = new Map<string, FriendshipRow>();
  for (const row of (friendshipRows ?? []) as FriendshipRow[]) {
    const otherUserId = friendOtherUserId(row, userId);
    if (candidateIds.includes(otherUserId)) {
      friendshipByOtherUserId.set(otherUserId, row);
    }
  }

  return [...profilesByUserId.values()].map((profile) => {
    const friendship = friendshipByOtherUserId.get(profile.userId);
    return {
      ...profile,
      relationship: friendshipRelationship(friendship, userId),
      friendshipId: friendship?.id ?? null,
    };
  });
}

async function searchProfilesByAccountId(
  userId: string,
  accountId: string,
  admin: SupabaseAdminClient,
): Promise<ProfileRow[]> {
  const { data, error } = await admin
    .from('profiles')
    .select(PROFILE_SELECT)
    .eq('account_id', accountId)
    .neq('user_id', userId)
    .limit(10);

  if (error) {
    if (getFriendSchemaIssue(error) === 'profiles_account_id') return [];
    throw new Error(error.message || 'account_search_failed');
  }

  return (data ?? []) as ProfileRow[];
}

async function searchProfilesByUsername(
  userId: string,
  text: string,
  admin: SupabaseAdminClient,
): Promise<ProfileRow[]> {
  const { data, error } = await admin
    .from('profiles')
    .select(PROFILE_SELECT)
    .ilike('username', `%${text}%`)
    .neq('user_id', userId)
    .limit(20);

  if (!error) return (data ?? []) as ProfileRow[];

  if (getFriendSchemaIssue(error) !== 'profiles_account_id') {
    throw new Error(error.message || 'username_search_failed');
  }

  const fallback = await admin
    .from('profiles')
    .select('user_id,username')
    .ilike('username', `%${text}%`)
    .neq('user_id', userId)
    .limit(20);

  if (fallback.error) {
    throw new Error(fallback.error.message || 'username_search_failed');
  }

  return profileRowsWithoutAccountId(fallback.data);
}

async function getFriendshipBetweenUsers(
  userId: string,
  otherUserId: string,
  admin: SupabaseAdminClient = getSupabaseAdmin(),
): Promise<FriendshipRow | null> {
  const { data, error } = await admin
    .from('user_friendships')
    .select(FRIENDSHIP_SELECT)
    .or(
      `and(requester_id.eq.${userId},addressee_id.eq.${otherUserId}),and(requester_id.eq.${otherUserId},addressee_id.eq.${userId})`,
    )
    .maybeSingle<FriendshipRow>();

  if (error) {
    if (getFriendSchemaIssue(error) === 'user_friendships') {
      return null;
    }
    throw new Error(error.message || 'friendship_pair_lookup_failed');
  }

  return data ?? null;
}

export async function createFriendRequest(
  userId: string,
  targetAccountId: string,
  admin: SupabaseAdminClient = getSupabaseAdmin(),
): Promise<FriendshipSummary> {
  await ensureFriendProfile(userId, admin);

  const normalizedAccountId = normalizeAccountIdInput(targetAccountId);
  if (!ACCOUNT_ID_PATTERN.test(normalizedAccountId)) {
    throw new FriendRequestError('invalid_account_id');
  }

  const { data: targetProfileRow, error: targetError } = await admin
    .from('profiles')
    .select(PROFILE_SELECT)
    .eq('account_id', normalizedAccountId)
    .maybeSingle<ProfileRow>();

  if (targetError) {
    if (getFriendSchemaIssue(targetError) === 'profiles_account_id') {
      throw new FriendRequestError('target_not_found');
    }
    throw new Error(targetError.message || 'target_profile_lookup_failed');
  }
  if (!targetProfileRow?.account_id) {
    throw new FriendRequestError('target_not_found');
  }
  if (targetProfileRow.user_id === userId) {
    throw new FriendRequestError('self_request');
  }

  const targetProfile = toProfile(targetProfileRow);
  const existing = await getFriendshipBetweenUsers(userId, targetProfile.userId, admin);
  if (existing) {
    return toFriendshipSummary(existing, userId, new Map([[targetProfile.userId, targetProfile]]));
  }

  const { data, error } = await admin
    .from('user_friendships')
    .insert({
      requester_id: userId,
      addressee_id: targetProfile.userId,
      status: 'pending',
    })
    .select(FRIENDSHIP_SELECT)
    .single<FriendshipRow>();

  if (error || !data) {
    if (isUniqueViolation(error)) {
      const retry = await getFriendshipBetweenUsers(userId, targetProfile.userId, admin);
      if (retry) return toFriendshipSummary(retry, userId, new Map([[targetProfile.userId, targetProfile]]));
    }
    throw new Error(error?.message || 'friend_request_create_failed');
  }

  return toFriendshipSummary(data, userId, new Map([[targetProfile.userId, targetProfile]]));
}

export class FriendRequestError extends Error {
  constructor(readonly code: 'invalid_account_id' | 'target_not_found' | 'self_request' | 'not_found' | 'not_authorized') {
    super(code);
    this.name = 'FriendRequestError';
  }
}

export async function respondToFriendRequest(
  userId: string,
  friendshipId: string,
  action: 'accept' | 'decline',
  admin: SupabaseAdminClient = getSupabaseAdmin(),
): Promise<FriendshipSummary | null> {
  const { data: existing, error: lookupError } = await admin
    .from('user_friendships')
    .select(FRIENDSHIP_SELECT)
    .eq('id', friendshipId)
    .maybeSingle<FriendshipRow>();

  if (lookupError) {
    if (getFriendSchemaIssue(lookupError) === 'user_friendships') {
      throw new FriendRequestError('not_found');
    }
    throw new Error(lookupError.message || 'friend_request_lookup_failed');
  }
  if (!existing) throw new FriendRequestError('not_found');
  if (existing.addressee_id !== userId) throw new FriendRequestError('not_authorized');

  if (action === 'decline') {
    const { error } = await admin
      .from('user_friendships')
      .delete()
      .eq('id', friendshipId);

    if (error) throw new Error(error.message || 'friend_request_decline_failed');
    return null;
  }

  const { data, error } = await admin
    .from('user_friendships')
    .update({
      status: 'accepted',
      responded_at: new Date().toISOString(),
    })
    .eq('id', friendshipId)
    .select(FRIENDSHIP_SELECT)
    .single<FriendshipRow>();

  if (error || !data) {
    throw new Error(error?.message || 'friend_request_accept_failed');
  }

  const profileMap = await getProfilesByUserIds([friendOtherUserId(data, userId)], admin);
  return toFriendshipSummary(data, userId, profileMap);
}

export async function deleteFriendship(
  userId: string,
  friendshipId: string,
  admin: SupabaseAdminClient = getSupabaseAdmin(),
): Promise<void> {
  const { data: existing, error: lookupError } = await admin
    .from('user_friendships')
    .select(FRIENDSHIP_SELECT)
    .eq('id', friendshipId)
    .maybeSingle<FriendshipRow>();

  if (lookupError) {
    if (getFriendSchemaIssue(lookupError) === 'user_friendships') {
      throw new FriendRequestError('not_found');
    }
    throw new Error(lookupError.message || 'friendship_lookup_failed');
  }
  if (!existing) throw new FriendRequestError('not_found');
  if (existing.requester_id !== userId && existing.addressee_id !== userId) {
    throw new FriendRequestError('not_authorized');
  }

  const { error } = await admin
    .from('user_friendships')
    .delete()
    .eq('id', friendshipId);

  if (error) throw new Error(error.message || 'friendship_delete_failed');
}

async function getAcceptedFriendUserIds(
  userId: string,
  admin: SupabaseAdminClient = getSupabaseAdmin(),
): Promise<string[]> {
  const rows = await getFriendshipRowsForUser(userId, admin);
  return rows
    .filter((row) => row.status === 'accepted')
    .map((row) => friendOtherUserId(row, userId));
}

export async function listFriendTimeline(
  userId: string,
  admin: SupabaseAdminClient = getSupabaseAdmin(),
  limit = 40,
): Promise<FriendTimelineSession[]> {
  await ensureFriendProfile(userId, admin);
  const friendUserIds = await getAcceptedFriendUserIds(userId, admin);
  const visibleUserIds = [userId, ...friendUserIds];

  const { data: sessionRows, error: sessionError } = await admin
    .from('quiz_sessions')
    .select(QUIZ_SESSION_SELECT)
    .in('user_id', visibleUserIds)
    .order('started_at', { ascending: false })
    .limit(Math.max(1, Math.min(limit, 80)));

  if (sessionError) {
    if (getFriendSchemaIssue(sessionError) === 'quiz_sessions') {
      return [];
    }
    throw new Error(sessionError.message || 'timeline_sessions_lookup_failed');
  }

  const sessions = (sessionRows ?? []) as QuizSessionRow[];
  const sessionIds = sessions.map((session) => session.id);
  const [profilesByUserId, wordsBySessionId] = await Promise.all([
    getProfilesByUserIds(visibleUserIds, admin),
    getSessionWordsBySessionId(sessionIds, admin),
  ]);

  return sessions.map((session) => ({
    id: session.id,
    userId: session.user_id,
    profile: profilesByUserId.get(session.user_id) ?? fallbackProfile(session.user_id),
    startedAt: session.started_at,
    expiresAt: session.expires_at,
    lastAnsweredAt: session.last_answered_at,
    answerCount: Number(session.answer_count ?? 0),
    masteredCount: Number(session.mastered_count ?? 0),
    words: wordsBySessionId.get(session.id) ?? [],
  }));
}

async function getSessionWordsBySessionId(
  sessionIds: string[],
  admin: SupabaseAdminClient,
): Promise<Map<string, QuizSessionWordSummary[]>> {
  const map = new Map<string, QuizSessionWordSummary[]>();
  for (const sessionId of sessionIds) map.set(sessionId, []);
  if (sessionIds.length === 0) return map;

  const { data, error } = await admin
    .from('quiz_session_words')
    .select('id,session_id,user_id,word_id,project_id,english,japanese,mastered_at')
    .in('session_id', sessionIds)
    .order('mastered_at', { ascending: true });

  if (error) {
    if (getFriendSchemaIssue(error) === 'quiz_session_words') {
      return map;
    }
    throw new Error(error.message || 'timeline_words_lookup_failed');
  }

  for (const row of (data ?? []) as QuizSessionWordRow[]) {
    const words = map.get(row.session_id) ?? [];
    words.push({
      id: row.id,
      wordId: row.word_id,
      projectId: row.project_id,
      english: row.english,
      japanese: row.japanese,
      masteredAt: row.mastered_at,
    });
    map.set(row.session_id, words);
  }

  return map;
}

export async function recordQuizSessionAnswer(
  userId: string,
  event: QuizSessionAnswerEvent,
  admin: SupabaseAdminClient = getSupabaseAdmin(),
): Promise<{ sessionId: string; masteredRecorded: boolean }> {
  await ensureFriendProfile(userId, admin);

  const now = new Date();
  const nowIso = now.toISOString();
  const { data: activeSession, error: activeError } = await admin
    .from('quiz_sessions')
    .select(QUIZ_SESSION_SELECT)
    .eq('user_id', userId)
    .lte('started_at', nowIso)
    .gt('expires_at', nowIso)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle<QuizSessionRow>();

  if (activeError) {
    if (getFriendSchemaIssue(activeError) === 'quiz_sessions') {
      return SKIPPED_SESSION_RECORD;
    }
    throw new Error(activeError.message || 'active_session_lookup_failed');
  }

  let session = activeSession;
  if (!session) {
    const startedAt = nowIso;
    const expiresAt = new Date(now.getTime() + SESSION_LENGTH_MS).toISOString();
    const { data, error } = await admin
      .from('quiz_sessions')
      .insert({
        user_id: userId,
        started_at: startedAt,
        expires_at: expiresAt,
        last_answered_at: nowIso,
        answer_count: 0,
        mastered_count: 0,
      })
      .select(QUIZ_SESSION_SELECT)
      .single<QuizSessionRow>();

    if (error || !data) {
      if (getFriendSchemaIssue(error) === 'quiz_sessions') {
        return SKIPPED_SESSION_RECORD;
      }
      throw new Error(error?.message || 'quiz_session_create_failed');
    }
    session = data;
  }

  let masteredIncrement = 0;
  if (event.becameMastered) {
    let existingWord: { id: string } | null = null;
    const { data: existingWordResult, error: existingWordError } = await admin
      .from('quiz_session_words')
      .select('id')
      .eq('session_id', session.id)
      .eq('word_id', event.wordId)
      .maybeSingle<{ id: string }>();

    if (existingWordError) {
      if (getFriendSchemaIssue(existingWordError) === 'quiz_session_words') {
        existingWord = { id: '__schema_unavailable__' };
      } else {
        throw new Error(existingWordError.message || 'session_word_lookup_failed');
      }
    } else {
      existingWord = existingWordResult ?? null;
    }

    if (!existingWord) {
      const { error: insertWordError } = await admin
        .from('quiz_session_words')
        .insert({
          session_id: session.id,
          user_id: userId,
          word_id: event.wordId,
          project_id: event.projectId ?? null,
          english: event.english,
          japanese: event.japanese,
          mastered_at: nowIso,
        });

      if (insertWordError && !isUniqueViolation(insertWordError)) {
        if (getFriendSchemaIssue(insertWordError) === 'quiz_session_words') {
          masteredIncrement = 0;
        } else {
          throw new Error(insertWordError.message || 'session_word_insert_failed');
        }
      }
      if (!insertWordError) masteredIncrement = 1;
    }
  }

  const { error: updateError } = await admin
    .from('quiz_sessions')
    .update({
      last_answered_at: nowIso,
      answer_count: Number(session.answer_count ?? 0) + 1,
      mastered_count: Number(session.mastered_count ?? 0) + masteredIncrement,
    })
    .eq('id', session.id);

  if (updateError) {
    if (getFriendSchemaIssue(updateError) === 'quiz_sessions') {
      return SKIPPED_SESSION_RECORD;
    }
    throw new Error(updateError.message || 'quiz_session_update_failed');
  }

  return {
    sessionId: session.id,
    masteredRecorded: masteredIncrement > 0,
  };
}
