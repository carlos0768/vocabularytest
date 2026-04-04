import { NextRequest, NextResponse } from 'next/server';
import { resolveAuthenticatedUser } from '@/app/api/share-import/shared';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import type { SharedProjectMetricsMap } from '@/lib/shared-projects/types';
import {
  getSharedProjectMetrics,
  getSharedProjectsSchemaIssue,
} from '../shared';

type SharedProjectsMetricsGetDeps = {
  resolveAuthenticatedUser?: typeof resolveAuthenticatedUser;
  getSupabaseAdmin?: typeof getSupabaseAdmin;
  getSharedProjectMetrics?: typeof getSharedProjectMetrics;
};

type MetricsProjectAccessRow = {
  id: string;
  user_id: string;
  share_scope?: string | null;
};

export async function handleSharedProjectsMetricsGet(
  request: NextRequest,
  deps: SharedProjectsMetricsGetDeps = {},
) {
  const resolveUser = deps.resolveAuthenticatedUser ?? resolveAuthenticatedUser;
  const getAdmin = deps.getSupabaseAdmin ?? getSupabaseAdmin;
  const fetchMetrics = deps.getSharedProjectMetrics ?? getSharedProjectMetrics;

  try {
    const rawProjectIds = (request.nextUrl.searchParams.get('projectIds') ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    const projectIds = Array.from(new Set(rawProjectIds));

    if (projectIds.length === 0) {
      return NextResponse.json({ metrics: {} satisfies SharedProjectMetricsMap });
    }

    const user = await resolveUser(request).catch(() => null);
    const admin = getAdmin();

    let rows: MetricsProjectAccessRow[] = [];
    try {
      const { data, error } = await admin
        .from('projects')
        .select('id, user_id, share_scope')
        .in('id', projectIds)
        .not('share_id', 'is', null);

      if (error) {
        throw error;
      }

      rows = (data ?? []) as MetricsProjectAccessRow[];
    } catch (error) {
      if (getSharedProjectsSchemaIssue(error) === 'share_scope') {
        const { data, error: fallbackError } = await admin
          .from('projects')
          .select('id, user_id')
          .in('id', projectIds)
          .not('share_id', 'is', null);

        if (fallbackError) {
          throw fallbackError;
        }

        rows = ((data ?? []) as Array<{ id: string; user_id: string }>).map((row) => ({
          ...row,
          share_scope: null,
        }));
      } else {
        throw error;
      }
    }

    const accessibleIds = new Set<string>();
    const membershipCandidateIds: string[] = [];

    for (const row of rows) {
      const isPublic = row.share_scope === 'public';
      const isOwner = !!user && row.user_id === user.id;

      if (isPublic || isOwner) {
        accessibleIds.add(row.id);
        continue;
      }

      if (user) {
        membershipCandidateIds.push(row.id);
      }
    }

    if (user && membershipCandidateIds.length > 0) {
      try {
        const { data, error } = await admin
          .from('project_members')
          .select('project_id')
          .eq('user_id', user.id)
          .in('project_id', membershipCandidateIds);

        if (error) {
          throw error;
        }

        for (const row of data ?? []) {
          accessibleIds.add(row.project_id as string);
        }
      } catch (error) {
        if (getSharedProjectsSchemaIssue(error) !== 'project_members') {
          throw error;
        }
      }
    }

    const metrics = await fetchMetrics(Array.from(accessibleIds), admin);
    const payload: SharedProjectMetricsMap = {};

    for (const projectId of accessibleIds) {
      const metric = metrics.get(projectId);
      if (!metric) continue;

      payload[projectId] = {
        wordCount: metric.wordCount,
        collaboratorCount: metric.collaboratorCount,
      };
    }

    return NextResponse.json({ metrics: payload });
  } catch (error) {
    console.error('shared-projects metrics error:', error);
    return NextResponse.json({ error: '単語帳の件数取得に失敗しました。' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return handleSharedProjectsMetricsGet(request);
}
