import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { parseJsonWithSchema } from '@/lib/api/validation';
import { requireAuthenticatedUser } from '../shared';
import {
  createStudyGroup,
  listStudyGroupsForUser,
} from './shared';

const createStudyGroupSchema = z.object({
  name: z.string().trim().min(1).max(40),
}).strict();

type StudyGroupsGetDeps = {
  requireAuthenticatedUser?: typeof requireAuthenticatedUser;
  listStudyGroupsForUser?: typeof listStudyGroupsForUser;
};

type StudyGroupsPostDeps = {
  requireAuthenticatedUser?: typeof requireAuthenticatedUser;
  createStudyGroup?: typeof createStudyGroup;
};

export async function handleStudyGroupsGet(
  request: NextRequest,
  deps: StudyGroupsGetDeps = {},
) {
  const requireAuthenticated = deps.requireAuthenticatedUser ?? requireAuthenticatedUser;
  const listGroups = deps.listStudyGroupsForUser ?? listStudyGroupsForUser;

  try {
    const auth = await requireAuthenticated(request);
    if (!auth.ok) return auth.response;

    const projectId = request.nextUrl.searchParams.get('projectId');
    const payload = await listGroups(auth.user.id, { projectId });
    return NextResponse.json({ success: true, ...payload });
  } catch (error) {
    console.error('study-groups list error:', error);
    return NextResponse.json({ success: false, error: 'グループ一覧の取得に失敗しました。' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return handleStudyGroupsGet(request);
}

export async function handleStudyGroupsPost(
  request: NextRequest,
  deps: StudyGroupsPostDeps = {},
) {
  const requireAuthenticated = deps.requireAuthenticatedUser ?? requireAuthenticatedUser;
  const createGroup = deps.createStudyGroup ?? createStudyGroup;

  try {
    const auth = await requireAuthenticated(request);
    if (!auth.ok) return auth.response;

    const parsed = await parseJsonWithSchema(request, createStudyGroupSchema, {
      invalidMessage: 'グループ名を確認してください。',
    });
    if (!parsed.ok) return parsed.response;

    const group = await createGroup(auth.user.id, parsed.data.name);
    return NextResponse.json({ success: true, group }, { status: 201 });
  } catch (error) {
    console.error('study-groups create error:', error);
    return NextResponse.json({ success: false, error: 'グループの作成に失敗しました。' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  return handleStudyGroupsPost(request);
}
