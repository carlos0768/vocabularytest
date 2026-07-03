import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@/lib/supabase/route-client';
import { requireAuthenticatedUser } from '@/app/api/shared-projects/shared';
import {
  REEL_FEED_DEFAULT_LIMIT,
  REEL_FEED_MAX_LIMIT,
  buildReelFeedPage,
} from '../shared';

export const dynamic = 'force-dynamic';

export type ReelFeedRouteDeps = {
  requireAuthenticatedUser: typeof requireAuthenticatedUser;
  createRouteHandlerClient: typeof createRouteHandlerClient;
  buildReelFeedPage: typeof buildReelFeedPage;
};

function getDeps(deps?: Partial<ReelFeedRouteDeps>): ReelFeedRouteDeps {
  return {
    requireAuthenticatedUser: deps?.requireAuthenticatedUser ?? requireAuthenticatedUser,
    createRouteHandlerClient: deps?.createRouteHandlerClient ?? createRouteHandlerClient,
    buildReelFeedPage: deps?.buildReelFeedPage ?? buildReelFeedPage,
  };
}

export function clampReelFeedLimit(raw: string | null): number {
  const parsed = Number(raw);
  if (raw === null || raw.trim() === '' || !Number.isFinite(parsed)) {
    return REEL_FEED_DEFAULT_LIMIT;
  }
  return Math.max(1, Math.min(REEL_FEED_MAX_LIMIT, Math.floor(parsed)));
}

export async function handleReelFeedGet(
  request: NextRequest,
  deps?: Partial<ReelFeedRouteDeps>,
) {
  const resolved = getDeps(deps);
  try {
    const auth = await resolved.requireAuthenticatedUser(request);
    if (!auth.ok) return auth.response;

    const limit = clampReelFeedLimit(request.nextUrl.searchParams.get('limit'));
    const cursor = request.nextUrl.searchParams.get('cursor');

    const userClient = await resolved.createRouteHandlerClient(request);
    const page = await resolved.buildReelFeedPage({
      userId: auth.user.id,
      userClient,
      cursor,
      limit,
    });

    return NextResponse.json(
      { success: true, ...page },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    console.error('reel feed error:', error);
    return NextResponse.json(
      { success: false, error: 'リールの取得に失敗しました。' },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  return handleReelFeedGet(request);
}
