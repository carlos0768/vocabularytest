import { NextResponse, type NextRequest } from 'next/server';
import { getPublicStudyGroupPreview } from '../../shared';

type StudyGroupPreviewGetDeps = {
  getPublicStudyGroupPreview?: typeof getPublicStudyGroupPreview;
};

export async function handleStudyGroupPreviewGet(
  _request: NextRequest,
  context: { params: Promise<{ groupId: string }> },
  deps: StudyGroupPreviewGetDeps = {},
) {
  const getPreview = deps.getPublicStudyGroupPreview ?? getPublicStudyGroupPreview;

  try {
    const { groupId } = await context.params;
    const group = await getPreview(groupId);
    if (!group) {
      return NextResponse.json({ success: false, error: 'グループが見つかりません。' }, { status: 404 });
    }

    return NextResponse.json({ success: true, group });
  } catch (error) {
    console.error('study-group preview error:', error);
    return NextResponse.json({ success: false, error: 'グループ情報の取得に失敗しました。' }, { status: 500 });
  }
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ groupId: string }> },
) {
  return handleStudyGroupPreviewGet(request, context);
}
