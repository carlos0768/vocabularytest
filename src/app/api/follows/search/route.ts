import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser } from '@/app/api/shared-projects/shared';
import { searchUsersForFollow } from '@/lib/follows/server';

export async function GET(request: NextRequest) {
  const auth = await requireAuthenticatedUser(request);
  if (!auth.ok) return auth.response;

  const q = request.nextUrl.searchParams.get('q')?.trim();
  if (!q) {
    return NextResponse.json({ success: false, error: 'missing_query' }, { status: 400 });
  }

  try {
    const results = await searchUsersForFollow(auth.user.id, q);
    return NextResponse.json({ success: true, results });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : 'search_failed' },
      { status: 500 },
    );
  }
}
