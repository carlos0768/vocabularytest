import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser } from '@/app/api/shared-projects/shared';
import { respondToFollowRequest, FollowError } from '@/lib/follows/server';

export async function POST(request: NextRequest) {
  const auth = await requireAuthenticatedUser(request);
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null) as {
    followId?: string;
    action?: 'accept' | 'decline';
  } | null;

  const followId = body?.followId?.trim();
  const action = body?.action;
  if (!followId || (action !== 'accept' && action !== 'decline')) {
    return NextResponse.json({ success: false, error: 'invalid_params' }, { status: 400 });
  }

  try {
    const result = await respondToFollowRequest(auth.user.id, followId, action);
    return NextResponse.json({ success: true, follow: result });
  } catch (e) {
    if (e instanceof FollowError) {
      return NextResponse.json({ success: false, error: e.code }, { status: 400 });
    }
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : 'respond_failed' },
      { status: 500 },
    );
  }
}
