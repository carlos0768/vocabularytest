import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { parseJsonWithSchema } from '@/lib/api/validation';
import {
  extractShareCode,
  getSharedProjectsSchemaIssue,
  getProjectByShareCode,
  listSharedProjects,
  requireAuthenticatedUser,
  SharedProjectsSchemaUnavailableError,
  upsertProjectMember,
} from './shared';

const joinRequestSchema = z.object({
  codeOrLink: z.string().trim().min(1).max(400),
}).strict();

const SHARED_PROJECTS_PENDING_MIGRATION_MESSAGE = '共有機能の更新が未完了です。しばらくしてから再度お試しください。';

type SharedProjectsGetDeps = {
  requireAuthenticatedUser?: typeof requireAuthenticatedUser;
  listSharedProjects?: typeof listSharedProjects;
};

type SharedProjectsPostDeps = {
  requireAuthenticatedUser?: typeof requireAuthenticatedUser;
  extractShareCode?: typeof extractShareCode;
  getProjectByShareCode?: typeof getProjectByShareCode;
  listSharedProjects?: typeof listSharedProjects;
  upsertProjectMember?: typeof upsertProjectMember;
};

export async function handleSharedProjectsGet(
  request: NextRequest,
  deps: SharedProjectsGetDeps = {},
) {
  const requireAuthenticated = deps.requireAuthenticatedUser ?? requireAuthenticatedUser;
  const fetchSharedProjects = deps.listSharedProjects ?? listSharedProjects;

  try {
    const auth = await requireAuthenticated(request);
    if (!auth.ok) {
      return auth.response;
    }

    const payload = await fetchSharedProjects(auth.user.id);
    return NextResponse.json({ success: true, ...payload });
  } catch (error) {
    logSharedProjectsRouteError('shared-projects list error:', error);
    return NextResponse.json({ success: false, error: '共有単語帳一覧の取得に失敗しました。' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return handleSharedProjectsGet(request);
}

export async function handleSharedProjectsPost(
  request: NextRequest,
  deps: SharedProjectsPostDeps = {},
) {
  const requireAuthenticated = deps.requireAuthenticatedUser ?? requireAuthenticatedUser;
  const parseShareCode = deps.extractShareCode ?? extractShareCode;
  const lookupProjectByShareCode = deps.getProjectByShareCode ?? getProjectByShareCode;
  const fetchSharedProjects = deps.listSharedProjects ?? listSharedProjects;
  const addProjectMember = deps.upsertProjectMember ?? upsertProjectMember;

  try {
    const auth = await requireAuthenticated(request);
    if (!auth.ok) {
      return auth.response;
    }

    const parsed = await parseJsonWithSchema(request, joinRequestSchema, {
      invalidMessage: '共有コードが不正です。',
    });
    if (!parsed.ok) {
      return parsed.response;
    }

    const shareCode = parseShareCode(parsed.data.codeOrLink);
    if (!shareCode) {
      return NextResponse.json({ success: false, error: '共有コードまたはリンクを確認してください。' }, { status: 400 });
    }

    const project = await lookupProjectByShareCode(shareCode);
    if (!project) {
      return NextResponse.json({ success: false, error: '共有単語帳が見つかりません。' }, { status: 404 });
    }

    if (project.user_id !== auth.user.id) {
      await addProjectMember(project.id, auth.user.id, project.user_id);
    }

    const lists = await fetchSharedProjects(auth.user.id);
    const item = [...lists.owned, ...lists.joined].find((candidate) => candidate.project.id === project.id);

    return NextResponse.json({
      success: true,
      item,
      alreadyOwned: project.user_id === auth.user.id,
    });
  } catch (error) {
    const schemaIssue = error instanceof SharedProjectsSchemaUnavailableError
      ? error.missing
      : getSharedProjectsSchemaIssue(error);

    if (schemaIssue === 'project_members') {
      logSharedProjectsRouteError('shared-projects join error:', error);
      return NextResponse.json(
        { success: false, error: SHARED_PROJECTS_PENDING_MIGRATION_MESSAGE },
        { status: 503 },
      );
    }

    logSharedProjectsRouteError('shared-projects join error:', error);
    return NextResponse.json({ success: false, error: '共有単語帳への参加に失敗しました。' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  return handleSharedProjectsPost(request);
}

function logSharedProjectsRouteError(prefix: string, error: unknown) {
  const schemaIssue = getSharedProjectsSchemaIssue(error);
  if (schemaIssue) {
    console.error(`${prefix} [schema=${schemaIssue}]`, error);
    return;
  }

  console.error(prefix, error);
}
