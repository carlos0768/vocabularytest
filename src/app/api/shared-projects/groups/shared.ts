import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { isActiveProSubscription } from '@/lib/subscription/status';
import type {
  PublicStudyGroupSummary,
  SharedProjectAccessRole,
  SharedProjectCard,
  SharedProjectMetrics,
  StudyGroupFeedEvent,
  StudyGroupLeaderboardEntry,
  StudyGroupMembershipRole,
  StudyGroupMissedWord,
  StudyGroupOverviewPayload,
  StudyGroupProjectListPayload,
  StudyGroupsPayload,
  StudyGroupSummary,
  StudyGroupVisibility,
} from '@/lib/shared-projects/types';
import { mapProjectFromRow, type ProjectRow } from '../../../../../shared/db';
import { getSharedProjectMetrics } from '../shared';

type SupabaseAdminClient = ReturnType<typeof getSupabaseAdmin>;

type StudyGroupRow = {
  id: string;
  owner_user_id: string;
  name: string;
  invite_code: string;
  visibility?: string | null;
  created_at: string;
};

type StudyGroupMembershipRow = {
  group_id: string;
  role: string | null;
  created_at?: string | null;
};

type StudyGroupProjectRow = {
  group_id?: string;
  project_id: string;
  added_by_user_id?: string | null;
  created_at?: string | null;
};

type StudyGroupCounts = {
  memberCount: number;
  projectCount: number;
};

type ListStudyGroupsOptions = {
  projectId?: string | null;
};

type PublicStudyGroupsOptions = {
  limit?: number;
  cursor?: string | null;
  query?: string | null;
};

type PublicStudyGroupsPayload = {
  groups: PublicStudyGroupSummary[];
  nextCursor: string | null;
};

type StudyGroupCursor = {
  createdAt: string;
  id: string;
};

const STUDY_GROUP_SELECT_COLUMNS = 'id,owner_user_id,name,invite_code,visibility,created_at';
const PROJECT_GROUP_SELECT_COLUMNS = 'id,user_id,title,source_labels,shared_tags,icon_image,created_at,share_id,is_favorite,description,share_scope';
const GROUP_INVITE_CODE_PATTERN = /^[A-Za-z0-9_]{4,64}$/;
const CREATE_INVITE_CODE_RETRIES = 5;
const DEFAULT_PUBLIC_GROUP_PAGE_SIZE = 12;
const MAX_PUBLIC_GROUP_PAGE_SIZE = 36;

export function normalizeGroupInviteCode(input: string): string | null {
  const normalized = input.trim().replace(/[\s-]+/g, '');
  return GROUP_INVITE_CODE_PATTERN.test(normalized) ? normalized : null;
}

export async function listStudyGroupsForUser(
  userId: string,
  options: ListStudyGroupsOptions = {},
  admin: SupabaseAdminClient = getSupabaseAdmin(),
): Promise<StudyGroupsPayload> {
  const { data: memberships, error: membershipsError } = await admin
    .from('study_group_members')
    .select('group_id,role,created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (membershipsError) {
    throw new Error(membershipsError.message || 'study_group_memberships_lookup_failed');
  }

  const membershipRows = (memberships ?? []) as StudyGroupMembershipRow[];
  const groupIds = Array.from(new Set(membershipRows.map((row) => row.group_id).filter(Boolean)));
  if (groupIds.length === 0) {
    return { groups: [] };
  }

  const { data: groups, error: groupsError } = await admin
    .from('study_groups')
    .select(STUDY_GROUP_SELECT_COLUMNS)
    .in('id', groupIds);

  if (groupsError) {
    throw new Error(groupsError.message || 'study_groups_lookup_failed');
  }

  const groupRows = (groups ?? []) as StudyGroupRow[];
  const groupById = new Map(groupRows.map((row) => [row.id, row]));
  const roleByGroupId = new Map(
    membershipRows.map((row) => [row.group_id, normalizeStudyGroupRole(row.role)]),
  );

  const [countsByGroupId, ownerUsernameByUserId, sharedGroupIds] = await Promise.all([
    getStudyGroupCounts(groupIds, admin),
    getUsernamesByUserIds(admin, groupRows.map((row) => row.owner_user_id)),
    getProjectSharedGroupIds(groupIds, options.projectId ?? null, admin),
  ]);

  return {
    groups: membershipRows
      .map((membership) => groupById.get(membership.group_id))
      .filter((row): row is StudyGroupRow => Boolean(row))
      .map((row) => mapStudyGroupSummary(
        row,
        roleByGroupId.get(row.id) ?? 'member',
        countsByGroupId,
        ownerUsernameByUserId,
        sharedGroupIds,
      )),
  };
}

