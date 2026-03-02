import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createRouteHandlerClient } from '@/lib/supabase/route-client';
import { resolveAuthenticatedUser } from '@/app/api/share-import/shared';

type ProjectRow = {
  id: string;
  title: string;
  updated_at: string;
};

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).optional().default(20),
}).strict();

type ProjectsDeps = {
  resolveUser: (request: NextRequest) => Promise<{ id: string } | null>;
  fetchProjects: (request: NextRequest, userId: string, limit: number) => Promise<ProjectRow[]>;
};

const defaultDeps: ProjectsDeps = {
  resolveUser: resolveAuthenticatedUser,
  async fetchProjects(request: NextRequest, userId: string, limit: number) {
    const supabase = await createRouteHandlerClient(request);
    const { data, error } = await supabase
      .from('projects')
      .select('id,title,updated_at')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error(error.message || 'project_fetch_failed');
    }

    return (data ?? []) as ProjectRow[];
  },
};

export async function handleShareImportProjectsGet(
  request: NextRequest,
  deps: ProjectsDeps = defaultDeps,
) {
  try {
    const user = await deps.resolveUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: '認証が必要です。' }, { status: 401 });
    }

    const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams.entries()));
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: 'パラメータが不正です。' }, { status: 400 });
    }

    const rows = await deps.fetchProjects(request, user.id, parsed.data.limit);

    return NextResponse.json({
      success: true,
      projects: rows.map((row) => ({
        id: row.id,
        title: row.title,
        updatedAt: row.updated_at,
      })),
    });
  } catch (error) {
    console.error('share-import projects error:', error);
    return NextResponse.json({ success: false, error: '単語帳の取得に失敗しました。' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return handleShareImportProjectsGet(request);
}
