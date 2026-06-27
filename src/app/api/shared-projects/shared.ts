import { NextRequest, NextResponse } from 'next/server';
import { resolveAuthenticatedUser } from '@/app/api/share-import/shared';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import type {
  AccessibleSharedProjectListPayload,
  PublicSharedProjectListPayload,
  SharedProjectAccessRole,
  SharedProjectCard,
  SharedUserSummary,
  SharedProjectMetrics,
  SharedProjectPreviewPayload,
  SharedProjectSummary,
} from '@/lib/shared-projects/types';
import {
  SHARE_VIEW_WORD_SELECT_COLUMNS,
  SHARE_VIEW_WORD_SELECT_COLUMNS_BASIC,
  SHARE_VIEW_WORD_SELECT_COLUMNS_DISPLAY,
  SHARE_VIEW_WORD_SELECT_COLUMNS_DISPLAY_WITH_PRONUNCIATION,
  SHARE_VIEW_WORD_SELECT_COLUMNS_EXAMPLE,
  SHARE_VIEW_WORD_SELECT_COLUMNS_MINIMAL,
  SHARE_VIEW_WORD_SELECT_COLUMNS_WITHOUT_SENSES,
} from '@/lib/words/resolved';
import { createSharedSearchEmbedding } from '@/lib/shared-projects/tag-embeddings';
import { mapProjectFromRow, mapWordFromRow, type ProjectRow, type WordRow } from '../../../../shared/db';
import { formatSharedTag } from '../../../../shared/shared-tags';

type ProjectMembershipRow = {
  project_id: string;
  role: string | null;
};

type SharedSchemaDependency =
  | 'project_members'
  | 'share_scope'
  | 'shared_metrics_rpc'
  | 'shared_tags'
  | 'shared_tag_embeddings'
  | 'study_group_members'
  | 'study_group_projects';

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
  like_count?: number | string | null;
};

type SharedProjectCursor = {
  createdAt: string;
  id: string;
};

type SharedProfileSummary = {
  username: string | null;
  accountId: string | null;
};

type StudyGroupProjectAccessRow = {
  group_id: string;
};

type PublicSharedProjectListOptions = {
  limit?: number;
  cursor?: string | null;
  query?: string | null;
};

type SupabaseAdminClient = ReturnType<typeof getSupabaseAdmin>;

const SHARE_CODE_PATTERN = /^[A-Za-z0-9_-]{4,64}$/;
const PROJECT_BASE_SELECT_COLUMNS = 'id,user_id,title,source_labels,shared_tags,icon_image,created_at,share_id,is_favorite,description';
const PROJECT_BASE_SELECT_COLUMNS_WITHOUT_SHARED_TAGS = 'id,user_id,title,source_labels,icon_image,created_at,share_id,is_favorite,description';
const PROJECT_SHARED_SELECT_COLUMNS = `${PROJECT_BASE_SELECT_COLUMNS},share_scope`;
const PROJECT_SHARED_SELECT_COLUMNS_WITHOUT_SHARED_TAGS = `${PROJECT_BASE_SELECT_COLUMNS_WITHOUT_SHARED_TAGS},share_scope`;
const DEFAULT_PUBLIC_PAGE_SIZE = 8;
const MAX_PUBLIC_PAGE_SIZE = 24;
const PUBLIC_CURSOR_FETCH_PADDING = 24;
const PUBLIC_VECTOR_MATCH_THRESHOLD = 0.2;
const PUBLIC_VECTOR_MATCH_LIMIT = 120;
const DEFAULT_SHARE_PREVIEW_WORD_LIMIT = 5;
const MAX_SHARE_PREVIEW_WORD_LIMIT = 20;

const SHARE_PREVIEW_WORD_SELECT_FALLBACKS = [
  { label: 'primary', columns: SHARE_VIEW_WORD_SELECT_COLUMNS },
  { label: 'without lexicon_senses', columns: SHARE_VIEW_WORD_SELECT_COLUMNS_WITHOUT_SENSES },
  { label: 'without relation embeds', columns: SHARE_VIEW_WORD_SELECT_COLUMNS_BASIC },
  { label: 'display with pronunciation', columns: SHARE_VIEW_WORD_SELECT_COLUMNS_DISPLAY_WITH_PRONUNCIATION },
  { label: 'display', columns: SHARE_VIEW_WORD_SELECT_COLUMNS_DISPLAY },
  { label: 'example', columns: SHARE_VIEW_WORD_SELECT_COLUMNS_EXAMPLE },
  { label: 'minimal', columns: SHARE_VIEW_WORD_SELECT_COLUMNS_MINIMAL },
] as const;

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

