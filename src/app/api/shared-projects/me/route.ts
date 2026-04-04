import { NextRequest, NextResponse } from 'next/server';
import {
  listAccessibleSharedProjects,
  requireAuthenticatedUser,
} from '../shared';

type SharedProjectsMeGetDeps = {
  requireAuthenticatedUser?: typeof requireAuthenticatedUser;
  listAccessibleSharedProjects?: typeof listAccessibleSharedProjects;
};

export async function handleSharedProjectsMeGet(
  request: NextRequest,
  deps: SharedProjectsMeGetDeps = {},
) {
  const requireAuthenticated = deps.requireAuthenticatedUser ?? requireAuthenticatedUser;
  const fetchAccessibleProjects = deps.listAccessibleSharedProjects ?? listAccessibleSharedProjects;

  try {
    const auth = await requireAuthenticated(request);
    if (!auth.ok) {
      return auth.response;
    }

    const payload = await fetchAccessibleProjects(auth.user.id);
    return NextResponse.json(payload);
  } catch (error) {
    console.error('shared-projects me list error:', error);
    return NextResponse.json({ error: '共有単語帳一覧の取得に失敗しました。' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return handleSharedProjectsMeGet(request);
}
