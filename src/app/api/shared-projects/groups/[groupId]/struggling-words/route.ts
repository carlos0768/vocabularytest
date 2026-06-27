import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser } from '../../../shared';
import {
  listStudyGroupStrugglingWords,
  STUDY_GROUP_STRUGGLING_PREVIEW_LIMIT,
} from '../../shared';

type StudyGroupStrugglingWordsGetDeps = {
  requireAuthenticatedUser?: typeof requireAuthenticatedUser;
  listStudyGroupStrugglingWords?: typeof listStudyGroupStrugglingWords;
};

function parseLimit(request: NextRequest): number | null {
  if (request.nextUrl.searchParams.get('all') === '1') return null;

  const raw = request.nextUrl.searchParams.get('limit');
  if (!raw) return STUDY_GROUP_STRUGGLING_PREVIEW_LIMIT;

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return STUDY_GROUP_STRUGGLING_PREVIEW_LIMIT;
  return Math.max(0, Math.min(100, parsed));
}

export async function handleStudyGroupStrugglingWordsGet(
  request: NextRequest,
  context: { params: Promise<{ groupId: string }> },
  deps: StudyGroupStrugglingWordsGetDeps = {},
) {
  const requireAuthenticated = deps.requireAuthenticatedUser ?? requireAuthenticatedUser;
  const listWords = deps.listStudyGroupStrugglingWords ?? listStudyGroupStrugglingWords;

  try {
    const auth = await requireAuthenticated(request);
    if (!auth.ok) return auth.response;

    const { groupId } = await context.params;
    const payload = await listWords(groupId, auth.user.id, { limit: parseLimit(request) });
    if (!payload) {
      return NextResponse.json({ success: false, error: 'グループにアクセスできません。' }, { status: 403 });
    }

    return NextResponse.json({ success: true, ...payload });
  } catch (error) {
    console.error('study-group struggling words error:', error);
    return NextResponse.json({ success: false, error: '苦戦中の単語取得に失敗しました。' }, { status: 500 });
  }
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ groupId: string }> },
) {
  return handleStudyGroupStrugglingWordsGet(request, context);
}