export async function createStudyGroup(
  userId: string,
  name: string,
  visibility: StudyGroupVisibility = 'private',
  admin: SupabaseAdminClient = getSupabaseAdmin(),
): Promise<StudyGroupSummary> {
  const normalizedName = name.trim();
  const normalizedVisibility = normalizeStudyGroupVisibility(visibility);

  for (let attempt = 0; attempt < CREATE_INVITE_CODE_RETRIES; attempt += 1) {
    const inviteCode = generateGroupInviteCode();
    const { data: group, error: groupError } = await admin
      .from('study_groups')
      .insert({
        owner_user_id: userId,
        name: normalizedName,
        invite_code: inviteCode,
        visibility: normalizedVisibility,
      })
      .select(STUDY_GROUP_SELECT_COLUMNS)
      .single<StudyGroupRow>();

    if (groupError) {
      if (isUniqueViolation(groupError) && attempt < CREATE_INVITE_CODE_RETRIES - 1) {
        continue;
      }
      throw new Error(groupError.message || 'study_group_create_failed');
    }

    const { error: memberError } = await admin
      .from('study_group_members')
      .insert({
        group_id: group.id,
        user_id: userId,
        role: 'owner',
      });

    if (memberError) {
      throw new Error(memberError.message || 'study_group_owner_membership_failed');
    }

    return getStudyGroupSummaryForUser(group.id, userId, admin);
  }

  throw new Error('study_group_invite_code_generation_failed');
}

export async function listPublicStudyGroups(
  options: PublicStudyGroupsOptions = {},
  admin: SupabaseAdminClient = getSupabaseAdmin(),
): Promise<PublicStudyGroupsPayload> {
  const limit = clampPublicGroupPageSize(options.limit);
  const cursor = decodePublicGroupCursor(options.cursor ?? null);
  const query = normalizeSearchQuery(options.query);
  const fetchSize = query ? Math.max(limit + 1, 80) : limit + 1;

  let request = admin
    .from('study_groups')
    .select(STUDY_GROUP_SELECT_COLUMNS)
    .eq('visibility', 'public')
    .order('created_at', { ascending: false })
    .order('id', { ascending: false });

  if (cursor) {
    request = request.lte('created_at', cursor.createdAt);
  }

  const { data, error } = await request.limit(fetchSize);
  if (error) {
    throw new Error(error.message || 'public_study_groups_lookup_failed');
  }

  const rows = ((data ?? []) as StudyGroupRow[])
    .filter((row) => !cursor || compareGroupRowAgainstCursor(row, cursor) > 0);
  const ownerUsernameByUserId = await getUsernamesByUserIds(admin, rows.map((row) => row.owner_user_id));
  const matchingRows = query
    ? rows.filter((row) => {
      const ownerUsername = ownerUsernameByUserId.get(row.owner_user_id) ?? '';
      return includesSearchText(row.name, query) || includesSearchText(ownerUsername, query);
    })
    : rows;
  const pageRows = matchingRows.slice(0, limit);
  const countsByGroupId = await getStudyGroupCounts(pageRows.map((row) => row.id), admin);

  return {
    groups: pageRows.map((row) => {
      const counts = countsByGroupId.get(row.id) ?? { memberCount: 0, projectCount: 0 };
      return {
        id: row.id,
        name: row.name,
        visibility: 'public' as const,
        memberCount: counts.memberCount,
        projectCount: counts.projectCount,
        createdAt: row.created_at,
        ownerUsername: ownerUsernameByUserId.get(row.owner_user_id) ?? null,
      };
    }),
    nextCursor: matchingRows.length > limit
      ? encodePublicGroupCursor(matchingRows[limit - 1]!)
      : null,
  };
}

export async function joinStudyGroupByInviteCode(
  userId: string,
  inviteCodeInput: string,
  admin: SupabaseAdminClient = getSupabaseAdmin(),
): Promise<StudyGroupSummary | null> {
  const inviteCode = normalizeGroupInviteCode(inviteCodeInput);
  if (!inviteCode) return null;

  const { data: group, error: groupError } = await admin
    .from('study_groups')
    .select(STUDY_GROUP_SELECT_COLUMNS)
    .eq('invite_code', inviteCode)
    .maybeSingle<StudyGroupRow>();

  if (groupError) {
    throw new Error(groupError.message || 'study_group_invite_lookup_failed');
  }
  if (!group) return null;

  const { error: memberError } = await admin
    .from('study_group_members')
    .upsert(
      [{
        group_id: group.id,
        user_id: userId,
        role: group.owner_user_id === userId ? 'owner' : 'member',
      }],
      { onConflict: 'group_id,user_id', ignoreDuplicates: true },
    );

  if (memberError) {
    throw new Error(memberError.message || 'study_group_join_failed');
  }

  return getStudyGroupSummaryForUser(group.id, userId, admin);
}

