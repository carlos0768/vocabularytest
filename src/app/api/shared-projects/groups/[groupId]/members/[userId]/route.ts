import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser } from '../../../../shared';
import { removeStudyGroupMember, StudyGroupAccessError } from '../../../shared';

type StudyGroupMemberMutationContext = {
  params: Promise<{ groupId: string; userId: string }>;
};

type StudyGroupMemberMutationDeps = {
  requireAuthenticatedUser?: typeof requireAuthenticatedUser;
  removeStudyGroupMember?: typeof removeStudyGroupMember;
};

export async function handleStudyGroupMemberDelete(
  request: NextRequest,
  context: StudyGroupMemberMutationContext,
  deps: StudyGroupMemberMutationDeps = {},
) {
  const requireAuthenticated = deps.requireAuthenticatedUser ?? requireAuthenticatedUser;
  const removeMember = deps.removeStudyGroupMember ?? removeStudyGroupMember;

  try {
    const auth = await requireAuthenticated(request);
    if (!auth.ok) return auth.response;

    const { groupId, userId: targetUserId } = await context.params;
    const removed = await removeMember(groupId, auth.user.id, targetUserId);
    if (!removed) {
      return NextResponse.json({ success: false, error: 'グループにアクセスできません。' }, { status: 403 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof StudyGroupAccessError) {
      if (error.code === 'owner_required') {
        return NextResponse.json({ success: false, error: 'オーナーのみメンバーを削除できます。' }, { status: 403 });
      }
      if (error.code === 'cannot_remove_owner') {
        return NextResponse.json({ success: false, error: 'オーナーは削除できません。' }, { status: 400 });
      }
    }

    console.error('study-group member remove error:', error);
    return NextResponse.json({ success: false, error: 'メンバーの削除に失敗しました。' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  context: StudyGroupMemberMutationContext,
) {
  return handleStudyGroupMemberDelete(request, context);
}
