import { NextRequest, NextResponse } from 'next/server';
import { resolveAuthenticatedUser } from '@/app/api/share-import/shared';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import type {
  AccessibleSharedProjectListPayload,
  PublicSharedProjectListPayload,
  SharedProjectAccessRole,
  SharedProjectCard,
  SharedProjectMetrics,
  SharedProjectSummary,
} from '@/lib/shared-projects/types';
import { mapProjectFromRow, type ProjectRow } from '../../../../shared/db';

type ProjectMembershipRow = {
  project_id: string;
  role: string | null;
};

type SharedSchemaDependency = 'project_members' | 'share_scope' | 'shared_metrics_rpc';

type SupabaseLikeError = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
};

type SharedProjectMetricsRow = {
  project_id: string;
  word_count: number | string | null;
  collaborator_count: number | string | null;
};

type SharedProjectCursor = {
  createdAt: string;
  id: string;
};

type PublicSharedProjectListOptions = {
  limit?: number;
  cursor?: string | null;
};

type SupabaseAdminClient = ReturnType<typeof getSupabaseAdmin>;

const SHARE_CODE_PATTERN = /^[A-Za-z0-9_-]{4,64}$/;
const PROJECT_BASE_SELECT_COLUMNS = 'id,user_id,title,source_labels,icon_image,created_at,share_id,is_favorite';
const PROJECT_SHARED_SELECT_COLUMNS = `${PROJECT_BASE_SELECT_COLUMNS},share_scope`;
const DEFAULT_PUBLIC_PAGE_SIZE = 8;
const MAX_PUBLIC_PAGE_SIZE = 24;
const PUBLIC_CURSOR_FETCH_PADDING = 24;

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

