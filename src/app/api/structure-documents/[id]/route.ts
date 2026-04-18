import { NextRequest, NextResponse } from 'next/server';
import { getStructureDocumentForUser } from '@/lib/learning-assets/service';
import { resolveAuthenticatedUser } from '@/app/api/share-import/shared';

type StructureDocumentGetDeps = {
  resolveUser?: typeof resolveAuthenticatedUser;
  getDocument?: typeof getStructureDocumentForUser;
};

function mapStructureGetError(error: unknown): { status: number; message: string } {
  const code = error instanceof Error ? error.message.split(':', 1)[0] : '';
  if (code === 'asset_not_found' || code === 'structure_document_not_found') {
    return { status: 404, message: '構造解析ドキュメントが見つかりません。' };
  }
  return { status: 500, message: '構造解析ドキュメントの取得に失敗しました。' };
}

export async function handleStructureDocumentGet(
  request: NextRequest,
  params: { id: string },
  deps: StructureDocumentGetDeps = {},
) {
  const resolveUser = deps.resolveUser ?? resolveAuthenticatedUser;
  const getDocument = deps.getDocument ?? getStructureDocumentForUser;

  try {
    const user = await resolveUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: '認証が必要です。' }, { status: 401 });
    }

    const result = await getDocument(user.id, params.id);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    const mapped = mapStructureGetError(error);
    return NextResponse.json({ success: false, error: mapped.message }, { status: mapped.status });
  }
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const params = await context.params;
  return handleStructureDocumentGet(request, params);
}
