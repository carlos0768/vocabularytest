import { NextRequest, NextResponse } from 'next/server';
import { resolveAuthenticatedUser } from '@/app/api/share-import/shared';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import type { Project } from '@/types';
import { mapProjectFromRow, type ProjectRow } from '../../../../shared/db';

export type SharedProjectAccessRole = 'owner' | 'editor' | 'viewer';

export type SharedProjectSummary = {
  project: Project;
  accessRole: SharedProjectAccessRole;
  wordCount: number;
  collaboratorCount: number;
  ownerUsername?: string | null;
};

type ProjectMembershipRow = {
  project_id: string;
  role: string | null;
};

type SharedProjectListPayload = {
  owned: SharedProjectSummary[];
  joined: SharedProjectSummary[];
  public: SharedProjectSummary[];
};

type SharedSchemaDependency = 'project_members' | 'share_scope';

type SupabaseLikeError = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
};

type SupabaseAdminClient = ReturnType<typeof getSupabaseAdmin>;

const SHARE_CODE_PATTERN = /^[A-Za-z0-9_-]{4,64}$/;
const PROJECT_BASE_SELECT_COLUMNS = 'id,user_id,title,source_labels,icon_image,created_at,share_id,is_favorite';
const PROJECT_SHARED_SELECT_COLUMNS = `${PROJECT_BASE_SELECT_COLUMNS},share_scope`;

export class SharedProjectsSchemaUnavailableError extends Error {
  constructor(
    readonly missing: SharedSchemaDependency,
    message?: string,
  ) {
    super(message ?? `${missing}_schema_unavailable`);
    this.name = 'SharedProjectsSchemaUnavailableError';
  }
}

function normalizeShareCode(input: string): string {
  return input.trim().replace(/[\s-]+/g, '');
}

export async function requireAuthenticatedUser(request: NextRequest) {
  const user = await resolveAuthenticatedUser(request);
  if (!user) {
    return {
      ok: false as const,
      response: NextResponse.json({ success: false, error: '認証が必要です。' }, { status: 401 }),
    };
  }

  return {
    ok: true as const,
    user,
  };
}

export function extractShareCode(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  try {
    const url = new URL(trimmed);
    const parts = url.pathname.split('/').filter(Boolean);
    const shareIndex = parts.findIndex((part) => part === 'share');
    const candidate = shareIndex >= 0 ? parts[shareIndex + 1] : parts.at(-1);
    const normalizedCandidate = candidate ? normalizeShareCode(candidate) : null;
    if (normalizedCandidate && SHARE_CODE_PATTERN.test(normalizedCandidate)) {
      return normalizedCandidate;
    }
  } catch {
    // Fall through to raw code parsing.
  }

  const normalized = normalizeShareCode(trimmed);
  return SHARE_CODE_PATTERN.test(normalized) ? normalized : null;
}

export async function getProjectByShareCode(shareCode: string): Promise<ProjectRow | null> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from('projects')
    .select(PROJECT_BASE_SELECT_COLUMNS)
    .eq('share_id', shareCode)
    .maybeSingle<ProjectRow>();

  if (error) {
    throw new Error(error.message || 'shared_project_lookup_failed');
  }

  return data ?? null;
}

export async function getAccessibleSharedProject(projectId: string, userId: string): Promise<SharedProjectSummary | null> {
  return getOwnedOrMemberSharedProject(projectId, userId);
}

/**
 * Lightweight single-project access check.
 * Replaces the previous approach of running listSharedProjects (which fetches ALL user projects)
 * with targeted queries for the specific projectId only.
 *
 * Old approach: listSharedProjects fetches ALL shared projects + word counts + member counts for the user.
 * New approach: 2 parallel queries (project + membership), then 3 parallel count/username queries.
 */