async function getOwnedOrMemberSharedProject(
  projectId: string,
  userId: string,
  admin: SupabaseAdminClient = getSupabaseAdmin(),
): Promise<SharedProjectSummary | null> {
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

  let projectMembersAvailable = true;
  let projectRow: ProjectRow | null = null;

  if (projectResult.error) {
    if (getSharedProjectsSchemaIssue(projectResult.error) === 'share_scope') {
      logSharedProjectsFallback('share_scope', projectResult.error);
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

  if (memberResult.error) {
    if (getSharedProjectsSchemaIssue(memberResult.error) === 'project_members') {
      projectMembersAvailable = false;
      logSharedProjectsFallback('project_members', memberResult.error);
    } else {
      throw new Error((memberResult.error as { message?: string }).message || 'shared_member_check_failed');
    }
  }

  let accessRole: SharedProjectAccessRole | null = null;
  if (projectRow.user_id === userId) {
    accessRole = 'owner';
  } else if (projectMembersAvailable && memberResult.data) {
    accessRole = 'editor';
  }

  if (!accessRole) return null;

  const [metricsByProjectId, usernameByUserId] = await Promise.all([
    getSharedProjectMetrics([projectId], admin),
    getUsernamesByUserIds(admin, [projectRow.user_id]),
  ]);

  return mapSharedProjectSummary(
    projectRow,
    accessRole,
    metricsByProjectId,
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

  const [metricsByProjectId, usernameByUserId] = await Promise.all([
    getSharedProjectMetrics([projectId], admin),
    getUsernamesByUserIds(admin, [data.user_id]),
  ]);

  return mapSharedProjectSummary(
    data,
    'viewer',
    metricsByProjectId,
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

export async function listAccessibleSharedProjects(
  userId: string,
  admin: SupabaseAdminClient = getSupabaseAdmin(),
): Promise<AccessibleSharedProjectListPayload> {
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
    new Set(membershipRows.map((row) => row.project_id).filter(Boolean)),
  );

  const joinedRows = joinedProjectIds.length > 0
    ? await fetchProjectsByIds(admin, joinedProjectIds, shareScopeAvailable)
    : [];

  const allUserIds = Array.from(new Set([...ownedRows, ...joinedRows].map((row) => row.user_id)));
  const usernameByUserId = await getUsernamesByUserIds(admin, allUserIds);

  const membershipRoleByProjectId = new Map<string, SharedProjectAccessRole>(
    membershipRows.map((row) => [row.project_id, row.role === 'editor' ? 'editor' : 'editor']),
  );

  const owned = ownedRows.map((row) =>
    mapSharedProjectCard(row, 'owner', usernameByUserId),
  );

  const joined = projectMembersAvailable
    ? joinedRows
      .filter((row) => row.user_id !== userId)
      .map((row) =>
        mapSharedProjectCard(
          row,
          membershipRoleByProjectId.get(row.id) ?? 'editor',
          usernameByUserId,
        ),
      )
    : [];

  return { owned, joined };
}

export async function listPublicSharedProjects(
  options: PublicSharedProjectListOptions = {},
  admin: SupabaseAdminClient = getSupabaseAdmin(),
): Promise<PublicSharedProjectListPayload> {
  const limit = clampPublicPageSize(options.limit);
  const cursor = decodePublicCursor(options.cursor ?? null);

  let rows: ProjectRow[];
  try {
    rows = await fetchPublicProjectsPage(admin, limit, cursor);
  } catch (error) {
    if (getSharedProjectsSchemaIssue(error) === 'share_scope') {
      logSharedProjectsFallback('share_scope', error);
      return { items: [], nextCursor: null };
    }
    throw error;
  }

  const filteredRows = cursor
    ? rows.filter((row) => compareRowAgainstCursor(row, cursor) > 0)
    : rows;
  const pageRows = filteredRows.slice(0, limit);
  const usernameByUserId = await getUsernamesByUserIds(
    admin,
    pageRows.map((row) => row.user_id),
  );

  return {
    items: pageRows.map((row) => mapSharedProjectCard(row, 'viewer', usernameByUserId)),
    nextCursor: pageRows.length === limit
      ? encodePublicCursor(pageRows[pageRows.length - 1]!)
      : null,
  };
}

export async function getSharedProjectMetrics(
  projectIds: string[],
  admin: SupabaseAdminClient = getSupabaseAdmin(),
): Promise<Map<string, SharedProjectMetrics>> {
  const uniqueProjectIds = Array.from(new Set(projectIds.filter(Boolean)));
  const result = new Map<string, SharedProjectMetrics>();

  for (const projectId of uniqueProjectIds) {
    result.set(projectId, { wordCount: 0, collaboratorCount: 1 });
  }

  if (uniqueProjectIds.length === 0) {
    return result;
  }

  try {
    const { data, error } = await admin.rpc('get_shared_project_metrics', {
      project_ids: uniqueProjectIds,
    });

    if (error) {
      throw new SharedProjectsSchemaUnavailableError(
        'shared_metrics_rpc',
        error.message || 'shared_metrics_rpc_failed',
      );
    }

    for (const row of (data ?? []) as SharedProjectMetricsRow[]) {
      result.set(row.project_id, {
        wordCount: Number(row.word_count ?? 0),
        collaboratorCount: Number(row.collaborator_count ?? 1),
      });
    }

    return result;
  } catch (error) {
    const schemaIssue = getSharedProjectsSchemaIssue(error);
    if (schemaIssue && schemaIssue !== 'shared_metrics_rpc' && schemaIssue !== 'project_members') {
      throw error;
    }

    if (schemaIssue) {
      logSharedProjectsFallback(schemaIssue, error);
    }

    return getSharedProjectMetricsFallback(uniqueProjectIds, admin, result);
  }
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

  if (
    normalized.includes('get_shared_project_metrics')
    && (
      normalized.includes('does not exist')
      || normalized.includes('function')
      || normalized.includes('schema cache')
      || normalized.includes('could not find')
    )
  ) {
    return 'shared_metrics_rpc';
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
    .in('id', projectIds)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(error.message || 'shared_joined_projects_lookup_failed');
  }

  return (data ?? []) as unknown as ProjectRow[];
}

async function fetchPublicProjectsPage(
  admin: SupabaseAdminClient,
  limit: number,
  cursor: SharedProjectCursor | null,
): Promise<ProjectRow[]> {
  const fetchSize = cursor ? limit + PUBLIC_CURSOR_FETCH_PADDING : limit + 1;
  let query = admin
    .from('projects')
    .select(PROJECT_SHARED_SELECT_COLUMNS)
    .eq('share_scope', 'public')
    .not('share_id', 'is', null)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false });

  if (cursor) {
    query = query.lte('created_at', cursor.createdAt);
  }

  const { data, error } = await query.limit(fetchSize);
  if (error) {
    throw new Error(error.message || 'public_shared_projects_lookup_failed');
  }

  return (data ?? []) as unknown as ProjectRow[];
}

async function getSharedProjectMetricsFallback(
  projectIds: string[],
  admin: SupabaseAdminClient,
  seed: Map<string, SharedProjectMetrics>,
): Promise<Map<string, SharedProjectMetrics>> {
  await Promise.all(projectIds.map(async (projectId) => {
    const [wordResult, collaboratorResult] = await Promise.all([
      admin
        .from('words')
        .select('*', { count: 'exact', head: true })
        .eq('project_id', projectId),
      admin
        .from('project_members')
        .select('*', { count: 'exact', head: true })
        .eq('project_id', projectId),
    ]);

    const wordCount = wordResult.count ?? 0;
    let collaboratorCount = 1;

    if (collaboratorResult.error) {
      if (getSharedProjectsSchemaIssue(collaboratorResult.error) === 'project_members') {
        logSharedProjectsFallback('project_members', collaboratorResult.error);
      } else {
        throw new Error(collaboratorResult.error.message || 'shared_collaborator_counts_failed');
      }
    } else {
      collaboratorCount = 1 + (collaboratorResult.count ?? 0);
    }

    if (wordResult.error) {
      throw new Error(wordResult.error.message || 'shared_word_counts_failed');
    }

    seed.set(projectId, {
      wordCount,
      collaboratorCount,
    });
  }));

  return seed;
}

function mapSharedProjectCard(
  row: ProjectRow,
  accessRole: SharedProjectAccessRole,
  usernameByUserId?: Map<string, string | null>,
): SharedProjectCard {
  return {
    project: mapProjectFromRow(row),
    accessRole,
    ownerUsername: usernameByUserId?.get(row.user_id) ?? null,
  };
}

function mapSharedProjectSummary(
  row: ProjectRow,
  accessRole: SharedProjectAccessRole,
  metricsByProjectId: Map<string, SharedProjectMetrics>,
  usernameByUserId?: Map<string, string | null>,
): SharedProjectSummary {
  const metrics = metricsByProjectId.get(row.id) ?? { wordCount: 0, collaboratorCount: 1 };

  return {
    ...mapSharedProjectCard(row, accessRole, usernameByUserId),
    wordCount: metrics.wordCount,
    collaboratorCount: metrics.collaboratorCount,
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

function clampPublicPageSize(limit?: number): number {
  if (!Number.isFinite(limit)) return DEFAULT_PUBLIC_PAGE_SIZE;
  return Math.max(1, Math.min(MAX_PUBLIC_PAGE_SIZE, Number(limit)));
}

function encodePublicCursor(row: Pick<ProjectRow, 'created_at' | 'id'>): string {
  return Buffer.from(
    JSON.stringify({
      createdAt: row.created_at,
      id: row.id,
    }),
    'utf8',
  ).toString('base64url');
}

function decodePublicCursor(cursor: string | null): SharedProjectCursor | null {
  if (!cursor) return null;

  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as Partial<SharedProjectCursor>;
    if (
      typeof parsed.createdAt === 'string'
      && parsed.createdAt
      && typeof parsed.id === 'string'
      && parsed.id
    ) {
      return {
        createdAt: parsed.createdAt,
        id: parsed.id,
      };
    }
  } catch {
    // Ignore invalid cursors and restart from the first page.
  }

  return null;
}

function compareRowAgainstCursor(row: Pick<ProjectRow, 'created_at' | 'id'>, cursor: SharedProjectCursor): number {
  if (row.created_at < cursor.createdAt) return 1;
  if (row.created_at > cursor.createdAt) return -1;
  if (row.id < cursor.id) return 1;
  if (row.id > cursor.id) return -1;
  return 0;
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
