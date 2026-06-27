import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { isActiveProSubscription } from '@/lib/subscription/status';
import type {
  PublicStudyGroupSummary,
  SharedProjectAccessRole,
  SharedProjectCard,
  SharedProjectMetrics,
  StudyGroupMembershipRole,
  StudyGroupProjectListPayload,
  StudyGroupStrugglingWord,
  StudyGroupStrugglingWordsPayload,
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

type StudyGroupMemberUserRow = {
  user_id: string;
};

type StudyGroupProjectRow = {
  group_id?: string;
  project_id: string;
  created_at?: string | null;
};

type StudyGroupWrongAnswerRow = {
  user_id: string;
  word_id: string;
  project_id: string | null;
  english: string | null;
  japanese: string | null;
  wrong_count: number | null;
  last_wrong_at: string | null;
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
export const STUDY_GROUP_STRUGGLING_PREVIEW_LIMIT = 5;
const STUDY_GROUP_WRONG_ANSWER_PAGE_SIZE = 1000;

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
    .select('project_id,created_at')
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
    projects: orderedProjects.map((row) => mapSharedProjectCardForGroup(
      row,
      row.user_id === userId ? 'owner' : 'viewer',
      metricsByProjectId,
      usernameByUserId,
    )),
  };
}

export function aggregateStudyGroupStrugglingWords(
  rows: StudyGroupWrongAnswerRow[],
): StudyGroupStrugglingWord[] {
  const aggregated = new Map<string, StudyGroupStrugglingWord & { userIds: Set<string> }>();

  for (const row of rows) {
    const english = row.english?.trim();
    const japanese = row.japanese?.trim();
    if (!english || !japanese) continue;

    const key = `${english.toLowerCase()}::${japanese}`;
    const wrongCount = Math.max(0, row.wrong_count ?? 0);
    if (wrongCount === 0) continue;

    const current = aggregated.get(key);
    const lastWrongAt = row.last_wrong_at ?? new Date(0).toISOString();
    if (current) {
      current.wrongCount += wrongCount;
      current.userIds.add(row.user_id);
      current.learnerCount = current.userIds.size;
      if (lastWrongAt > current.lastWrongAt) {
        current.lastWrongAt = lastWrongAt;
        current.wordId = row.word_id;
        current.projectId = row.project_id ?? '';
      }
      continue;
    }

    aggregated.set(key, {
      key,
      wordId: row.word_id,
      projectId: row.project_id ?? '',
      english,
      japanese,
      wrongCount,
      learnerCount: 1,
      lastWrongAt,
      userIds: new Set([row.user_id]),
    });
  }

  return Array.from(aggregated.values())
    .map(({ userIds: _userIds, ...word }) => word)
    .sort((a, b) => (
      b.wrongCount - a.wrongCount
      || b.learnerCount - a.learnerCount
      || b.lastWrongAt.localeCompare(a.lastWrongAt)
      || a.english.localeCompare(b.english)
    ));
}

export async function listStudyGroupStrugglingWords(
  groupId: string,
  userId: string,
  options: { limit?: number | null } = {},
  admin: SupabaseAdminClient = getSupabaseAdmin(),
): Promise<StudyGroupStrugglingWordsPayload | null> {
  const membership = await getStudyGroupMembership(groupId, userId, admin);
  if (!membership) return null;

  const { data: memberRows, error: memberError } = await admin
    .from('study_group_members')
    .select('user_id')
    .eq('group_id', groupId);

  if (memberError) {
    throw new Error(memberError.message || 'study_group_members_lookup_failed');
  }

  const memberUserIds = Array.from(new Set(
    ((memberRows ?? []) as StudyGroupMemberUserRow[])
      .map((row) => row.user_id)
      .filter(Boolean),
  ));

  const summaryPromise = getStudyGroupSummaryForUser(groupId, userId, admin);
  if (memberUserIds.length === 0) {
    return {
      group: await summaryPromise,
      words: [],
      totalCount: 0,
    };
  }

  const rows: StudyGroupWrongAnswerRow[] = [];
  for (let offset = 0; ; offset += STUDY_GROUP_WRONG_ANSWER_PAGE_SIZE) {
    const { data, error } = await admin
      .from('user_wrong_answers')
      .select('user_id,word_id,project_id,english,japanese,wrong_count,last_wrong_at')
      .in('user_id', memberUserIds)
      .order('wrong_count', { ascending: false })
      .order('last_wrong_at', { ascending: false })
      .range(offset, offset + STUDY_GROUP_WRONG_ANSWER_PAGE_SIZE - 1);

    if (error) {
      throw new Error(error.message || 'study_group_wrong_answers_lookup_failed');
    }

    const page = (data ?? []) as StudyGroupWrongAnswerRow[];
    rows.push(...page);
    if (page.length < STUDY_GROUP_WRONG_ANSWER_PAGE_SIZE) break;
  }

  const allWords = aggregateStudyGroupStrugglingWords(rows);
  const limit = typeof options.limit === 'number' && Number.isFinite(options.limit)
    ? Math.max(0, Math.floor(options.limit))
    : null;

  return {
    group: await summaryPromise,
    words: limit === null ? allWords : allWords.slice(0, limit),
    totalCount: allWords.length,
  };
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

  const { data: project, error: projectError } = await admin
    .from('projects')
    .select('id,user_id')
    .eq('id', projectId)
    .maybeSingle<Pick<ProjectRow, 'id' | 'user_id'>>();

  if (projectError) {
    throw new Error(projectError.message || 'study_group_project_owner_lookup_failed');
  }

  const canRemove = membership.role === 'owner' || project?.user_id === userId;
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
): SharedProjectCard {
  const metrics = metricsByProjectId.get(row.id);
  return {
    project: mapProjectFromRow(row),
    accessRole,
    ownerUsername: usernameByUserId.get(row.user_id) ?? null,
    wordCount: metrics?.wordCount ?? 0,
    collaboratorCount: metrics?.collaboratorCount ?? 1,
    likeCount: metrics?.likeCount ?? 0,
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
