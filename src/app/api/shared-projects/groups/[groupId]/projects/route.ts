import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser } from '../../../shared';
import { listStudyGroupProjects } from '../../shared';

type StudyGroupProjectsGetDeps = {
  requireAuthenticatedUser?: typeof requireAuthenticatedUser;
  listStudyGroupProjects?: typeof listStudyGroupProjects;
};

export async function handleStudyGroupProjectsGet(
  request: NextRequest,
  context: { params: Promise<{ groupId: string }> },
  deps: StudyGroupProjectsGetDeps = {},
) {
  const requireAuthenticated = deps.requireAuthenticatedUser ?? requireAuthenticatedUser;
  const listProjects = deps.listStudyGroupProjects ?? listStudyGroupProjects;

  try {
    const auth = await requireAuthenticated(request);
    if (!auth.ok) return auth.response;

    const { groupId } = await context.params;
    const payload = await listProjects(groupId, auth.user.id);
    if (!payload) {
      return NextResponse.json({ success: false, error: 'グループにアクセスできません。' }, { status: 403 });
    }

    return NextResponse.json({ success: true, ...payload });
  } catch (error) {
    console.error('study-group projects list error:', error);
    return NextResponse.json({ success: false, error: 'グループ内の単語帳取得に失敗しました。' }, { status: 500 });
  }
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ groupId: string }> },
) {
  return handleStudyGroupProjectsGet(request, context);
}