export async function listStudyGroupProjects(
  groupId: string,
  userId: string,
  admin: SupabaseAdminClient = getSupabaseAdmin(),
): Promise<StudyGroupProjectListPayload | null> {
  const membership = await getStudyGroupMembership(groupId, userId, admin);
  if (!membership) return null;

  const { data: projectLinks, error: projectLinksError } = await admin
    .from('study_group_projects')
    .select('project_id,created_at,added_by_user_id')
    .eq('group_id', groupId)
    .order('created_at', { ascending: false });

  if (projectLinksError) {
    throw new Error(projectLinksError.message || 'study_group_projects_lookup_failed');
  }

  const projectRows = (projectLinks ?? []) as StudyGroupProjectRow[];
  const projectIds = Array.from(new Set(projectRows.map((row) => row.project_id).filter(Boolean)));

  const projects = projectIds.length > 0
    ? await fetchGroupProjectsByIds(admin, projectIds)
    : [];
  const projectById = new Map(projects.map((row) => [row.id, row]));
  const linkByProjectId = new Map(projectRows.map((row) => [row.project_id, row]));
  const orderedProjects = projectRows
    .map((row) => projectById.get(row.project_id))
    .filter((row): row is ProjectRow => Boolean(row));

  const [metricsByProjectId, usernameByUserId, summary] = await Promise.all([
    getSharedProjectMetrics(orderedProjects.map((row) => row.id), admin),
    getUsernamesByUserIds(admin, orderedProjects.map((row) => row.user_id)),
    getStudyGroupSummaryForUser(groupId, userId, admin),
  ]);

  return {
    group: summary,
    projects: orderedProjects.map((row) => {
      const link = linkByProjectId.get(row.id);
      return mapSharedProjectCardForGroup(
        row,
        row.user_id === userId ? 'owner' : 'viewer',
        metricsByProjectId,
        usernameByUserId,
        {
          groupId,
          canRemove: membership.role === 'owner' || row.user_id === userId || link?.added_by_user_id === userId,
          sharedByCurrentUser: link?.added_by_user_id === userId,
        },
      );
    }),
  };
}

export async function getStudyGroupOverview(
  groupId: string,
  userId: string,
  admin: SupabaseAdminClient = getSupabaseAdmin(),
): Promise<StudyGroupOverviewPayload | null> {
  const membership = await getStudyGroupMembership(groupId, userId, admin);
  if (!membership) return null;

  const memberUserIds = await getStudyGroupMemberUserIds(groupId, admin);

  const [projectPayload, leaderboard] = await Promise.all([
    listStudyGroupProjects(groupId, userId, admin),
    getStudyGroupLeaderboard(memberUserIds, userId, admin),
  ]);

  if (!projectPayload) return null;

  // "Struggling words" are aggregated ONLY from words inside the group's
  // wordbooks: the shared projects themselves plus the copies members imported
  // from them (tracked via projects.imported_from_share_id).
  const groupProjectIds = await getGroupWordbookProjectIds(projectPayload.projects, memberUserIds, admin);
  const missedWords = await getStudyGroupTopMissedWords(memberUserIds, groupProjectIds, admin);

  return {
    group: projectPayload.group,
    projects: projectPayload.projects,
    leaderboard,
    missedWords,
    viewerUserId: userId,
  };
}

/**
 * Resolves the set of project IDs that count as "this group's wordbooks":
 * the shared projects and every member-owned copy imported from one of them.
 */
async function getGroupWordbookProjectIds(
  sharedProjects: SharedProjectCard[],
  memberUserIds: string[],
  admin: SupabaseAdminClient,
): Promise<string[]> {
  const projectIds = new Set<string>();
  const shareIds = new Set<string>();
  for (const card of sharedProjects) {
    projectIds.add(card.project.id);
    if (card.project.shareId) shareIds.add(card.project.shareId);
  }

  if (shareIds.size > 0 && memberUserIds.length > 0) {
    const { data, error } = await admin
      .from('projects')
      .select('id')
      .in('user_id', memberUserIds)
      .in('imported_from_share_id', Array.from(shareIds));

    if (error) {
      if (!isMissingRelationError(error, 'imported_from_share_id')) {
        throw new Error(error.message || 'group_imported_projects_lookup_failed');
      }
    } else {
      for (const row of (data ?? []) as Array<{ id: string }>) {
        projectIds.add(row.id);
      }
    }
  }

  return Array.from(projectIds);
}

