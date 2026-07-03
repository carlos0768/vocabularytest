import { after, NextRequest, NextResponse } from 'next/server';
import { extractShareCode, getProjectByShareCode, requireAuthenticatedUser } from '../../../shared';
import { getSharedWordbookByShareId } from '../../../shared-wordbooks';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { getProfilesByUserIds } from '@/lib/follows/server';
import { sendProjectImportedPushNotification } from '@/lib/notifications/web-push';

type Params = { params: Promise<{ shareId: string }> };

async function resolveShareOwner(shareCode: string): Promise<{ ownerUserId: string; projectId: string; projectTitle: string } | null> {
  const admin = getSupabaseAdmin();

  const wordbook = await getSharedWordbookByShareId(shareCode, admin);
  if (wordbook) {
    return {
      ownerUserId: wordbook.user_id,
      projectId: wordbook.source_project_id ?? wordbook.id,
      projectTitle: wordbook.title,
    };
  }

  const project = await getProjectByShareCode(shareCode, admin);
  if (project) {
    return {
      ownerUserId: project.user_id,
      projectId: project.id,
      projectTitle: project.title,
    };
  }

  return null;
}

export async function handleSharedProjectImportedPost(request: NextRequest, { params }: Params) {
  try {
    const { shareId } = await params;
    const shareCode = extractShareCode(shareId);
    if (!shareCode) {
      return NextResponse.json({ success: false, error: '共有リンクが不正です。' }, { status: 400 });
    }

    const auth = await requireAuthenticatedUser(request);
    if (!auth.ok) return auth.response;

    const importerUserId = auth.user.id;

    after(async () => {
      try {
        const owner = await resolveShareOwner(shareCode);
        if (!owner || owner.ownerUserId === importerUserId) return;

        const admin = getSupabaseAdmin();
        const profiles = await getProfilesByUserIds([importerUserId], admin);
        const importerName = profiles.get(importerUserId)?.username ?? null;

        await sendProjectImportedPushNotification(admin, {
          ownerUserId: owner.ownerUserId,
          projectId: owner.projectId,
          projectTitle: owner.projectTitle,
          importerName,
        });
      } catch (notifyError) {
        console.error('Failed to send project-imported push notification:', notifyError);
      }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('shared-project imported notification error:', error);
    return NextResponse.json({ success: false, error: '通知の送信に失敗しました。' }, { status: 500 });
  }
}

export async function POST(request: NextRequest, context: Params) {
  return handleSharedProjectImportedPost(request, context);
}
