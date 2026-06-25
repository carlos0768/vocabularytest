import { NextResponse, type NextRequest } from 'next/server';
import { listPublicStudyGroups } from '../shared';

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get('q')?.trim() || undefined;
  const cursor = request.nextUrl.searchParams.get('cursor') || undefined;
  const limitParam = request.nextUrl.searchParams.get('limit');
  const limit = limitParam ? Math.max(1, Math.min(parseInt(limitParam, 10) || 12, 40)) : 12;

  try {
    const payload = await listPublicStudyGroups({ query: q, cursor, limit });
    return NextResponse.json({ success: true, ...payload });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : 'public_groups_fetch_failed' },
      { status: 500 },
    );
  }
}
