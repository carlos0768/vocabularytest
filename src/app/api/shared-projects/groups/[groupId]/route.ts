import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { parseJsonWithSchema } from '@/lib/api/validation';
import { requireAuthenticatedUser } from '../../shared';
import { getStudyGroupOverview, renameStudyGroup, StudyGroupAccessError } from '../shared';

const updateStudyGroupSchema = z.object({
  name: z.string().trim().min(1).max(40),
}).strict();

type StudyGroupOverviewGetDeps = {
  requireAuthenticatedUser?: typeof requireAuthenticatedUser;
  getStudyGroupOverview?: typeof getStudyGroupOverview;
};

type StudyGroupUpdateDeps = {
  requireAuthenticatedUser?: typeof requireAuthenticatedUser;
  renameStudyGroup?: typeof renameStudyGroup;
};

export async function handleStudyGroupOverviewGet(
  request: NextRequest,
  context: { params: Promise<{ groupId: string }> },
  deps: StudyGroupOverviewGetDeps = {},
) {
  const requireAuthenticated = deps.requireAuthenticatedUser ?? requireAuthenticatedUser;
  const getOverview = deps.getStudyGroupOverview ?? getStudyGroupOverview;

  try {
    const auth = await requireAuthenticated(request);
    if (!auth.ok) return auth.response;

    const { groupId } = await context.params;
    const payload = await getOverview(groupId, auth.user.id);
    if (!payload) {
      return NextResponse.json({ success: false, error: 'グループにアクセスできません。' }, { status: 403 });
    }

    return NextResponse.json({ success: true, ...payload });
  } catch (error) {
    console.error('study-group overview error:', error);
    return NextResponse.json({ success: false, error: 'グループ情報の取得に失敗しました。' }, { status: 500 });
  }
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ groupId: string }> },
) {
  return handleStudyGroupOverviewGet(request, context);
}

export async function handleStudyGroupUpdatePatch(
  request: NextRequest,
  context: { params: Promise<{ groupId: string }> },
  deps: StudyGroupUpdateDeps = {},
) {
  const requireAuthenticated = deps.requireAuthenticatedUser ?? requireAuthenticatedUser;
  const rename = deps.renameStudyGroup ?? renameStudyGroup;

  try {
    const auth = await requireAuthenticated(request);
    if (!auth.ok) return auth.response;

    const parsed = await parseJsonWithSchema(request, updateStudyGroupSchema, {
      invalidMessage: 'グループ名を確認してください。',
    });
    if (!parsed.ok) return parsed.response;

    const { groupId } = await context.params;
    const group = await rename(groupId, auth.user.id, parsed.data.name);
    if (!group) {
      return NextResponse.json({ success: false, error: 'グループにアクセスできません。' }, { status: 403 });
    }

    return NextResponse.json({ success: true, group });
  } catch (error) {
    if (error instanceof StudyGroupAccessError) {
      if (error.code === 'owner_required') {
        return NextResponse.json({ success: false, error: 'オーナーのみ変更できます。' }, { status: 403 });
      }
      if (error.code === 'invalid_name') {
        return NextResponse.json({ success: false, error: 'グループ名を入力してください。' }, { status: 400 });
      }
    }

    console.error('study-group update error:', error);
    return NextResponse.json({ success: false, error: 'グループの更新に失敗しました。' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ groupId: string }> },
) {
  return handleStudyGroupUpdatePatch(request, context);
}