async function getStudyGroupMemberUserIds(
  groupId: string,
  admin: SupabaseAdminClient,
): Promise<string[]> {
  const { data, error } = await admin
    .from('study_group_members')
    .select('user_id')
    .eq('group_id', groupId);

  if (error) {
    throw new Error(error.message || 'study_group_members_lookup_failed');
  }

  return Array.from(new Set(((data ?? []) as Array<{ user_id: string }>).map((row) => row.user_id)));
}

async function getStudyGroupLeaderboard(
  memberUserIds: string[],
  viewerUserId: string,
  admin: SupabaseAdminClient,
): Promise<StudyGroupLeaderboardEntry[]> {
  if (memberUserIds.length === 0) return [];

  const totals = new Map<string, { quizCount: number; masteredCount: number }>();
  for (const id of memberUserIds) {
    totals.set(id, { quizCount: 0, masteredCount: 0 });
  }

  const { data, error } = await admin
    .from('quiz_sessions')
    .select('user_id,answer_count,mastered_count')
    .in('user_id', memberUserIds);

  if (error) {
    // Older environments may not have quiz_sessions yet — degrade gracefully.
    if (!isMissingRelationError(error, 'quiz_sessions')) {
      throw new Error(error.message || 'study_group_leaderboard_lookup_failed');
    }
  } else {
    for (const row of (data ?? []) as Array<{ user_id: string; answer_count: number | string | null; mastered_count: number | string | null }>) {
      const current = totals.get(row.user_id) ?? { quizCount: 0, masteredCount: 0 };
      current.quizCount += Number(row.answer_count ?? 0) || 0;
      current.masteredCount += Number(row.mastered_count ?? 0) || 0;
      totals.set(row.user_id, current);
    }
  }

  const profiles = await getMemberProfiles(memberUserIds, admin);

  return memberUserIds
    .map((id) => {
      const totalsForUser = totals.get(id) ?? { quizCount: 0, masteredCount: 0 };
      const profile = profiles.get(id);
      return {
        userId: id,
        username: profile?.username ?? null,
        accountId: profile?.accountId ?? null,
        quizCount: totalsForUser.quizCount,
        masteredCount: totalsForUser.masteredCount,
        isViewer: id === viewerUserId,
      };
    })
    .sort((a, b) => {
      if (b.quizCount !== a.quizCount) return b.quizCount - a.quizCount;
      if (b.masteredCount !== a.masteredCount) return b.masteredCount - a.masteredCount;
      return (a.accountId ?? a.userId).localeCompare(b.accountId ?? b.userId);
    });
}

async function getStudyGroupTopMissedWords(
  memberUserIds: string[],
  groupProjectIds: string[],
  admin: SupabaseAdminClient,
  limit = 8,
): Promise<StudyGroupMissedWord[]> {
  // No members or no group wordbooks → nothing to aggregate. Struggling words
  // are intentionally scoped to words that live in the group's wordbooks.
  if (memberUserIds.length === 0 || groupProjectIds.length === 0) return [];

  const { data, error } = await admin
    .from('quiz_word_misses')
    .select('english_key,english,japanese')
    .in('user_id', memberUserIds)
    .in('project_id', groupProjectIds)
    .order('created_at', { ascending: false })
    .limit(2000);

  if (error) {
    if (isMissingRelationError(error, 'quiz_word_misses')) return [];
    throw new Error(error.message || 'study_group_missed_words_lookup_failed');
  }

  const aggregate = new Map<string, StudyGroupMissedWord>();
  for (const row of (data ?? []) as Array<{ english_key: string; english: string; japanese: string }>) {
    const key = row.english_key;
    const existing = aggregate.get(key);
    if (existing) {
      existing.missCount += 1;
    } else {
      aggregate.set(key, {
        englishKey: key,
        english: row.english,
        japanese: row.japanese,
        missCount: 1,
      });
    }
  }

  return Array.from(aggregate.values())
    .sort((a, b) => (b.missCount - a.missCount) || a.english.localeCompare(b.english))
    .slice(0, limit);
}

async function getMemberProfiles(
  userIds: string[],
  admin: SupabaseAdminClient,
): Promise<Map<string, { username: string | null; accountId: string | null }>> {
  const result = new Map<string, { username: string | null; accountId: string | null }>();
  const uniqueIds = Array.from(new Set(userIds.filter(Boolean)));
  if (uniqueIds.length === 0) return result;

  const { data, error } = await admin
    .from('profiles')
    .select('user_id, username, account_id')
    .in('user_id', uniqueIds);

  if (error) {
    // Fall back to username-only lookup when account_id is unavailable.
    const usernames = await getUsernamesByUserIds(admin, uniqueIds);
    for (const id of uniqueIds) {
      result.set(id, { username: usernames.get(id) ?? null, accountId: null });
    }
    return result;
  }

  for (const row of (data ?? []) as Array<{ user_id: string; username: string | null; account_id: string | null }>) {
    result.set(row.user_id, {
      username: (row.username ?? null) || null,
      accountId: (row.account_id ?? null) || null,
    });
  }
  return result;
}