async function getOwnedOrMemberSharedProject(
  projectId: string,
  userId: string,
  admin: SupabaseAdminClient = getSupabaseAdmin(),
): Promise<SharedProjectSummary | null> {
  // Step 1: Fetch project details and membership status in parallel
  const [projectResult, memberResult] = await Promise.all([
    admin
      .from('projects')
      .select(PROJECT_SHARED_SELECT_COLUMNS)
      .eq('id', projectId)
      .not('share_id', 'is', null)
      .maybeSingle<ProjectRow>(),
    admin
      .from('project_members')
      .select('role')
      .eq('project_id', projectId)
      .eq('user_id', userId)
      .maybeSingle<{ role: string | null }>(),
  ]);

  let shareScopeAvailable = true;
  let projectMembersAvailable = true;
  let projectRow: ProjectRow | null = null;

  // Handle project result
  if (projectResult.error) {
    if (getSharedProjectsSchemaIssue(projectResult.error) === 'share_scope') {
      shareScopeAvailable = false;
      logSharedProjectsFallback('share_scope', projectResult.error);
      // Retry without the share_scope column
      const { data, error } = await admin
        .from('projects')
        .select(PROJECT_BASE_SELECT_COLUMNS)
        .eq('id', projectId)
        .not('share_id', 'is', null)
        .maybeSingle<ProjectRow>();
      if (error || !data) return null;
      projectRow = data;
    } else {
      throw new Error((projectResult.error as { message?: string }).message || 'shared_project_lookup_failed');
    }
  } else {
    projectRow = projectResult.data;
  }

  if (!projectRow) return null;

  // Handle member result errors (project_members table may not exist)
  if (memberResult.error) {
    if (getSharedProjectsSchemaIssue(memberResult.error) === 'project_members') {
      projectMembersAvailable = false;
      logSharedProjectsFallback('project_members', memberResult.error);
    } else {
      throw new Error((memberResult.error as { message?: string }).message || 'shared_member_check_failed');
    }
  }

  // Determine access role: owner or member
  let accessRole: SharedProjectAccessRole | null = null;
  if (projectRow.user_id === userId) {
    accessRole = 'owner';
  } else if (projectMembersAvailable && memberResult.data) {
    accessRole = 'editor';
  }

  if (!accessRole) return null;

  // Step 2: Fetch counts and username in parallel using efficient COUNT queries
  const [wordCount, collaboratorCount, usernameByUserId] = await Promise.all([
    admin
      .from('words')
      .select('*', { count: 'exact', head: true })
      .eq('project_id', projectId)
      .then(({ count }) => count ?? 0)
      .catch(() => 0),
    projectMembersAvailable
      ? admin
        .from('project_members')
        .select('*', { count: 'exact', head: true })
        .eq('project_id', projectId)
        .then(({ count }) => 1 + (count ?? 0))
        .catch(() => 1)
      : Promise.resolve(1),
    getUsernamesByUserIds(admin, [projectRow.user_id]),
  ]);

  const wordCountByProjectId = new Map([[projectId, wordCount]]);
  const collaboratorCountByProjectId = new Map([[projectId, collaboratorCount]]);

  return mapSharedProjectSummary(
    projectRow,
    accessRole,
    wordCountByProjectId,
    collaboratorCountByProjectId,
    usernameByUserId,
  );
}

export async function getPublicSharedProject(projectId: string): Promise<SharedProjectSummary | null> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from('projects')
    .select(PROJECT_SHARED_SELECT_COLUMNS)
    .eq('id', projectId)
    .eq('share_scope', 'public')
    .not('share_id', 'is', null)
    .maybeSingle<ProjectRow>();

  if (error) {
    if (getSharedProjectsSchemaIssue(error) === 'share_scope') {
      logSharedProjectsFallback('share_scope', error);
      return null;
    }
    throw new Error(error.message || 'public_shared_project_lookup_failed');
  }
  if (!data) return null;

  const [wordCountByProjectId, collaboratorCountByProjectId, usernameByUserId] = await Promise.all([
    getWordCountByProjectId(admin, [projectId]),
    getCollaboratorCountByProjectId(admin, [projectId], true),
    getUsernamesByUserIds(admin, [data.user_id]),
  ]);

  return mapSharedProjectSummary(
    data,
    'viewer',
    wordCountByProjectId,
    collaboratorCountByProjectId,
    usernameByUserId,
  );
}

