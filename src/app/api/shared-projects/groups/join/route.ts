import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { parseJsonWithSchema } from '@/lib/api/validation';
import { requireAuthenticatedUser } from '../../shared';
import { joinPublicStudyGroupById, joinStudyGroupByInviteCode, StudyGroupAccessError } from '../shared';

const joinStudyGroupSchema = z.object({
  inviteCode: z.string().trim().min(1).max(120).optional(),
  groupId: z.string().trim().min(1).optional(),
}).strict().refine(
  (data) => Boolean(data.inviteCode) || Boolean(data.groupId),
  { message: '招待コードまたはグループIDを指定してください。' },
);

type StudyGroupJoinPostDeps = {
  requireAuthenticatedUser?: typeof requireAuthenticatedUser;
  joinStudyGroupByInviteCode?: typeof joinStudyGroupByInviteCode;
  joinPublicStudyGroupById?: typeof joinPublicStudyGroupById;
};

export async function handleStudyGroupJoinPost(
  request: NextRequest,
  deps: StudyGroupJoinPostDeps = {},
) {
  const requireAuthenticated = deps.requireAuthenticatedUser ?? requireAuthenticatedUser;
  const joinByInviteCode = deps.joinStudyGroupByInviteCode ?? joinStudyGroupByInviteCode;
  const joinPublicById = deps.joinPublicStudyGroupById ?? joinPublicStudyGroupById;

  try {
    const auth = await requireAuthenticated(request);
    if (!auth.ok) return auth.response;

    const parsed = await parseJsonWithSchema(request, joinStudyGroupSchema, {
      invalidMessage: '招待コードを確認してください。',
    });
    if (!parsed.ok) return parsed.response;

    // Joining by groupId is only valid for public groups — re-checked inside
    // joinPublicStudyGroupById regardless of how the client got the id.
    const group = parsed.data.groupId
      ? await joinPublicById(auth.user.id, parsed.data.groupId)
      : await joinByInviteCode(auth.user.id, parsed.data.inviteCode!);

    if (!group) {
      return NextResponse.json({ success: false, error: 'グループが見つかりません。' }, { status: 404 });
    }

    return NextResponse.json({ success: true, group });
  } catch (error) {
    if (error instanceof StudyGroupAccessError && error.code === 'not_public') {
      return NextResponse.json(
        { success: false, error: 'このグループは非公開です。招待コードが必要です。' },
        { status: 403 },
      );
    }

    console.error('study-group join error:', error);
    return NextResponse.json({ success: false, error: 'グループへの参加に失敗しました。' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  return handleStudyGroupJoinPost(request);
}
