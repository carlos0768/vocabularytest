import { getSupabaseAdmin } from '@/lib/supabase/admin';
import {
  ensureFriendProfile,
  normalizeAccountIdInput,
  buildDefaultAccountId,
  getFriendSchemaIssue,
} from '@/lib/friends/server';
import type { FriendProfile, FriendTimelineSession, QuizSessionWordSummary } from '@/lib/friends/types';
import type {
  FollowStatus,
  FollowRelationship,
  FollowSummary,
  FollowSearchResult,
  FollowsHomePayload,
  FollowNotification,
} from './types';

type SupabaseAdminClient = ReturnType<typeof getSupabaseAdmin>;

type ProfileRow = {
  user_id: string;
  username: string | null;
  display_name: string | null;
  user_handle?: string | null;
  account_id?: string | null;
  is_public?: boolean;
};

type FollowRow = {
  id: string;
  follower_id: string;
  following_id: string;
  status: FollowStatus;
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

const FOLLOW_SELECT = 'id,follower_id,following_id,status,created_at,responded_at';
const PROFILE_SELECT = 'user_id,username,display_name,user_handle,account_id,is_public';
const PROFILE_ACCOUNT_SELECT = 'user_id,username,account_id';
const PROFILE_BASIC_SELECT = 'user_id,username';
const QUIZ_SESSION_SELECT = 'id,user_id,started_at,expires_at,last_answered_at,answer_count,mastered_count';
const ACCOUNT_ID_PATTERN = /^[a-z0-9_]{3,24}$/;

function isProfileSchemaIssue(error: unknown): boolean {
  const issue = getFriendSchemaIssue(error);
  return issue === 'profiles_account_id'
    || issue === 'profiles_display_name'
    || issue === 'profiles_user_handle'
    || issue === 'profiles_is_public';
}

function toProfile(row: ProfileRow): FriendProfile {
  return {
    userId: row.user_id,
    username: row.display_name?.trim() || row.username?.trim() || row.user_handle?.trim() || null,
    accountId: row.account_id?.trim() || row.user_handle?.trim() || buildDefaultAccountId(row.user_id),
  };
}

function fallbackProfile(userId: string): FriendProfile {
  return { userId, username: null, accountId: buildDefaultAccountId(userId) };
}

function isUniqueViolation(error: { code?: string | null } | null | undefined): boolean {
  return error?.code === '23505';
}

export async function getProfilesByUserIds(
  userIds: string[],
  admin: SupabaseAdminClient,
): Promise<Map<string, FriendProfile>> {
  const map = new Map<string, FriendProfile>();
  const uniqueIds = [...new Set(userIds.filter(Boolean))];
  if (uniqueIds.length === 0) return map;

  const { data, error } = await admin
    .from('profiles')
    .select(PROFILE_SELECT)
    .in('user_id', uniqueIds);

  if (error) {
    if (isProfileSchemaIssue(error)) {
      const fallback = await getProfilesByUserIdsCompat(uniqueIds, admin);
      if (fallback) return fallback;
    }
    for (const uid of uniqueIds) map.set(uid, fallbackProfile(uid));
    return map;
  }

  for (const row of (data ?? []) as ProfileRow[]) {
    map.set(row.user_id, toProfile(row));
  }
  for (const uid of uniqueIds) {
    if (!map.has(uid)) map.set(uid, fallbackProfile(uid));
  }
  return map;
}

async function getProfilesByUserIdsCompat(
  userIds: string[],
  admin: SupabaseAdminClient,
): Promise<Map<string, FriendProfile> | null> {
  const map = new Map<string, FriendProfile>();
  const account = await admin
    .from('profiles')
    .select(PROFILE_ACCOUNT_SELECT)
    .in('user_id', userIds);

  if (!account.error) {
    for (const row of (account.data ?? []) as ProfileRow[]) {
      map.set(row.user_id, toProfile(row));
    }
    for (const uid of userIds) {
      if (!map.has(uid)) map.set(uid, fallbackProfile(uid));
    }
    return map;
  }

  if (!isProfileSchemaIssue(account.error)) return null;

  const basic = await admin
    .from('profiles')
    .select(PROFILE_BASIC_SELECT)
    .in('user_id', userIds);

  if (basic.error) return null;

  for (const row of (basic.data ?? []) as ProfileRow[]) {
    map.set(row.user_id, toProfile(row));
  }
  for (const uid of userIds) {
    if (!map.has(uid)) map.set(uid, fallbackProfile(uid));
  }
  return map;
}

function toFollowSummary(
  row: FollowRow,
  viewerUserId: string,
  profilesByUserId: Map<string, FriendProfile>,
): FollowSummary {
  const otherUserId = row.follower_id === viewerUserId ? row.following_id : row.follower_id;
  return {
    id: row.id,
    followerId: row.follower_id,
    followingId: row.following_id,
    status: row.status,
    createdAt: row.created_at,
    respondedAt: row.responded_at,
    profile: profilesByUserId.get(otherUserId) ?? fallbackProfile(otherUserId),
  };
}

export async function listFollowsHome(
  userId: string,
  admin: SupabaseAdminClient = getSupabaseAdmin(),
): Promise<FollowsHomePayload> {
  const profile = await ensureFriendProfile(userId, admin);

  const { data: followRows, error } = await admin
    .from('user_follows')
    .select(FOLLOW_SELECT)
    .or(`follower_id.eq.${userId},following_id.eq.${userId}`)
    .order('created_at', { ascending: false });

  if (error) {
    if (getFriendSchemaIssue(error) === 'user_follows') {
      return {
        profile,
        following: [],
        followers: [],
        pendingIncoming: [],
        pendingOutgoing: [],
      };
    }
    throw new Error(error.message || 'follows_lookup_failed');
  }

  const rows = (followRows ?? []) as FollowRow[];
  const otherUserIds = rows.map((r) =>
    r.follower_id === userId ? r.following_id : r.follower_id,
  );
  const profilesByUserId = await getProfilesByUserIds(otherUserIds, admin);

  const summaries = rows.map((r) => toFollowSummary(r, userId, profilesByUserId));

  return {
    profile,
    following: summaries.filter((s) => s.followerId === userId && s.status === 'active'),
    followers: summaries.filter((s) => s.followingId === userId && s.status === 'active'),
    pendingIncoming: summaries.filter((s) => s.followingId === userId && s.status === 'pending'),
    pendingOutgoing: summaries.filter((s) => s.followerId === userId && s.status === 'pending'),
  };
}

export async function listFollowNotifications(
  userId: string,
  admin: SupabaseAdminClient = getSupabaseAdmin(),
): Promise<FollowNotification[]> {
  const home = await listFollowsHome(userId, admin);

  return home.pendingIncoming.map((item) => ({
    id: item.id,
    followId: item.id,
    createdAt: item.createdAt,
    profile: item.profile,
  }));
}

export class FollowError extends Error {
  constructor(readonly code: 'invalid_account_id' | 'target_not_found' | 'self_follow' | 'not_found' | 'not_authorized') {
    super(code);
    this.name = 'FollowError';
  }
}

export async function followUser(
  userId: string,
  targetAccountId: string,
  admin: SupabaseAdminClient = getSupabaseAdmin(),
): Promise<FollowSummary> {
  await ensureFriendProfile(userId, admin);

  const normalized = normalizeAccountIdInput(targetAccountId);
  if (!ACCOUNT_ID_PATTERN.test(normalized)) {
    throw new FollowError('invalid_account_id');
  }

  const { data: targetRow, error: targetError } = await findProfileByPublicId(normalized, admin);

  if (targetError) throw new Error(targetError.message || 'target_profile_lookup_failed');
  if (!targetRow) throw new FollowError('target_not_found');
  if (targetRow.user_id === userId) throw new FollowError('self_follow');

  const targetProfile = toProfile(targetRow);
  const isPublic = targetRow.is_public ?? true;

  const { data: existing } = await admin
    .from('user_follows')
    .select(FOLLOW_SELECT)
    .eq('follower_id', userId)
    .eq('following_id', targetProfile.userId)
    .maybeSingle<FollowRow>();

  if (existing) {
    return toFollowSummary(existing, userId, new Map([[targetProfile.userId, targetProfile]]));
  }

  const status: FollowStatus = isPublic ? 'active' : 'pending';

  const { data, error } = await admin
    .from('user_follows')
    .insert({
      follower_id: userId,
      following_id: targetProfile.userId,
      status,
      responded_at: isPublic ? new Date().toISOString() : null,
    })
    .select(FOLLOW_SELECT)
    .single<FollowRow>();

  if (error || !data) {
    if (isUniqueViolation(error)) {
      const { data: retry } = await admin
        .from('user_follows')
        .select(FOLLOW_SELECT)
        .eq('follower_id', userId)
        .eq('following_id', targetProfile.userId)
        .maybeSingle<FollowRow>();
      if (retry) return toFollowSummary(retry, userId, new Map([[targetProfile.userId, targetProfile]]));
    }
    throw new Error(error?.message || 'follow_create_failed');
  }

  return toFollowSummary(data, userId, new Map([[targetProfile.userId, targetProfile]]));
}

async function findProfileByPublicId(
  publicId: string,
  admin: SupabaseAdminClient,
): Promise<{ data: ProfileRow | null; error: { message?: string | null } | null }> {
  const byAccount = await admin
    .from('profiles')
    .select(PROFILE_SELECT)
    .eq('account_id', publicId)
    .maybeSingle<ProfileRow>();

  if (!byAccount.error && byAccount.data) return { data: byAccount.data, error: null };
  if (byAccount.error && !isProfileSchemaIssue(byAccount.error)) {
    return { data: null, error: byAccount.error };
  }

  const byHandle = await admin
    .from('profiles')
    .select('user_id,username,display_name,user_handle,is_public')
    .eq('user_handle', publicId)
    .maybeSingle<ProfileRow>();

  if (!byHandle.error) return { data: byHandle.data ?? null, error: null };
  if (!isProfileSchemaIssue(byHandle.error)) return { data: null, error: byHandle.error };

  const byHandleBasic = await admin
    .from('profiles')
    .select('user_id,username,user_handle')
    .eq('user_handle', publicId)
    .maybeSingle<ProfileRow>();

  if (!byHandleBasic.error) return { data: byHandleBasic.data ?? null, error: null };
  if (!isProfileSchemaIssue(byHandleBasic.error)) return { data: null, error: byHandleBasic.error };

  const byUsername = await admin
    .from('profiles')
    .select(PROFILE_BASIC_SELECT)
    .eq('username', publicId)
    .maybeSingle<ProfileRow>();

  if (byUsername.error) return { data: null, error: byUsername.error };
  return { data: byUsername.data ?? null, error: null };
}

/**
 * Resolve a public identifier (accountId / handle / username) to a FriendProfile.
 * Returns null when not found. Used by the public profile page.
 */
export async function resolvePublicProfile(
  publicId: string,
  admin: SupabaseAdminClient = getSupabaseAdmin(),
): Promise<FriendProfile | null> {
  const { data, error } = await findProfileByPublicId(publicId, admin);
  if (error || !data) return null;
  return toProfile(data);
}

export async function unfollowUser(
  userId: string,
  followId: string,
  admin: SupabaseAdminClient = getSupabaseAdmin(),
): Promise<void> {
  const { data: existing, error: lookupError } = await admin
    .from('user_follows')
    .select(FOLLOW_SELECT)
    .eq('id', followId)
    .maybeSingle<FollowRow>();

  if (lookupError) throw new Error(lookupError.message || 'follow_lookup_failed');
  if (!existing) throw new FollowError('not_found');
  if (existing.follower_id !== userId && existing.following_id !== userId) {
    throw new FollowError('not_authorized');
  }

  const { error } = await admin
    .from('user_follows')
    .delete()
    .eq('id', followId);

  if (error) throw new Error(error.message || 'follow_delete_failed');
}

export async function respondToFollowRequest(
  userId: string,
  followId: string,
  action: 'accept' | 'decline',
  admin: SupabaseAdminClient = getSupabaseAdmin(),
): Promise<FollowSummary | null> {
  const { data: existing, error: lookupError } = await admin
    .from('user_follows')
    .select(FOLLOW_SELECT)
    .eq('id', followId)
    .maybeSingle<FollowRow>();

  if (lookupError) throw new Error(lookupError.message || 'follow_request_lookup_failed');
  if (!existing) throw new FollowError('not_found');
  if (existing.following_id !== userId) throw new FollowError('not_authorized');

  if (action === 'decline') {
    const { error } = await admin
      .from('user_follows')
      .delete()
      .eq('id', followId);
    if (error) throw new Error(error.message || 'follow_request_decline_failed');
    return null;
  }

  const { data, error } = await admin
    .from('user_follows')
    .update({
      status: 'active',
      responded_at: new Date().toISOString(),
    })
    .eq('id', followId)
    .select(FOLLOW_SELECT)
    .single<FollowRow>();

  if (error || !data) throw new Error(error?.message || 'follow_request_accept_failed');

  const profileMap = await getProfilesByUserIds([existing.follower_id], admin);
  return toFollowSummary(data, userId, profileMap);
}

export async function searchUsersForFollow(
  userId: string,
  query: string,
  admin: SupabaseAdminClient = getSupabaseAdmin(),
): Promise<FollowSearchResult[]> {
  const normalizedAccountId = normalizeAccountIdInput(query);
  const normalizedText = query.trim().replace(/^@+/, '').replace(/[%_,]/g, ' ').replace(/\s+/g, ' ').slice(0, 50);
  if (!normalizedAccountId && !normalizedText) return [];

  await ensureFriendProfile(userId, admin);

  const exactAccountQuery = ACCOUNT_ID_PATTERN.test(normalizedAccountId)
    ? admin
        .from('profiles')
        .select(PROFILE_SELECT)
        .eq('account_id', normalizedAccountId)
        .neq('user_id', userId)
        .limit(10)
    : Promise.resolve({ data: [], error: null });

  const usernameQuery = normalizedText
    ? admin
        .from('profiles')
        .select(PROFILE_SELECT)
        .ilike('username', `%${normalizedText}%`)
        .neq('user_id', userId)
        .limit(20)
    : Promise.resolve({ data: [], error: null });

  const displayNameQuery = normalizedText
    ? admin
        .from('profiles')
        .select(PROFILE_SELECT)
        .ilike('display_name', `%${normalizedText}%`)
        .neq('user_id', userId)
        .limit(20)
    : Promise.resolve({ data: [], error: null });

  const handleQuery = normalizedText
    ? admin
        .from('profiles')
        .select(PROFILE_SELECT)
        .ilike('user_handle', `%${normalizedText}%`)
        .neq('user_id', userId)
        .limit(20)
    : Promise.resolve({ data: [], error: null });

  const [exactResult, usernameResult, displayNameResult, handleResult] = await Promise.all([
    exactAccountQuery, usernameQuery, displayNameQuery, handleQuery,
  ]);

  const hasProfileSchemaIssue = [exactResult, usernameResult, displayNameResult, handleResult]
    .some((result) => result.error && isProfileSchemaIssue(result.error));

  if (exactResult.error && !isProfileSchemaIssue(exactResult.error)) throw new Error(exactResult.error.message || 'account_search_failed');
  if (usernameResult.error && !isProfileSchemaIssue(usernameResult.error)) throw new Error(usernameResult.error.message || 'username_search_failed');
  if (displayNameResult.error && !isProfileSchemaIssue(displayNameResult.error)) throw new Error(displayNameResult.error.message || 'display_name_search_failed');
  if (handleResult.error && !isProfileSchemaIssue(handleResult.error)) throw new Error(handleResult.error.message || 'handle_search_failed');

  const profilesByUserId = new Map<string, ProfileRow>();
  for (const row of [
    ...(exactResult.error ? [] : exactResult.data ?? []),
    ...(usernameResult.error ? [] : usernameResult.data ?? []),
    ...(displayNameResult.error ? [] : displayNameResult.data ?? []),
    ...(handleResult.error ? [] : handleResult.data ?? []),
  ] as ProfileRow[]) {
    profilesByUserId.set(row.user_id, row);
  }

  if (profilesByUserId.size === 0 && hasProfileSchemaIssue && normalizedText) {
    for (const row of await searchProfilesCompat(userId, normalizedText, admin)) {
      profilesByUserId.set(row.user_id, row);
    }
  }

  if (profilesByUserId.size === 0) return [];

  const candidateIds = [...profilesByUserId.keys()];
  const { data: followRows, error: followError } = await admin
    .from('user_follows')
    .select(FOLLOW_SELECT)
    .or(`follower_id.eq.${userId},following_id.eq.${userId}`);

  if (followError) {
    if (getFriendSchemaIssue(followError) === 'user_follows') {
      return [...profilesByUserId.values()].map((row) => ({
        ...toProfile(row),
        isPublic: row.is_public ?? true,
        relationship: 'none',
        followId: null,
      }));
    }
    throw new Error(followError.message || 'follow_search_lookup_failed');
  }

  const outgoing = new Map<string, FollowRow>();
  const incoming = new Map<string, FollowRow>();
  for (const row of (followRows ?? []) as FollowRow[]) {
    if (row.follower_id === userId) outgoing.set(row.following_id, row);
    if (row.following_id === userId) incoming.set(row.follower_id, row);
  }

  return [...profilesByUserId.values()]
    .filter((row) => candidateIds.includes(row.user_id))
    .map((row) => {
      const profile = toProfile(row);
      const outRow = outgoing.get(row.user_id);
      const inRow = incoming.get(row.user_id);

      let relationship: FollowRelationship = 'none';
      let followId: string | null = null;

      if (outRow && outRow.status === 'active' && inRow && inRow.status === 'active') {
        relationship = 'mutual';
        followId = outRow.id;
      } else if (outRow?.status === 'active') {
        relationship = 'following';
        followId = outRow.id;
      } else if (outRow?.status === 'pending') {
        relationship = 'pending';
        followId = outRow.id;
      }

      return {
        ...profile,
        isPublic: row.is_public ?? true,
        relationship,
        followId,
      };
    });
}

async function searchProfilesCompat(
  userId: string,
  text: string,
  admin: SupabaseAdminClient,
): Promise<ProfileRow[]> {
  const rows: ProfileRow[] = [];

  const username = await admin
    .from('profiles')
    .select(PROFILE_BASIC_SELECT)
    .ilike('username', `%${text}%`)
    .neq('user_id', userId)
    .limit(20);

  if (!username.error) rows.push(...((username.data ?? []) as ProfileRow[]));

  const handle = await admin
    .from('profiles')
    .select('user_id,username,user_handle')
    .ilike('user_handle', `%${text}%`)
    .neq('user_id', userId)
    .limit(20);

  if (!handle.error) rows.push(...((handle.data ?? []) as ProfileRow[]));

  return rows;
}

async function getActiveFollowingUserIds(
  userId: string,
  admin: SupabaseAdminClient,
): Promise<string[]> {
  const { data, error } = await admin
    .from('user_follows')
    .select('following_id')
    .eq('follower_id', userId)
    .eq('status', 'active');

  if (error) {
    if (getFriendSchemaIssue(error) === 'user_follows') return [];
    throw new Error(error.message || 'following_ids_lookup_failed');
  }
  return (data ?? []).map((row: { following_id: string }) => row.following_id);
}

async function getGroupMemberUserIds(
  userId: string,
  admin: SupabaseAdminClient,
): Promise<string[]> {
  const { data: myGroups, error: groupError } = await admin
    .from('study_group_members')
    .select('group_id')
    .eq('user_id', userId);

  if (groupError || !myGroups?.length) return [];

  const groupIds = (myGroups as { group_id: string }[]).map((r) => r.group_id);

  const { data: memberRows, error: memberError } = await admin
    .from('study_group_members')
    .select('user_id')
    .in('group_id', groupIds)
    .neq('user_id', userId);

  if (memberError) return [];
  return [...new Set((memberRows ?? []).map((r: { user_id: string }) => r.user_id))];
}

async function getAcceptedFriendUserIds(
  userId: string,
  admin: SupabaseAdminClient,
): Promise<string[]> {
  const { data, error } = await admin
    .from('user_friendships')
    .select('requester_id,addressee_id')
    .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
    .eq('status', 'accepted');

  if (error) return [];
  return (data ?? []).map((row: { requester_id: string; addressee_id: string }) =>
    row.requester_id === userId ? row.addressee_id : row.requester_id,
  );
}

export async function listFollowTimeline(
  userId: string,
  admin: SupabaseAdminClient = getSupabaseAdmin(),
  limit = 40,
): Promise<FriendTimelineSession[]> {
  await ensureFriendProfile(userId, admin);

  const [followingIds, groupMemberIds, friendIds] = await Promise.all([
    getActiveFollowingUserIds(userId, admin),
    getGroupMemberUserIds(userId, admin),
    getAcceptedFriendUserIds(userId, admin),
  ]);

  const visibleUserIds = [...new Set([userId, ...followingIds, ...groupMemberIds, ...friendIds])];

  const { data: sessionRows, error: sessionError } = await admin
    .from('quiz_sessions')
    .select(QUIZ_SESSION_SELECT)
    .in('user_id', visibleUserIds)
    .order('started_at', { ascending: false })
    .limit(Math.max(1, Math.min(limit, 80)));

  if (sessionError) {
    if (getFriendSchemaIssue(sessionError) === 'quiz_sessions') return [];
    throw new Error(sessionError.message || 'timeline_sessions_lookup_failed');
  }

  const sessions = (sessionRows ?? []) as QuizSessionRow[];
  const sessionIds = sessions.map((s) => s.id);
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
  for (const id of sessionIds) map.set(id, []);
  if (sessionIds.length === 0) return map;

  const { data, error } = await admin
    .from('quiz_session_words')
    .select('id,session_id,user_id,word_id,project_id,english,japanese,mastered_at')
    .in('session_id', sessionIds)
    .order('mastered_at', { ascending: true });

  if (error) {
    if (getFriendSchemaIssue(error) === 'quiz_session_words') return map;
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
