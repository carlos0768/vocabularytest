import { NextRequest, NextResponse } from 'next/server';
import { resolveAuthenticatedUser } from '@/app/api/share-import/shared';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

type Params = { params: Promise<{ projectId: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { projectId } = await params;
    const user = await resolveAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: '認証が必要です。' }, { status: 401 });
    }

    const admin = getSupabaseAdmin();

    const [likeRow, countResult] = await Promise.all([
      admin
        .from('project_likes')
        .select('id')
        .eq('project_id', projectId)
        .eq('user_id', user.id)
        .maybeSingle(),
      admin
        .from('project_likes')
        .select('*', { count: 'exact', head: true })
        .eq('project_id', projectId),
    ]);

    return NextResponse.json({
      liked: !!likeRow.data,
      likeCount: countResult.count ?? 0,
    });
  } catch (error) {
    console.error('like GET error:', error);
    return NextResponse.json({ error: 'いいね状態の取得に失敗しました。' }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { projectId } = await params;
    const user = await resolveAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: '認証が必要です。' }, { status: 401 });
    }

    const body = await request.json();
    const liked = !!body.liked;

    const admin = getSupabaseAdmin();

    if (liked) {
      await admin
        .from('project_likes')
        .upsert(
          { project_id: projectId, user_id: user.id },
          { onConflict: 'project_id,user_id', ignoreDuplicates: true },
        );
    } else {
      await admin
        .from('project_likes')
        .delete()
        .eq('project_id', projectId)
        .eq('user_id', user.id);
    }

    const { count } = await admin
      .from('project_likes')
      .select('*', { count: 'exact', head: true })
      .eq('project_id', projectId);

    return NextResponse.json({
      success: true,
      liked,
      likeCount: count ?? 0,
    });
  } catch (error) {
    console.error('like POST error:', error);
    return NextResponse.json({ error: 'いいねの更新に失敗しました。' }, { status: 500 });
  }
}
