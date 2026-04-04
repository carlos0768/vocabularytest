import { NextRequest, NextResponse } from 'next/server';
import { listPublicSharedProjects } from '../shared';

type SharedProjectsPublicGetDeps = {
  listPublicSharedProjects?: typeof listPublicSharedProjects;
};

export async function handleSharedProjectsPublicGet(
  request: NextRequest,
  deps: SharedProjectsPublicGetDeps = {},
) {
  const fetchPublicProjects = deps.listPublicSharedProjects ?? listPublicSharedProjects;
  const limit = Number(request.nextUrl.searchParams.get('limit') ?? '');
  const cursor = request.nextUrl.searchParams.get('cursor');

  try {
    const payload = await fetchPublicProjects({
      limit: Number.isFinite(limit) ? limit : undefined,
      cursor,
    });

    return NextResponse.json(payload, {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
      },
    });
  } catch (error) {
    console.error('shared-projects public list error:', error);
    return NextResponse.json({ error: '公開単語帳一覧の取得に失敗しました。' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return handleSharedProjectsPublicGet(request);
}