export async function requireSharedProjectAccess(
  request: NextRequest,
  projectId: string,
) {
  const auth = await requireAuthenticatedUser(request);
  if (!auth.ok) {
    return auth;
  }

  const access = await getAccessibleSharedProject(projectId, auth.user.id);
  if (access) {
    return {
      ok: true as const,
      user: auth.user,
      access,
    };
  }

  const publicAccess = await getPublicSharedProject(projectId);
  if (publicAccess) {
    return {
      ok: true as const,
      user: auth.user,
      access: publicAccess,
    };
  }

  return {
    ok: false as const,
    response: NextResponse.json({ success: false, error: '共有単語帳にアクセスできません。' }, { status: 403 }),
  };
}

export async function listSharedProjects(
  userId: string,
  admin: SupabaseAdminClient = getSupabaseAdmin(),
): Promise<SharedProjectListPayload> {
  let shareScopeAvailable = true;
  let projectMembersAvailable = true;

  let ownedRows: ProjectRow[];
  try {
    ownedRows = await fetchOwnedProjects(admin, userId, true);
  } catch (error) {
    if (getSharedProjectsSchemaIssue(error) !== 'share_scope') {
      throw error;
    }

    shareScopeAvailable = false;
    logSharedProjectsFallback('share_scope', error);
    ownedRows = await fetchOwnedProjects(admin, userId, false);
  }

  let membershipRows: ProjectMembershipRow[] = [];
  try {
    membershipRows = await fetchMembershipRows(admin, userId);
  } catch (error) {
    if (getSharedProjectsSchemaIssue(error) !== 'project_members') {
      throw error;
    }

    projectMembersAvailable = false;
    logSharedProjectsFallback('project_members', error);
  }

  const joinedProjectIds = Array.from(
    new Set(membershipRows.map((row) => row.project_id as string).filter(Boolean)),
  );

  const joinedRows = joinedProjectIds.length > 0
    ? await fetchProjectsByIds(admin, joinedProjectIds, shareScopeAvailable)
    : [];

  const allRows = [...ownedRows, ...joinedRows];
  const projectIds = Array.from(new Set(allRows.map((row) => row.id)));
  const allUserIds = Array.from(new Set(allRows.map((row) => row.user_id)));
  const [wordCountByProjectId, collaboratorCountByProjectId, usernameByUserId] = await Promise.all([
    getWordCountByProjectId(admin, projectIds),
    getCollaboratorCountByProjectId(admin, projectIds, projectMembersAvailable),
    getUsernamesByUserIds(admin, allUserIds),
  ]);

  const membershipRoleByProjectId = new Map<string, SharedProjectAccessRole>(
    membershipRows.map((row) => [
      row.project_id,
      row.role === 'editor' ? 'editor' : 'editor',
    ]),
  );

  const owned = ownedRows.map((row) =>
    mapSharedProjectSummary(row, 'owner', wordCountByProjectId, collaboratorCountByProjectId, usernameByUserId),
  );

  const joined = projectMembersAvailable
    ? joinedRows
      .filter((row) => row.user_id !== userId)
      .map((row) =>
        mapSharedProjectSummary(
          row,
          membershipRoleByProjectId.get(row.id) ?? 'editor',
          wordCountByProjectId,
          collaboratorCountByProjectId,
          usernameByUserId,
        ),
      )
    : [];

  const excludedProjectIds = new Set<string>([
    ...owned.map((item) => item.project.id),
    ...joined.map((item) => item.project.id),
  ]);

  const publicRows = shareScopeAvailable
    ? await fetchPublicProjects(admin, Array.from(excludedProjectIds))
    : [];
  const publicProjectIds = publicRows.map((row) => row.id);
  const publicUserIds = publicRows.map((row) => row.user_id);
  const [publicWordCountByProjectId, publicCollaboratorCountByProjectId, publicUsernameByUserId] = await Promise.all([
    getWordCountByProjectId(admin, publicProjectIds),
    getCollaboratorCountByProjectId(admin, publicProjectIds, projectMembersAvailable),
    getUsernamesByUserIds(admin, publicUserIds),
  ]);

  const publicProjects = publicRows.map((row) =>
    mapSharedProjectSummary(
      row,
      'viewer',
      publicWordCountByProjectId,
      publicCollaboratorCountByProjectId,
      publicUsernameByUserId,
    ),
  );

  return { owned, joined, public: publicProjects };
}

