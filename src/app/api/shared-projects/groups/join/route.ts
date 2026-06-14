import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { parseJsonWithSchema } from '@/lib/api/validation';
import { requireAuthenticatedUser } from '../../shared';
import { joinStudyGroupByInviteCode } from '../shared';

const joinStudyGroupSchema = z.object({
  inviteCode: z.string().trim().min(1).max(120),
}).strict();

type StudyGroupJoinPostDeps = {
  requireAuthenticatedUser?: typeof requireAuthenticatedUser;
  joinStudyGroupByInviteCode?: typeof joinStudyGroupByInviteCode;
};

export async function handleStudyGroupJoinPost(
  request: NextRequest,
  deps: StudyGroupJoinPostDeps = {},
) {
  const requireAuthenticated = deps.requireAuthenticatedUser ?? requireAuthenticatedUser;
  const joinGroup = deps.joinStudyGroupByInviteCode ?? joinStudyGroupByInviteCode;

  try {
    const auth = await requireAuthenticated(request);
    if (!auth.ok) return auth.response;

    const parsed = await parseJsonWithSchema(request, joinStudyGroupSchema, {
      invalidMessage: '招待コードを確認してください。',
    });
    if (!parsed.ok) return parsed.response;

    const group = await joinGroup(auth.user.id, parsed.data.inviteCode);
    if (!group) {
      return NextResponse.json({ success: false, error: 'グループが見つかりません。' }, { status: 404 });
    }

    return NextResponse.json({ success: true, group });
  } catch (error) {
    console.error('study-group join error:', error);
    return NextResponse.json({ success: false, error: 'グループへの参加に失敗しました。' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  return handleStudyGroupJoinPost(request);
}