function shouldRetrySharedPreviewWordSelect(error: SupabaseLikeError | null): boolean {
  if (!error) return false;
  const text = `${error.code ?? ''} ${error.message ?? ''} ${error.details ?? ''} ${error.hint ?? ''}`;
  return (
    error.code === 'PGRST200'
    || error.code === 'PGRST204'
    || error.code === '42703'
    || /schema cache/i.test(text)
    || /column .* does not exist/i.test(text)
    || /could not find .* column/i.test(text)
    || /undefined column/i.test(text)
    || /relationship/i.test(text)
    || /word_translations|lexicon_senses|lexicon_sense_id/i.test(text)
  );
}

async function selectSharePreviewWordsWithFallback(
  admin: SupabaseAdminClient,
  projectId: string,
  limit: number,
): Promise<{ data: WordRow[] | null; error: SupabaseLikeError | null; count?: number | null }> {
  let lastResult: { data: WordRow[] | null; error: SupabaseLikeError | null; count?: number | null } | null = null;

  for (const fallback of SHARE_PREVIEW_WORD_SELECT_FALLBACKS) {
    const result = await admin
      .from('words')
      .select(fallback.columns, { count: 'exact' })
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(limit) as { data: WordRow[] | null; error: SupabaseLikeError | null; count?: number | null };

    if (!shouldRetrySharedPreviewWordSelect(result.error)) {
      return result;
    }

    lastResult = result;
    console.warn(`[shared-projects] share preview word select fallback: ${fallback.label}`, {
      code: result.error?.code,
      message: result.error?.message,
    });
  }

  return lastResult ?? { data: null, error: { message: 'shared_project_preview_words_failed' } };
}