export async function upsertProjectMember(
  projectId: string,
  userId: string,
  addedByUserId: string,
  admin: SupabaseAdminClient = getSupabaseAdmin(),
) {
  const { error } = await admin
    .from('project_members')
    .upsert(
      [{
        project_id: projectId,
        user_id: userId,
        role: 'editor',
        added_by_user_id: addedByUserId,
      }],
      { onConflict: 'project_id,user_id', ignoreDuplicates: false },
    );

  if (error) {
    if (getSharedProjectsSchemaIssue(error) === 'project_members') {
      throw new SharedProjectsSchemaUnavailableError(
        'project_members',
        error.message || 'shared_project_members_schema_unavailable',
      );
    }

    throw new Error(error.message || 'shared_project_join_failed');
  }
}

export function getSharedProjectsSchemaIssue(error: unknown): SharedSchemaDependency | null {
  if (error instanceof SharedProjectsSchemaUnavailableError) {
    return error.missing;
  }

  const normalized = normalizeErrorText(error);
  if (!normalized) {
    return null;
  }

  if (
    normalized.includes('project_members')
    && (
      normalized.includes('does not exist')
      || normalized.includes('relation')
      || normalized.includes('schema cache')
      || normalized.includes('could not find')
    )
  ) {
    return 'project_members';
  }

  if (
    normalized.includes('share_scope')
    && (
      normalized.includes('does not exist')
      || normalized.includes('column')
      || normalized.includes('schema cache')
      || normalized.includes('could not find')
    )
  ) {
    return 'share_scope';
  }

  return null;
}

async function fetchOwnedProjects(
  admin: SupabaseAdminClient,
  userId: string,
  includeShareScope: boolean,
): Promise<ProjectRow[]> {
  const { data, error } = await admin
    .from('projects')
    .select(includeShareScope ? PROJECT_SHARED_SELECT_COLUMNS : PROJECT_BASE_SELECT_COLUMNS)
    .eq('user_id', userId)
    .not('share_id', 'is', null)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(error.message || 'shared_owned_lookup_failed');
  }

  return (data ?? []) as unknown as ProjectRow[];
}

async function fetchMembershipRows(
  admin: SupabaseAdminClient,
  userId: string,
): Promise<ProjectMembershipRow[]> {
  const { data, error } = await admin
    .from('project_members')
    .select('project_id, role')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(error.message || 'shared_membership_lookup_failed');
  }

  return (data ?? []) as unknown as ProjectMembershipRow[];
}

async function fetchProjectsByIds(
  admin: SupabaseAdminClient,
  projectIds: string[],
  includeShareScope: boolean,
): Promise<ProjectRow[]> {
  if (projectIds.length === 0) return [];

  const { data, error } = await admin
    .from('projects')
    .select(includeShareScope ? PROJECT_SHARED_SELECT_COLUMNS : PROJECT_BASE_SELECT_COLUMNS)
    .in('id', projectIds);

  if (error) {
    throw new Error(error.message || 'shared_joined_projects_lookup_failed');
  }

  return (data ?? []) as unknown as ProjectRow[];
}

