import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser } from '@/app/api/shared-projects/shared';
import { listFollowTimeline } from '@/lib/follows/server';

export async function GET(request: NextRequest) {
  const auth = await requireAuthenticatedUser(request);
  if (!auth.ok) return auth.response;

  const limitParam = request.nextUrl.searchParams.get('limit');
  const limit = limitParam ? Math.max(1, Math.min(parseInt(limitParam, 10) || 40, 80)) : 40;

  try {
    const sessions = await listFollowTimeline(auth.user.id, undefined, limit);
    return NextResponse.json({ success: true, sessions });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : 'timeline_fetch_failed' },
      { status: 500 },
    );
  }
}
