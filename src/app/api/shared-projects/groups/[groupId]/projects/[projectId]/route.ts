import { after, NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser } from '../../../../shared';
import {
  addProjectToStudyGroup,
  recordStudyGroupProjectAddedEvent,
  removeProjectFromStudyGroup,
  StudyGroupProjectAccessError,
} from '../../../shared';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { sendGroupProjectAddedPushNotifications } from '@/lib/notifications/web-push';

type StudyGroupProjectMutationContext = {
  params: Promise<{ groupId: string; projectId: string }>;
};

type StudyGroupProjectMutationDeps = {
  requireAuthenticatedUser?: typeof requireAuthenticatedUser;
  addProjectToStudyGroup?: typeof addProjectToStudyGroup;
  removeProjectFromStudyGroup?: typeof removeProjectFromStudyGroup;
};

export async function handleStudyGroupProjectPost(
  request: NextRequest,
  context: StudyGroupProjectMutationContext,
  deps: StudyGroupProjectMutationDeps = {},
) {
  const requireAuthenticated = deps.requireAuthenticatedUser ?? requireAuthenticatedUser;
  const addProject = deps.addProjectToStudyGroup ?? addProjectToStudyGroup;

  try {
    const auth = await requireAuthenticated(request);
    if (!auth.ok) return auth.response;

    const { groupId, projectId } = await context.params;
    const project = await addProject(groupId, projectId, auth.user.id);
    if (!project) {
      return NextResponse.json({ success: false, error: 'グループにアクセスできません。' }, { status: 403 });
    }

    // Record a feed event and notify the other members in the background so the
    // response is not blocked on push delivery.
    const actorUserId = auth.user.id;
    const sharedProjectId = project.project.id;
    after(async () => {
      try {
        const admin = getSupabaseAdmin();
        const { recipientUserIds, groupName, projectTitle } = await recordStudyGroupProjectAddedEvent(
          groupId,
          sharedProjectId,
          actorUserId,
          admin,
        );
        await sendGroupProjectAddedPushNotifications(admin, {
          recipientUserIds,
          groupId,
          groupName,
          projectTitle,
        });
      } catch (notifyError) {
        console.error('Failed to publish study-group project-added event:', notifyError);
      }
    });

    return NextResponse.json({ success: true, project });
  } catch (error) {
    if (error instanceof StudyGroupProjectAccessError) {
      if (error.code === 'pro_required') {
        return NextResponse.json(
          { success: false, error: 'グループへの単語帳共有はPro限定です。', code: 'PRO_REQUIRED' },
          { status: 403 },
        );
      }
      if (error.code === 'project_not_owned') {
        return NextResponse.json({ success: false, error: '自分の単語帳だけ共有できます。' }, { status: 403 });
      }
    }

    console.error('study-group project add error:', error);
    return NextResponse.json({ success: false, error: 'グループへの共有に失敗しました。' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  context: StudyGroupProjectMutationContext,
) {
  return handleStudyGroupProjectPost(request, context);
}

export async function handleStudyGroupProjectDelete(
  request: NextRequest,
  context: StudyGroupProjectMutationContext,
  deps: StudyGroupProjectMutationDeps = {},
) {
  const requireAuthenticated = deps.requireAuthenticatedUser ?? requireAuthenticatedUser;
  const removeProject = deps.removeProjectFromStudyGroup ?? removeProjectFromStudyGroup;

  try {
    const auth = await requireAuthenticated(request);
    if (!auth.ok) return auth.response;

    const { groupId, projectId } = await context.params;
    const removed = await removeProject(groupId, projectId, auth.user.id);
    if (!removed) {
      return NextResponse.json({ success: false, error: 'グループにアクセスできません。' }, { status: 403 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof StudyGroupProjectAccessError && error.code === 'remove_forbidden') {
      return NextResponse.json({ success: false, error: 'この単語帳は解除できません。' }, { status: 403 });
    }

    console.error('study-group project remove error:', error);
    return NextResponse.json({ success: false, error: 'グループ共有の解除に失敗しました。' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  context: StudyGroupProjectMutationContext,
) {
  return handleStudyGroupProjectDelete(request, context);
}