/**
 * Records a `project_added` feed event for the group and returns the user IDs of
 * the other members who should be notified. Safe to call from a background task.
 */
export async function recordStudyGroupProjectAddedEvent(
  groupId: string,
  projectId: string,
  actorUserId: string,
  admin: SupabaseAdminClient = getSupabaseAdmin(),
): Promise<{ recipientUserIds: string[]; groupName: string; projectTitle: string }> {
  const [groupResult, projectResult, memberUserIds, actorProfiles] = await Promise.all([
    admin.from('study_groups').select('name').eq('id', groupId).maybeSingle<{ name: string }>(),
    admin.from('projects').select('title').eq('id', projectId).maybeSingle<{ title: string }>(),
    getStudyGroupMemberUserIds(groupId, admin),
    getMemberProfiles([actorUserId], admin),
  ]);

  const groupName = groupResult.data?.name ?? 'グループ';
  const projectTitle = projectResult.data?.title ?? '単語帳';
  const actorProfile = actorProfiles.get(actorUserId);
  const actorName = actorProfile?.username
    || (actorProfile?.accountId ? `@${actorProfile.accountId}` : null);

  const { error: insertError } = await admin
    .from('study_group_feed_events')
    .insert({
      group_id: groupId,
      actor_user_id: actorUserId,
      event_type: 'project_added',
      project_id: projectId,
      group_name: groupName,
      project_title: projectTitle,
      actor_name: actorName,
    });

  if (insertError && !isMissingRelationError(insertError, 'study_group_feed_events')) {
    throw new Error(insertError.message || 'study_group_feed_event_insert_failed');
  }

  return {
    recipientUserIds: memberUserIds.filter((id) => id !== actorUserId),
    groupName,
    projectTitle,
  };
}

/**
 * Returns recent feed events for all study groups the user belongs to.
 */
export async function listStudyGroupFeedEventsForUser(
  userId: string,
  limit = 40,
  admin: SupabaseAdminClient = getSupabaseAdmin(),
): Promise<StudyGroupFeedEvent[]> {
  const { data: memberships, error: membershipError } = await admin
    .from('study_group_members')
    .select('group_id')
    .eq('user_id', userId);

  if (membershipError || !memberships?.length) return [];

  const groupIds = Array.from(new Set((memberships as Array<{ group_id: string }>).map((row) => row.group_id)));
  if (groupIds.length === 0) return [];

  const { data, error } = await admin
    .from('study_group_feed_events')
    .select('id,group_id,actor_user_id,event_type,project_id,group_name,project_title,actor_name,created_at')
    .in('group_id', groupIds)
    .order('created_at', { ascending: false })
    .limit(Math.max(1, Math.min(limit, 80)));

  if (error) {
    if (isMissingRelationError(error, 'study_group_feed_events')) return [];
    throw new Error(error.message || 'study_group_feed_events_lookup_failed');
  }

  return ((data ?? []) as Array<{
    id: string;
    group_id: string;
    actor_user_id: string | null;
    event_type: string;
    project_id: string | null;
    group_name: string;
    project_title: string;
    actor_name: string | null;
    created_at: string;
  }>).map((row) => ({
    id: row.id,
    groupId: row.group_id,
    groupName: row.group_name,
    eventType: 'project_added',
    projectId: row.project_id,
    projectTitle: row.project_title,
    actorUserId: row.actor_user_id,
    actorName: row.actor_name,
    createdAt: row.created_at,
  }));
}

function isMissingRelationError(error: unknown, table: string): boolean {
  const maybeError = error as { code?: string | null; message?: string | null };
  const message = maybeError.message?.toLowerCase() ?? '';
  return maybeError.code === '42P01'
    || (message.includes(table) && (
      message.includes('does not exist')
      || message.includes('schema cache')
      || message.includes('could not find')
      || message.includes('relation')
    ));
}

