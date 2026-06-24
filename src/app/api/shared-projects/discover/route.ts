import { NextRequest, NextResponse } from 'next/server';
import type { SharedDiscoverCategory, SharedDiscoverPayload } from '@/lib/shared-projects/types';
import { listPublicStudyGroups } from '../groups/shared';
import { listPublicSharedProjects, listPublicSharedUsers } from '../shared';

const DISCOVER_CATEGORIES = new Set<SharedDiscoverCategory>(['all', 'users', 'projects', 'groups']);

type DiscoverGetDeps = {
  listPublicSharedProjects?: typeof listPublicSharedProjects;
  listPublicSharedUsers?: typeof listPublicSharedUsers;
  listPublicStudyGroups?: typeof listPublicStudyGroups;
};

export async function handleSharedProjectsDiscoverGet(
  request: NextRequest,
  deps: DiscoverGetDeps = {},
) {
  const listProjects = deps.listPublicSharedProjects ?? listPublicSharedProjects;
  const listUsers = deps.listPublicSharedUsers ?? listPublicSharedUsers;
  const listGroups = deps.listPublicStudyGroups ?? listPublicStudyGroups;

  const requestedCategory = request.nextUrl.searchParams.get('category') ?? 'all';
  const category: SharedDiscoverCategory = DISCOVER_CATEGORIES.has(requestedCategory as SharedDiscoverCategory)
    ? requestedCategory as SharedDiscoverCategory
    : 'all';
  const limit = Number(request.nextUrl.searchParams.get('limit') ?? '');
  const cursor = request.nextUrl.searchParams.get('cursor');
  const query = request.nextUrl.searchParams.get('q');
  const normalizedLimit = Number.isFinite(limit) ? limit : undefined;

  try {
    let payload: SharedDiscoverPayload;

    if (category === 'users') {
      const result = await listUsers({ limit: normalizedLimit, cursor, query });
      payload = { category, users: result.users, projects: [], groups: [], nextCursor: result.nextCursor };
    } else if (category === 'projects') {
      const result = await listProjects({ limit: normalizedLimit, cursor, query });
      payload = { category, users: [], projects: result.items, groups: [], nextCursor: result.nextCursor };
    } else if (category === 'groups') {
      const result = await listGroups({ limit: normalizedLimit, cursor, query });
      payload = { category, users: [], projects: [], groups: result.groups, nextCursor: result.nextCursor };
    } else {
      const [users, projects, groups] = await Promise.all([
        listUsers({ limit: 6, query }),
        listProjects({ limit: 6, query }),
        listGroups({ limit: 6, query }),
      ]);
      payload = {
        category,
        users: users.users,
        projects: projects.items,
        groups: groups.groups,
        nextCursor: null,
      };
    }

    return NextResponse.json(payload, {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
      },
    });
  } catch (error) {
    console.error('shared-projects discover error:', error);
    return NextResponse.json({ error: '共有ライブラリの検索に失敗しました。' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return handleSharedProjectsDiscoverGet(request);
}
