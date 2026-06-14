import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { isActiveProSubscription } from '@/lib/subscription/status';
import type {
  SharedProjectAccessRole,
  SharedProjectCard,
  SharedProjectMetrics,
  StudyGroupMembershipRole,
  StudyGroupProjectListPayload,
  StudyGroupsPayload,
  StudyGroupSummary,
} from '@/lib/shared-projects/types';
import { mapProjectFromRow, type ProjectRow } from '../../../../../shared/db';
import { getSharedProjectMetrics } from '../shared';

type SupabaseAdminClient = ReturnType<typeof getSupabaseAdmin>;

type StudyGroupRow = {
  id: string;
  owner_user_id: string;
  name: string;
  invite_code: string;
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
  created_at?: string | null;
};

type StudyGroupCounts = {
  memberCount: number;
  projectCount: number;
};

type ListStudyGroupsOptions = {
  projectId?: string | null;
};

const STUDY_GROUP_SELECT_COLUMNS = 'id,owner_user_id,name,invite_code,created_at';
const PROJECT_GROUP_SELECT_COLUMNS = 'id,user_id,title,source_labels,icon_image,created_at,share_id,is_favorite,description,share_scope';
const GROUP_INVITE_CODE_PATTERN = /^[A-Za-z0-9_]{4,64}$/;
const CREATE_INVITE_CODE_RETRIES = 5;

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
  admin: SupabaseAdminClient = getSupabaseAdmin(),
): Promise<StudyGroupSummary> {
  const normalizedName = name.trim();

  for (let attempt = 0; attempt < CREATE_INVITE_CODE_RETRIES; attempt += 1) {
    const inviteCode = generateGroupInviteCode();
    const { data: group, error: groupError } = await admin
      .from('study_groups')
      .insert({
        owner_user_id: userId,
        name: normalizedName,
        invite_code: inviteCode,
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