export async function addProjectToStudyGroup(
  groupId: string,
  projectId: string,
  userId: string,
  admin: SupabaseAdminClient = getSupabaseAdmin(),
): Promise<SharedProjectCard | null> {
  const [membership, isPro] = await Promise.all([
    getStudyGroupMembership(groupId, userId, admin),
    isUserActivePro(userId, admin),
  ]);
  if (!membership) return null;

  if (!isPro) {
    throw new StudyGroupProjectAccessError('pro_required');
  }

  const project = await getOwnedProject(projectId, userId, admin);
  if (!project) {
    throw new StudyGroupProjectAccessError('project_not_owned');
  }

  const sharedProject = project.share_id
    ? project
    : await ensureProjectShareId(project, admin);

  const { error } = await admin
    .from('study_group_projects')
    .upsert(
      [{
        group_id: groupId,
        project_id: sharedProject.id,
        added_by_user_id: userId,
      }],
      { onConflict: 'group_id,project_id', ignoreDuplicates: true },
    );

  if (error) {
    throw new Error(error.message || 'study_group_project_add_failed');
  }

  const [metricsByProjectId, usernameByUserId] = await Promise.all([
    getSharedProjectMetrics([sharedProject.id], admin),
    getUsernamesByUserIds(admin, [sharedProject.user_id]),
  ]);

  return mapSharedProjectCardForGroup(
    sharedProject,
    'owner',
    metricsByProjectId,
    usernameByUserId,
    {
      groupId,
      canRemove: true,
      sharedByCurrentUser: true,
    },
  );
}

export async function removeProjectFromStudyGroup(
  groupId: string,
  projectId: string,
  userId: string,
  admin: SupabaseAdminClient = getSupabaseAdmin(),
): Promise<boolean> {
  const membership = await getStudyGroupMembership(groupId, userId, admin);
  if (!membership) return false;

  const [projectResult, linkResult] = await Promise.all([
    admin
      .from('projects')
      .select('id,user_id')
      .eq('id', projectId)
      .maybeSingle<Pick<ProjectRow, 'id' | 'user_id'>>(),
    admin
      .from('study_group_projects')
      .select('added_by_user_id')
      .eq('group_id', groupId)
      .eq('project_id', projectId)
      .maybeSingle<Pick<StudyGroupProjectRow, 'added_by_user_id'>>(),
  ]);

  if (projectResult.error) {
    throw new Error(projectResult.error.message || 'study_group_project_owner_lookup_failed');
  }
  if (linkResult.error) {
    throw new Error(linkResult.error.message || 'study_group_project_link_lookup_failed');
  }

  const canRemove = membership.role === 'owner'
    || projectResult.data?.user_id === userId
    || linkResult.data?.added_by_user_id === userId;
  if (!canRemove) {
    throw new StudyGroupProjectAccessError('remove_forbidden');
  }

  const { error } = await admin
    .from('study_group_projects')
    .delete()
    .eq('group_id', groupId)
    .eq('project_id', projectId);

  if (error) {
    throw new Error(error.message || 'study_group_project_remove_failed');
  }

  return true;
}

export class StudyGroupProjectAccessError extends Error {
  constructor(readonly code: 'pro_required' | 'project_not_owned' | 'remove_forbidden') {
    super(code);
    this.name = 'StudyGroupProjectAccessError';
  }
}

async function getStudyGroupSummaryForUser(
  groupId: string,
  userId: string,
  admin: SupabaseAdminClient,
  projectId?: string | null,
): Promise<StudyGroupSummary> {
  const membership = await getStudyGroupMembership(groupId, userId, admin);
  if (!membership) {
    throw new Error('study_group_membership_required');
  }

  const [countsByGroupId, ownerUsernameByUserId, sharedGroupIds] = await Promise.all([
    getStudyGroupCounts([groupId], admin),
    getUsernamesByUserIds(admin, [membership.group.owner_user_id]),
    getProjectSharedGroupIds([groupId], projectId ?? null, admin),
  ]);

  return mapStudyGroupSummary(
    membership.group,
    membership.role,
    countsByGroupId,
    ownerUsernameByUserId,
    sharedGroupIds,
  );
}

async function getStudyGroupMembership(
  groupId: string,
  userId: string,
  admin: SupabaseAdminClient,
): Promise<{ group: StudyGroupRow; role: StudyGroupMembershipRole } | null> {
  const [groupResult, memberResult] = await Promise.all([
    admin
      .from('study_groups')
      .select(STUDY_GROUP_SELECT_COLUMNS)
      .eq('id', groupId)
      .maybeSingle<StudyGroupRow>(),
    admin
      .from('study_group_members')
      .select('role')
      .eq('group_id', groupId)
      .eq('user_id', userId)
      .maybeSingle<{ role: string | null }>(),
  ]);

  if (groupResult.error) {
    throw new Error(groupResult.error.message || 'study_group_lookup_failed');
  }
  if (memberResult.error) {
    throw new Error(memberResult.error.message || 'study_group_membership_lookup_failed');
  }
  if (!groupResult.data || !memberResult.data) return null;

  return {
    group: groupResult.data,
    role: normalizeStudyGroupRole(memberResult.data.role),
  };
}

async function getOwnedProject(
  projectId: string,
  userId: string,
  admin: SupabaseAdminClient,
): Promise<ProjectRow | null> {
  const { data, error } = await admin
    .from('projects')
    .select(PROJECT_GROUP_SELECT_COLUMNS)
    .eq('id', projectId)
    .eq('user_id', userId)
    .maybeSingle<ProjectRow>();

  if (error) {
    throw new Error(error.message || 'study_group_project_lookup_failed');
  }

  return data ?? null;
}