export async function getProjectByShareCode(
  shareCode: string,
  admin: SupabaseAdminClient = getSupabaseAdmin(),
): Promise<ProjectRow | null> {
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

export async function getSharedProjectPreviewByShareCode(
  shareCode: string,
  wordLimit = DEFAULT_SHARE_PREVIEW_WORD_LIMIT,
  admin: SupabaseAdminClient = getSupabaseAdmin(),
): Promise<SharedProjectPreviewPayload | null> {
  const projectRow = await getProjectByShareCode(shareCode, admin);
  if (!projectRow) return null;

  const limit = clampSharePreviewWordLimit(wordLimit);
  const [wordsResult, profileByUserId, metricsByProjectId] = await Promise.all([
    selectSharePreviewWordsWithFallback(admin, projectRow.id, limit),
    getProfilesByUserIds(admin, [projectRow.user_id]),
    getSharedProjectMetrics([projectRow.id], admin),
  ]);
  const ownerProfile = profileByUserId.get(projectRow.user_id);

  if (wordsResult.error) {
    throw new Error(wordsResult.error.message || 'shared_project_preview_words_failed');
  }

  return {
    project: mapProjectFromRow(projectRow),
    words: ((wordsResult.data ?? []) as WordRow[]).map(mapWordFromRow),
    totalWordCount: wordsResult.count ?? wordsResult.data?.length ?? 0,
    likeCount: metricsByProjectId.get(projectRow.id)?.likeCount ?? 0,
    ownerUsername: ownerProfile?.username ?? null,
    ownerAccountId: ownerProfile?.accountId ?? null,
  };
}

export async function getAccessibleSharedProject(
  projectIdOrShareCode: string,
  userId: string,
  admin: SupabaseAdminClient = getSupabaseAdmin(),
): Promise<SharedProjectSummary | null> {
  const projectId = await resolveSharedProjectId(projectIdOrShareCode, admin);
  if (!projectId) return null;

  const directAccess = await getOwnedOrMemberSharedProject(projectId, userId, admin);
  if (directAccess) return directAccess;

  return getStudyGroupSharedProject(projectId, userId, admin);
}

async function resolveSharedProjectId(
  projectIdOrShareCode: string,
  admin: SupabaseAdminClient,
): Promise<string | null> {
  const projectById = await fetchSharedProjectRowById(
    projectIdOrShareCode,
    admin,
    'shared_project_identifier_lookup_failed',
  );
  if (projectById) return projectById.id;

  const projectByShareCode = await getProjectByShareCode(projectIdOrShareCode, admin);
  return projectByShareCode?.id ?? null;
}

async function getOwnedOrMemberSharedProject(
  projectId: string,
  userId: string,
  admin: SupabaseAdminClient = getSupabaseAdmin(),
): Promise<SharedProjectSummary | null> {
  const [projectRow, memberResult] = await Promise.all([
    fetchSharedProjectRowById(projectId, admin, 'shared_project_lookup_failed'),
    admin
      .from('project_members')
      .select('role')
      .eq('project_id', projectId)
      .eq('user_id', userId)
      .maybeSingle<{ role: string | null }>(),
  ]);

  let projectMembersAvailable = true;

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

  const [metricsByProjectId, profileByUserId] = await Promise.all([
    getSharedProjectMetrics([projectId], admin),
    getProfilesByUserIds(admin, [projectRow.user_id]),
  ]);

  return mapSharedProjectSummary(
    projectRow,
    accessRole,
    metricsByProjectId,
    profileByUserId,
  );
}

async function getStudyGroupSharedProject(
  projectId: string,
  userId: string,
  admin: SupabaseAdminClient,
): Promise<SharedProjectSummary | null> {
  const { data: groupProjectRows, error: groupProjectsError } = await admin
    .from('study_group_projects')
    .select('group_id')
    .eq('project_id', projectId);

  if (groupProjectsError) {
    if (getSharedProjectsSchemaIssue(groupProjectsError) === 'study_group_projects') {
      logSharedProjectsFallback('study_group_projects', groupProjectsError);
      return null;
    }

    throw new Error(groupProjectsError.message || 'study_group_shared_project_lookup_failed');
  }

  const groupIds = Array.from(
    new Set(((groupProjectRows ?? []) as StudyGroupProjectAccessRow[])
      .map((row) => row.group_id)
      .filter(Boolean)),
  );
  if (groupIds.length === 0) return null;

  const { data: memberships, error: membershipsError } = await admin
    .from('study_group_members')
    .select('group_id')
    .eq('user_id', userId)
    .in('group_id', groupIds)
    .limit(1);

  if (membershipsError) {
    if (getSharedProjectsSchemaIssue(membershipsError) === 'study_group_members') {
      logSharedProjectsFallback('study_group_members', membershipsError);
      return null;
    }

    throw new Error(membershipsError.message || 'study_group_shared_project_membership_failed');
  }

  if (!((memberships ?? []) as StudyGroupProjectAccessRow[]).length) return null;

  const projectRow = await fetchSharedProjectRowById(projectId, admin, 'study_group_shared_project_refresh_failed');
  if (!projectRow) return null;

  const [metricsByProjectId, profileByUserId] = await Promise.all([
    getSharedProjectMetrics([projectId], admin),
    getProfilesByUserIds(admin, [projectRow.user_id]),
  ]);

  return mapSharedProjectSummary(
    projectRow,
    'viewer',
    metricsByProjectId,
    profileByUserId,
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

  const [metricsByProjectId, profileByUserId] = await Promise.all([
    getSharedProjectMetrics([projectId], admin),
    getProfilesByUserIds(admin, [data.user_id]),
  ]);

  return mapSharedProjectSummary(
    data,
    'viewer',
    metricsByProjectId,
    profileByUserId,
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

  const allRows = [...ownedRows, ...joinedRows];
  const allUserIds = Array.from(new Set(allRows.map((row) => row.user_id)));
  const allProjectIds = allRows.map((row) => row.id);

  const [profileByUserId, metricsByProjectId] = await Promise.all([
    getProfilesByUserIds(admin, allUserIds),
    getSharedProjectMetrics(allProjectIds, admin),
  ]);

  const membershipRoleByProjectId = new Map<string, SharedProjectAccessRole>(
    membershipRows.map((row) => [row.project_id, row.role === 'editor' ? 'editor' : 'editor']),
  );

  const owned = ownedRows.map((row) => {
    const card = mapSharedProjectCard(row, 'owner', profileByUserId);
    const metrics = metricsByProjectId.get(row.id);
    return { ...card, wordCount: metrics?.wordCount ?? 0, collaboratorCount: metrics?.collaboratorCount ?? 1, likeCount: metrics?.likeCount ?? 0 };
  });

  const joined = projectMembersAvailable
    ? joinedRows
      .filter((row) => row.user_id !== userId)
      .map((row) => {
        const card = mapSharedProjectCard(
          row,
          membershipRoleByProjectId.get(row.id) ?? 'editor',
          profileByUserId,
        );
        const metrics = metricsByProjectId.get(row.id);
        return { ...card, wordCount: metrics?.wordCount ?? 0, collaboratorCount: metrics?.collaboratorCount ?? 1, likeCount: metrics?.likeCount ?? 0 };
      })
    : [];

  return { owned, joined };
}

export async function listPublicSharedProjects(
  options: PublicSharedProjectListOptions = {},
  admin: SupabaseAdminClient = getSupabaseAdmin(),
): Promise<PublicSharedProjectListPayload> {
  const limit = clampPublicPageSize(options.limit);
  const query = normalizeSearchQuery(options.query);

  if (query) {
    const cursorOffset = decodeOffsetCursor(options.cursor ?? null);
    const searchRows = await searchPublicProjects(admin, query, cursorOffset + limit + 1);
    const pageRows = searchRows.slice(cursorOffset, cursorOffset + limit);
    const profileByUserId = await getProfilesByUserIds(admin, pageRows.map((row) => row.user_id));
    const metricsByProjectId = await getSharedProjectMetrics(pageRows.map((row) => row.id), admin);

    return {
      items: pageRows.map((row) => {
        const card = mapSharedProjectCard(row, 'viewer', profileByUserId);
        const metrics = metricsByProjectId.get(row.id);
        return { ...card, wordCount: metrics?.wordCount ?? 0, collaboratorCount: metrics?.collaboratorCount ?? 1, likeCount: metrics?.likeCount ?? 0 };
      }),
      nextCursor: searchRows.length > cursorOffset + limit
        ? encodeOffsetCursor(cursorOffset + limit)
        : null,
    };
  }

  const cursor = decodePublicCursor(options.cursor ?? null);

  let rows: ProjectRow[];
  try {
    rows = await fetchPublicProjectsPage(admin, limit, cursor, Boolean(query), true);
  } catch (error) {
    if (getSharedProjectsSchemaIssue(error) === 'share_scope') {
      logSharedProjectsFallback('share_scope', error);
      return { items: [], nextCursor: null };
    }
    if (getSharedProjectsSchemaIssue(error) === 'shared_tags') {
      logSharedProjectsFallback('shared_tags', error);
      rows = await fetchPublicProjectsPage(admin, limit, cursor, Boolean(query), false);
    } else {
      throw error;
    }
  }

  const filteredRows = cursor
    ? rows.filter((row) => compareRowAgainstCursor(row, cursor) > 0)
    : rows;
  const profileByUserId = await getProfilesByUserIds(admin, filteredRows.map((row) => row.user_id));
  const matchingRows = query
    ? filteredRows.filter((row) => projectMatchesSearch(row, profileByUserId.get(row.user_id), query))
    : filteredRows;
  const pageRows = matchingRows.slice(0, limit);
  const metricsByProjectId = await getSharedProjectMetrics(pageRows.map((row) => row.id), admin);

  return {
    items: pageRows.map((row) => {
      const card = mapSharedProjectCard(row, 'viewer', profileByUserId);
      const metrics = metricsByProjectId.get(row.id);
      return { ...card, wordCount: metrics?.wordCount ?? 0, collaboratorCount: metrics?.collaboratorCount ?? 1, likeCount: metrics?.likeCount ?? 0 };
    }),
    nextCursor: matchingRows.length > limit
      ? encodePublicCursor(matchingRows[limit - 1]!)
      : null,
  };
}

export async function listPublicSharedUsers(
  options: Pick<PublicSharedProjectListOptions, 'limit' | 'cursor' | 'query'> = {},
  admin: SupabaseAdminClient = getSupabaseAdmin(),
): Promise<{ users: SharedUserSummary[]; nextCursor: string | null }> {
  const limit = clampPublicPageSize(options.limit);
  const query = normalizeSearchQuery(options.query);
  const cursorOffset = decodeOffsetCursor(options.cursor ?? null);
  const projectLimit = Math.max(80, (cursorOffset + limit + 1) * 4);

  let rows: ProjectRow[] = [];
  if (query) {
    rows = await searchPublicProjects(admin, query, projectLimit);
  } else {
    try {
      rows = await fetchPublicProjectsForUserDiscovery(admin, projectLimit, true);
    } catch (error) {
      if (getSharedProjectsSchemaIssue(error) === 'shared_tags') {
        logSharedProjectsFallback('shared_tags', error);
        rows = await fetchPublicProjectsForUserDiscovery(admin, projectLimit, false);
      } else if (getSharedProjectsSchemaIssue(error) === 'share_scope') {
        logSharedProjectsFallback('share_scope', error);
        return { users: [], nextCursor: null };
      } else {
        throw error;
      }
    }
  }

  const profileByUserId = await getProfilesByUserIds(admin, rows.map((row) => row.user_id));
  const matchingRows = rows;
  const projectIds = matchingRows.map((row) => row.id);
  const metricsByProjectId = await getSharedProjectMetrics(projectIds, admin);
  const userById = new Map<string, SharedUserSummary>();

  for (const row of matchingRows) {
    const metrics = metricsByProjectId.get(row.id) ?? { wordCount: 0, collaboratorCount: 1, likeCount: 0 };
    const existing = userById.get(row.user_id);
    if (existing) {
      existing.projectCount += 1;
      existing.wordCount += metrics.wordCount;
      existing.likeCount += metrics.likeCount;
      continue;
    }

    userById.set(row.user_id, {
      userId: row.user_id,
      username: profileByUserId.get(row.user_id)?.username ?? null,
      accountId: profileByUserId.get(row.user_id)?.accountId ?? null,
      projectCount: 1,
      wordCount: metrics.wordCount,
      likeCount: metrics.likeCount,
    });
  }

  const users = Array.from(userById.values())
    .sort((a, b) => b.projectCount - a.projectCount || b.likeCount - a.likeCount);
  const pageUsers = users.slice(cursorOffset, cursorOffset + limit);

  return {
    users: pageUsers,
    nextCursor: users.length > cursorOffset + limit
      ? encodeOffsetCursor(cursorOffset + limit)
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
    result.set(projectId, { wordCount: 0, collaboratorCount: 1, likeCount: 0 });
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
        likeCount: Number(row.like_count ?? 0),
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
    normalized.includes('study_group_projects')
    && (
      normalized.includes('does not exist')
      || normalized.includes('relation')
      || normalized.includes('schema cache')
      || normalized.includes('could not find')
    )
  ) {
    return 'study_group_projects';
  }

  if (
    normalized.includes('study_group_members')
    && (
      normalized.includes('does not exist')
      || normalized.includes('relation')
      || normalized.includes('schema cache')
      || normalized.includes('could not find')
    )
  ) {
    return 'study_group_members';
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
    normalized.includes('shared_tags')
    && !normalized.includes('shared_tags_embedding')
    && (
      normalized.includes('does not exist')
      || normalized.includes('column')
      || normalized.includes('schema cache')
      || normalized.includes('could not find')
    )
  ) {
    return 'shared_tags';
  }

  if (
    (
      normalized.includes('shared_tags_embedding')
      || normalized.includes('match_public_shared_projects_by_tag_embedding')
    )
    && (
      normalized.includes('does not exist')
      || normalized.includes('column')
      || normalized.includes('function')
      || normalized.includes('schema cache')
      || normalized.includes('could not find')
    )
  ) {
    return 'shared_tag_embeddings';
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
  includeSharedTags = true,
): Promise<ProjectRow[]> {
  const baseColumns = includeSharedTags ? PROJECT_BASE_SELECT_COLUMNS : PROJECT_BASE_SELECT_COLUMNS_WITHOUT_SHARED_TAGS;
  const sharedColumns = includeSharedTags ? PROJECT_SHARED_SELECT_COLUMNS : PROJECT_SHARED_SELECT_COLUMNS_WITHOUT_SHARED_TAGS;
  let query = admin
    .from('projects')
    .select(includeShareScope ? sharedColumns : baseColumns)
    .eq('user_id', userId)
    .not('share_id', 'is', null);

  if (includeShareScope) {
    query = query.eq('share_scope', 'public');
  }

  const { data, error } = await query.order('created_at', { ascending: false });

  if (error) {
    if (includeSharedTags && getSharedProjectsSchemaIssue(error) === 'shared_tags') {
      logSharedProjectsFallback('shared_tags', error);
      return fetchOwnedProjects(admin, userId, includeShareScope, false);
    }
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
  includeSharedTags = true,
): Promise<ProjectRow[]> {
  if (projectIds.length === 0) return [];

  const baseColumns = includeSharedTags ? PROJECT_BASE_SELECT_COLUMNS : PROJECT_BASE_SELECT_COLUMNS_WITHOUT_SHARED_TAGS;
  const sharedColumns = includeSharedTags ? PROJECT_SHARED_SELECT_COLUMNS : PROJECT_SHARED_SELECT_COLUMNS_WITHOUT_SHARED_TAGS;
  const { data, error } = await admin
    .from('projects')
    .select(includeShareScope ? sharedColumns : baseColumns)
    .in('id', projectIds)
    .order('created_at', { ascending: false });

  if (error) {
    if (includeSharedTags && getSharedProjectsSchemaIssue(error) === 'shared_tags') {
      logSharedProjectsFallback('shared_tags', error);
      return fetchProjectsByIds(admin, projectIds, includeShareScope, false);
    }
    throw new Error(error.message || 'shared_joined_projects_lookup_failed');
  }

  return (data ?? []) as unknown as ProjectRow[];
}

async function fetchSharedProjectRowById(
  projectId: string,
  admin: SupabaseAdminClient,
  fallbackMessage: string,
  includeShareScope = true,
  includeSharedTags = true,
): Promise<ProjectRow | null> {
  const baseColumns = includeSharedTags ? PROJECT_BASE_SELECT_COLUMNS : PROJECT_BASE_SELECT_COLUMNS_WITHOUT_SHARED_TAGS;
  const sharedColumns = includeSharedTags ? PROJECT_SHARED_SELECT_COLUMNS : PROJECT_SHARED_SELECT_COLUMNS_WITHOUT_SHARED_TAGS;
  const { data, error } = await admin
    .from('projects')
    .select(includeShareScope ? sharedColumns : baseColumns)
    .eq('id', projectId)
    .not('share_id', 'is', null)
    .maybeSingle<ProjectRow>();

  if (error) {
    const schemaIssue = getSharedProjectsSchemaIssue(error);
    if (includeShareScope && schemaIssue === 'share_scope') {
      logSharedProjectsFallback('share_scope', error);
      return fetchSharedProjectRowById(projectId, admin, fallbackMessage, false, includeSharedTags);
    }
    if (includeSharedTags && schemaIssue === 'shared_tags') {
      logSharedProjectsFallback('shared_tags', error);
      return fetchSharedProjectRowById(projectId, admin, fallbackMessage, includeShareScope, false);
    }

    throw new Error(error.message || fallbackMessage);
  }

  return data ?? null;
}

async function fetchPublicProjectsPage(
  admin: SupabaseAdminClient,
  limit: number,
  cursor: SharedProjectCursor | null,
  isSearch = false,
  includeSharedTags = true,
): Promise<ProjectRow[]> {
  const fetchSize = isSearch
    ? Math.max(limit + PUBLIC_CURSOR_FETCH_PADDING, 80)
    : cursor
      ? limit + PUBLIC_CURSOR_FETCH_PADDING
      : limit + 1;
  let query = admin
    .from('projects')
    .select(includeSharedTags ? PROJECT_SHARED_SELECT_COLUMNS : PROJECT_SHARED_SELECT_COLUMNS_WITHOUT_SHARED_TAGS)
    .eq('share_scope', 'public')
    .not('share_id', 'is', null)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false });

  if (cursor) {
    query = query.lte('created_at', cursor.createdAt);
  }

  const { data, error } = await query.limit(fetchSize);
  if (error) {
    if (includeSharedTags && getSharedProjectsSchemaIssue(error) === 'shared_tags') {
      logSharedProjectsFallback('shared_tags', error);
      return fetchPublicProjectsPage(admin, limit, cursor, isSearch, false);
    }
    throw new Error(error.message || 'public_shared_projects_lookup_failed');
  }

  return (data ?? []) as unknown as ProjectRow[];
}

async function fetchPublicProjectsForUserDiscovery(
  admin: SupabaseAdminClient,
  limit: number,
  includeSharedTags = true,
): Promise<ProjectRow[]> {
  const { data, error } = await admin
    .from('projects')
    .select(includeSharedTags ? PROJECT_SHARED_SELECT_COLUMNS : PROJECT_SHARED_SELECT_COLUMNS_WITHOUT_SHARED_TAGS)
    .eq('share_scope', 'public')
    .not('share_id', 'is', null)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit);

  if (error) {
    if (includeSharedTags && getSharedProjectsSchemaIssue(error) === 'shared_tags') {
      logSharedProjectsFallback('shared_tags', error);
      return fetchPublicProjectsForUserDiscovery(admin, limit, false);
    }
    throw new Error(error.message || 'public_shared_user_projects_lookup_failed');
  }

  return (data ?? []) as unknown as ProjectRow[];
}

async function searchPublicProjects(
  admin: SupabaseAdminClient,
  query: string,
  desiredCount: number,
): Promise<ProjectRow[]> {
  const fetchLimit = Math.max(desiredCount + PUBLIC_CURSOR_FETCH_PADDING, 80);
  const [textRows, vectorRows] = await Promise.all([
    fetchPublicTextSearchRows(admin, query, fetchLimit),
    fetchPublicProjectsBySharedTagEmbedding(
      admin,
      query,
      Math.max(desiredCount + PUBLIC_CURSOR_FETCH_PADDING, PUBLIC_VECTOR_MATCH_LIMIT),
    ),
  ]);

  const profileByUserId = await getProfilesByUserIds(admin, textRows.map((row) => row.user_id));
  const textMatches = textRows.filter((row) => projectMatchesSearch(row, profileByUserId.get(row.user_id), query));

  return mergeProjectRowsById(vectorRows, textMatches);
}

async function fetchPublicTextSearchRows(
  admin: SupabaseAdminClient,
  query: string,
  fetchLimit: number,
): Promise<ProjectRow[]> {
  try {
    return await fetchPublicProjectsPage(admin, fetchLimit, null, Boolean(query), true);
  } catch (error) {
    if (getSharedProjectsSchemaIssue(error) === 'shared_tags') {
      logSharedProjectsFallback('shared_tags', error);
      return fetchPublicProjectsPage(admin, fetchLimit, null, Boolean(query), false);
    }
    if (getSharedProjectsSchemaIssue(error) === 'share_scope') {
      logSharedProjectsFallback('share_scope', error);
      return [];
    }
    throw error;
  }
}

async function fetchPublicProjectsBySharedTagEmbedding(
  admin: SupabaseAdminClient,
  query: string,
  matchCount: number,
): Promise<ProjectRow[]> {
  let queryEmbedding: number[] | null = null;
  try {
    queryEmbedding = await createSharedSearchEmbedding(query);
  } catch (error) {
    console.warn('shared tag search embedding generation failed:', error);
    return [];
  }

  if (!queryEmbedding) return [];

  const { data, error } = await admin.rpc('match_public_shared_projects_by_tag_embedding', {
    query_embedding: queryEmbedding,
    match_threshold: PUBLIC_VECTOR_MATCH_THRESHOLD,
    match_count: matchCount,
  });

  if (error) {
    const schemaIssue = getSharedProjectsSchemaIssue(error);
    if (schemaIssue === 'shared_tag_embeddings') {
      logSharedProjectsFallback('shared_tag_embeddings', error);
      return [];
    }

    console.warn('shared tag vector search failed:', error);
    return [];
  }

  return (data ?? []) as unknown as ProjectRow[];
}

function mergeProjectRowsById(...groups: ProjectRow[][]): ProjectRow[] {
  const rows: ProjectRow[] = [];
  const seen = new Set<string>();

  for (const group of groups) {
    for (const row of group) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      rows.push(row);
    }
  }

  return rows;
}

async function getSharedProjectMetricsFallback(
  projectIds: string[],
  admin: SupabaseAdminClient,
  seed: Map<string, SharedProjectMetrics>,
): Promise<Map<string, SharedProjectMetrics>> {
  await Promise.all(projectIds.map(async (projectId) => {
    const [wordResult, collaboratorResult, likeResult] = await Promise.all([
      admin
        .from('words')
        .select('*', { count: 'exact', head: true })
        .eq('project_id', projectId),
      admin
        .from('project_members')
        .select('*', { count: 'exact', head: true })
        .eq('project_id', projectId),
      admin
        .from('project_likes')
        .select('*', { count: 'exact', head: true })
        .eq('project_id', projectId),
    ]);

    const wordCount = wordResult.count ?? 0;
    let collaboratorCount = 1;
    let likeCount = 0;

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

    if (likeResult && !likeResult.error) {
      likeCount = likeResult.count ?? 0;
    }

    seed.set(projectId, {
      wordCount,
      collaboratorCount,
      likeCount,
    });
  }));

  return seed;
}

function mapSharedProjectCard(
  row: ProjectRow,
  accessRole: SharedProjectAccessRole,
  profileByUserId?: Map<string, SharedProfileSummary>,
): SharedProjectCard {
  const ownerProfile = profileByUserId?.get(row.user_id);
  return {
    project: mapProjectFromRow(row),
    accessRole,
    ownerUsername: ownerProfile?.username ?? null,
    ownerAccountId: ownerProfile?.accountId ?? null,
  };
}

function mapSharedProjectSummary(
  row: ProjectRow,
  accessRole: SharedProjectAccessRole,
  metricsByProjectId: Map<string, SharedProjectMetrics>,
  profileByUserId?: Map<string, SharedProfileSummary>,
): SharedProjectSummary {
  const metrics = metricsByProjectId.get(row.id) ?? { wordCount: 0, collaboratorCount: 1, likeCount: 0 };

  return {
    ...mapSharedProjectCard(row, accessRole, profileByUserId),
    wordCount: metrics.wordCount,
    collaboratorCount: metrics.collaboratorCount,
    likeCount: metrics.likeCount,
  };
}

async function getProfilesByUserIds(
  admin: SupabaseAdminClient,
  userIds: string[],
): Promise<Map<string, SharedProfileSummary>> {
  const result = new Map<string, SharedProfileSummary>();
  if (userIds.length === 0) return result;

  const uniqueIds = Array.from(new Set(userIds));

  try {
    const { data, error } = await admin
      .from('profiles')
      .select('user_id, username, account_id')
      .in('user_id', uniqueIds);

    if (error) {
      if (isMissingProfileAccountId(error)) {
        const fallback = await admin
          .from('profiles')
          .select('user_id, username')
          .in('user_id', uniqueIds);

        if (!fallback.error) {
          for (const row of fallback.data ?? []) {
            result.set(row.user_id as string, {
              username: (row.username as string | null) ?? null,
              accountId: null,
            });
          }
          return result;
        }
      }

      console.warn('Failed to fetch profiles for shared projects:', error.message);
      return result;
    }

    for (const row of data ?? []) {
      result.set(row.user_id as string, {
        username: (row.username as string | null) ?? null,
        accountId: (row.account_id as string | null) ?? null,
      });
    }
  } catch {
    // profiles table may not exist yet; graceful fallback
  }

  return result;
}

function isMissingProfileAccountId(error: unknown): boolean {
  const normalized = normalizeErrorText(error);
  return normalized.includes('account_id') && (
    normalized.includes('does not exist')
    || normalized.includes('column')
    || normalized.includes('schema cache')
    || normalized.includes('could not find')
  );
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

function projectMatchesSearch(
  row: ProjectRow,
  ownerProfile: SharedProfileSummary | undefined,
  query: string,
): boolean {
  if (!query) return true;
  if (includesSearchText(row.title, query)) return true;
  if (includesSearchText(ownerProfile?.username, query)) return true;
  if (includesSearchText(ownerProfile?.accountId, query)) return true;
  return (row.shared_tags ?? []).some((tag) => (
    includesSearchText(String(tag), query) || includesSearchText(formatSharedTag(String(tag)), query)
  ));
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