async function fetchPublicProjects(
  admin: SupabaseAdminClient,
  excludedProjectIds: string[],
): Promise<ProjectRow[]> {
  const { data, error } = await admin
    .from('projects')
    .select(PROJECT_SHARED_SELECT_COLUMNS)
    .eq('share_scope', 'public')
    .not('share_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(60);
  if (error) {
    if (getSharedProjectsSchemaIssue(error) === 'share_scope') {
      logSharedProjectsFallback('share_scope', error);
      return [];
    }
    throw new Error(error.message || 'public_shared_projects_lookup_failed');
  }

  const excluded = new Set(excludedProjectIds);

  return ((data ?? []) as unknown as ProjectRow[])
    .filter((row) => !excluded.has(row.id))
    .slice(0, 30);
}

async function getWordCountByProjectId(
  admin: SupabaseAdminClient,
  projectIds: string[],
): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  for (const projectId of projectIds) {
    result.set(projectId, 0);
  }
  if (projectIds.length === 0) return result;

  // Use a single-column select to minimize data transfer (only project_id, no full row)
  const { data, error } = await admin
    .from('words')
    .select('project_id')
    .in('project_id', projectIds);

  if (error) {
    throw new Error(error.message || 'shared_word_counts_failed');
  }

  for (const row of data ?? []) {
    const projectId = row.project_id as string;
    result.set(projectId, (result.get(projectId) ?? 0) + 1);
  }

  return result;
}

async function getCollaboratorCountByProjectId(
  admin: SupabaseAdminClient,
  projectIds: string[],
  projectMembersAvailable: boolean,
): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  for (const projectId of projectIds) {
    result.set(projectId, 1);
  }
  if (projectIds.length === 0 || !projectMembersAvailable) return result;

  const { data, error } = await admin
    .from('project_members')
    .select('project_id')
    .in('project_id', projectIds);

  if (error) {
    if (getSharedProjectsSchemaIssue(error) === 'project_members') {
      logSharedProjectsFallback('project_members', error);
      return result;
    }
    throw new Error(error.message || 'shared_collaborator_counts_failed');
  }

  for (const row of data ?? []) {
    const projectId = row.project_id as string;
    result.set(projectId, (result.get(projectId) ?? 1) + 1);
  }

  return result;
}

function mapSharedProjectSummary(
  row: ProjectRow,
  accessRole: SharedProjectAccessRole,
  wordCountByProjectId: Map<string, number>,
  collaboratorCountByProjectId: Map<string, number>,
  usernameByUserId?: Map<string, string | null>,
): SharedProjectSummary {
  return {
    project: mapProjectFromRow(row),
    accessRole,
    wordCount: wordCountByProjectId.get(row.id) ?? 0,
    collaboratorCount: collaboratorCountByProjectId.get(row.id) ?? 1,
    ownerUsername: usernameByUserId?.get(row.user_id) ?? null,
  };
}

async function getUsernamesByUserIds(
  admin: SupabaseAdminClient,
  userIds: string[],
): Promise<Map<string, string | null>> {
  const result = new Map<string, string | null>();
  if (userIds.length === 0) return result;

  const uniqueIds = Array.from(new Set(userIds));

  try {
    const { data, error } = await admin
      .from('profiles')
      .select('user_id, username')
      .in('user_id', uniqueIds);

    if (error) {
      console.warn('Failed to fetch usernames for shared projects:', error.message);
      return result;
    }

    for (const row of data ?? []) {
      result.set(row.user_id as string, (row.username as string | null) ?? null);
    }
  } catch {
    // profiles table may not exist yet; graceful fallback
  }

  return result;
}

function normalizeErrorText(error: unknown): string {
  if (!error) return '';

  if (typeof error === 'string') {
    return error.toLowerCase();
  }

  const parts: string[] = [];
  if (error instanceof Error) {
    parts.push(error.message);
  }

  const maybeSupabaseError = error as SupabaseLikeError;
  parts.push(
    maybeSupabaseError.code ?? '',
    maybeSupabaseError.message ?? '',
    maybeSupabaseError.details ?? '',
    maybeSupabaseError.hint ?? '',
  );

  return parts
    .join(' ')
    .trim()
    .toLowerCase();
}

function logSharedProjectsFallback(missing: SharedSchemaDependency, error: unknown) {
  const detail = error instanceof Error ? error.message : String(error);
  console.warn(`shared-projects schema fallback activated: ${missing}`, detail);
}