async function ensureProjectShareId(
  project: ProjectRow,
  admin: SupabaseAdminClient,
): Promise<ProjectRow> {
  for (let attempt = 0; attempt < CREATE_INVITE_CODE_RETRIES; attempt += 1) {
    const shareId = generateProjectShareId();
    const { data, error } = await admin
      .from('projects')
      .update({ share_id: shareId, share_scope: 'private' })
      .eq('id', project.id)
      .is('share_id', null)
      .select(PROJECT_GROUP_SELECT_COLUMNS)
      .maybeSingle<ProjectRow>();

    if (error) {
      if (isUniqueViolation(error) && attempt < CREATE_INVITE_CODE_RETRIES - 1) {
        continue;
      }
      throw new Error(error.message || 'study_group_project_share_id_failed');
    }

    if (data) return data;

    const refreshed = await fetchProjectById(project.id, admin);
    if (refreshed?.share_id) return refreshed;
  }

  throw new Error('study_group_project_share_id_generation_failed');
}

async function fetchProjectById(
  projectId: string,
  admin: SupabaseAdminClient,
): Promise<ProjectRow | null> {
  const { data, error } = await admin
    .from('projects')
    .select(PROJECT_GROUP_SELECT_COLUMNS)
    .eq('id', projectId)
    .maybeSingle<ProjectRow>();

  if (error) {
    throw new Error(error.message || 'study_group_project_refresh_failed');
  }

  return data ?? null;
}

async function fetchGroupProjectsByIds(
  admin: SupabaseAdminClient,
  projectIds: string[],
): Promise<ProjectRow[]> {
  const { data, error } = await admin
    .from('projects')
    .select(PROJECT_GROUP_SELECT_COLUMNS)
    .in('id', projectIds)
    .not('share_id', 'is', null);

  if (error) {
    throw new Error(error.message || 'study_group_projects_fetch_failed');
  }

  return (data ?? []) as ProjectRow[];
}

async function isUserActivePro(
  userId: string,
  admin: SupabaseAdminClient,
): Promise<boolean> {
  const { data, error } = await admin
    .from('subscriptions')
    .select('status,plan,pro_source,test_pro_expires_at,current_period_end')
    .eq('user_id', userId)
    .maybeSingle<Record<string, unknown>>();

  if (error) {
    throw new Error(error.message || 'study_group_subscription_lookup_failed');
  }

  return isActiveProSubscription({
    status: data?.status as string | null | undefined,
    plan: data?.plan as string | null | undefined,
    proSource: data?.pro_source as string | null | undefined,
    testProExpiresAt: data?.test_pro_expires_at as string | null | undefined,
    currentPeriodEnd: data?.current_period_end as string | null | undefined,
  });
}

async function getStudyGroupCounts(
  groupIds: string[],
  admin: SupabaseAdminClient,
): Promise<Map<string, StudyGroupCounts>> {
  const result = new Map<string, StudyGroupCounts>();
  for (const groupId of groupIds) {
    result.set(groupId, { memberCount: 0, projectCount: 0 });
  }

  await Promise.all(groupIds.map(async (groupId) => {
    const [members, projects] = await Promise.all([
      admin
        .from('study_group_members')
        .select('*', { count: 'exact', head: true })
        .eq('group_id', groupId),
      admin
        .from('study_group_projects')
        .select('*', { count: 'exact', head: true })
        .eq('group_id', groupId),
    ]);

    if (members.error) {
      throw new Error(members.error.message || 'study_group_member_count_failed');
    }
    if (projects.error) {
      throw new Error(projects.error.message || 'study_group_project_count_failed');
    }

    result.set(groupId, {
      memberCount: members.count ?? 0,
      projectCount: projects.count ?? 0,
    });
  }));

  return result;
}

async function getProjectSharedGroupIds(
  groupIds: string[],
  projectId: string | null,
  admin: SupabaseAdminClient,
): Promise<Set<string>> {
  if (!projectId || groupIds.length === 0) return new Set();

  const { data, error } = await admin
    .from('study_group_projects')
    .select('group_id')
    .eq('project_id', projectId)
    .in('group_id', groupIds);

  if (error) {
    throw new Error(error.message || 'study_group_project_membership_lookup_failed');
  }

  return new Set(((data ?? []) as Array<{ group_id: string }>).map((row) => row.group_id));
}

