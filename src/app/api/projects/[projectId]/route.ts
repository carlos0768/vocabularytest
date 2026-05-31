import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveAuthenticatedUser } from '@/app/api/share-import/shared';
import { parseJsonWithSchema } from '@/lib/api/validation';
import { createRouteHandlerClient } from '@/lib/supabase/route-client';

const updateSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, '単語帳名を入力してください')
    .max(60, '単語帳名は60文字以内で入力してください'),
}).strict();

type ProjectTitleRow = {
  id: string;
  title: string;
};

type ProjectRouteDeps = {
  resolveUser?: typeof resolveAuthenticatedUser;
  createClient?: typeof createRouteHandlerClient;
};

export async function handleProjectPatch(
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
  deps: ProjectRouteDeps = {},
) {
  try {
    const { projectId } = await context.params;
    const resolveUser = deps.resolveUser ?? resolveAuthenticatedUser;
    const user = await resolveUser(request);

    if (!user) {
      return NextResponse.json({ success: false, error: '認証が必要です' }, { status: 401 });
    }

    const parsed = await parseJsonWithSchema(request, updateSchema, {
      invalidMessage: '名称変更データが不正です',
    });
    if (!parsed.ok) {
      return parsed.response;
    }

    const supabase = await (deps.createClient ?? createRouteHandlerClient)(request);
    const { data, error } = await supabase
      .from('projects')
      .update({ title: parsed.data.title })
      .eq('id', projectId)
      .eq('user_id', user.id)
      .select('id, title')
      .maybeSingle<ProjectTitleRow>();

    if (error) {
      console.error('Failed to update project title:', error);
      return NextResponse.json({ success: false, error: '名称変更に失敗しました' }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ success: false, error: '単語帳が見つかりません' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      project: {
        id: data.id,
        title: data.title,
      },
    });
  } catch (error) {
    console.error('Project PATCH error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) {
  return handleProjectPatch(request, context);
}
