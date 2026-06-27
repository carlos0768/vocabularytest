import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser } from '../../shared';
import { getStudyGroupOverview } from '../shared';

type StudyGroupOverviewGetDeps = {
  requireAuthenticatedUser?: typeof requireAuthenticatedUser;
  getStudyGroupOverview?: typeof getStudyGroupOverview;
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