async function getUsernamesByUserIds(
  admin: SupabaseAdminClient,
  userIds: string[],
): Promise<Map<string, string | null>> {
  const result = new Map<string, string | null>();
  const uniqueIds = Array.from(new Set(userIds.filter(Boolean)));
  if (uniqueIds.length === 0) return result;

  try {
    const { data, error } = await admin
      .from('profiles')
      .select('user_id, username')
      .in('user_id', uniqueIds);

    if (error) return result;

    for (const row of data ?? []) {
      result.set(row.user_id as string, (row.username as string | null) ?? null);
    }
  } catch {
    // profiles can be absent in older environments.
  }

  return result;
}

function mapStudyGroupSummary(
  row: StudyGroupRow,
  role: StudyGroupMembershipRole,
  countsByGroupId: Map<string, StudyGroupCounts>,
  ownerUsernameByUserId: Map<string, string | null>,
  sharedGroupIds: Set<string>,
): StudyGroupSummary {
  const counts = countsByGroupId.get(row.id) ?? { memberCount: 0, projectCount: 0 };
  return {
    id: row.id,
    name: row.name,
    inviteCode: row.invite_code,
    role,
    visibility: normalizeStudyGroupVisibility(row.visibility),
    memberCount: counts.memberCount,
    projectCount: counts.projectCount,
    createdAt: row.created_at,
    ownerUsername: ownerUsernameByUserId.get(row.owner_user_id) ?? null,
    projectShared: sharedGroupIds.has(row.id),
  };
}

function mapSharedProjectCardForGroup(
  row: ProjectRow,
  accessRole: SharedProjectAccessRole,
  metricsByProjectId: Map<string, SharedProjectMetrics>,
  usernameByUserId: Map<string, string | null>,
  groupAccess?: {
    groupId: string;
    canRemove: boolean;
    sharedByCurrentUser: boolean;
  },
): SharedProjectCard {
  const metrics = metricsByProjectId.get(row.id);
  return {
    project: mapProjectFromRow(row),
    accessRole,
    ownerUsername: usernameByUserId.get(row.user_id) ?? null,
    wordCount: metrics?.wordCount ?? 0,
    collaboratorCount: metrics?.collaboratorCount ?? 1,
    likeCount: metrics?.likeCount ?? 0,
    sharedGroupId: groupAccess?.groupId,
    sharedByCurrentUser: groupAccess?.sharedByCurrentUser,
    canRemoveFromGroup: groupAccess?.canRemove,
  };
}

function normalizeStudyGroupRole(role: string | null | undefined): StudyGroupMembershipRole {
  return role === 'owner' ? 'owner' : 'member';
}

function normalizeStudyGroupVisibility(value: string | null | undefined): StudyGroupVisibility {
  return value === 'public' ? 'public' : 'private';
}

function normalizeSearchQuery(query?: string | null): string {
  return (query ?? '').trim().toLowerCase();
}

function includesSearchText(value: string | null | undefined, query: string): boolean {
  return value?.toLowerCase().includes(query) ?? false;
}

function clampPublicGroupPageSize(limit?: number): number {
  if (!Number.isFinite(limit)) return DEFAULT_PUBLIC_GROUP_PAGE_SIZE;
  return Math.max(1, Math.min(MAX_PUBLIC_GROUP_PAGE_SIZE, Math.floor(Number(limit))));
}

function encodePublicGroupCursor(row: Pick<StudyGroupRow, 'created_at' | 'id'>): string {
  return Buffer.from(
    JSON.stringify({
      createdAt: row.created_at,
      id: row.id,
    }),
    'utf8',
  ).toString('base64url');
}

function decodePublicGroupCursor(cursor: string | null): StudyGroupCursor | null {
  if (!cursor) return null;

  try {
    const value = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as Partial<StudyGroupCursor>;
    if (typeof value.createdAt === 'string' && typeof value.id === 'string') {
      return { createdAt: value.createdAt, id: value.id };
    }
  } catch {
    return null;
  }

  return null;
}

function compareGroupRowAgainstCursor(row: Pick<StudyGroupRow, 'created_at' | 'id'>, cursor: StudyGroupCursor): number {
  const createdAtDiff = cursor.createdAt.localeCompare(row.created_at);
  if (createdAtDiff !== 0) return createdAtDiff;
  return cursor.id.localeCompare(row.id);
}

function generateGroupInviteCode(): string {
  return generateCompactCode(12);
}

function generateProjectShareId(): string {
  return generateCompactCode(12);
}

function generateCompactCode(length: number): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((byte) => byte.toString(36).padStart(2, '0'))
    .join('')
    .slice(0, length);
}

function isUniqueViolation(error: unknown): boolean {
  const maybeError = error as { code?: string | null; message?: string | null };
  const message = maybeError.message?.toLowerCase() ?? '';
  return maybeError.code === '23505' || message.includes('duplicate key');
}
