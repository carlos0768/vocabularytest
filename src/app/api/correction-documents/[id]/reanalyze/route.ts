import { NextRequest, NextResponse } from 'next/server';
import { reanalyzeCorrectionDocumentForUser } from '@/lib/learning-assets/service';
import { resolveAuthenticatedUser } from '@/app/api/share-import/shared';

type CorrectionReanalyzeDeps = {
  resolveUser?: typeof resolveAuthenticatedUser;
  reanalyzeDocument?: typeof reanalyzeCorrectionDocumentForUser;
};

function mapCorrectionReanalyzeError(error: unknown): { status: number; message: string } {
  const code = error instanceof Error ? error.message.split(':', 1)[0] : '';
  if (code === 'asset_not_found' || code === 'correction_document_not_found') {
    return { status: 404, message: '添削ドキュメントが見つかりません。' };
  }
  return { status: 500, message: '添削の再実行に失敗しました。' };
}

export async function handleCorrectionDocumentReanalyzePost(
  request: NextRequest,
  params: { id: string },
  deps: CorrectionReanalyzeDeps = {},
) {
  const resolveUser = deps.resolveUser ?? resolveAuthenticatedUser;
  const reanalyzeDocument = deps.reanalyzeDocument ?? reanalyzeCorrectionDocumentForUser;

  try {
    const user = await resolveUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: '認証が必要です。' }, { status: 401 });
    }

    const result = await reanalyzeDocument(user.id, params.id);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    const mapped = mapCorrectionReanalyzeError(error);
    return NextResponse.json({ success: false, error: mapped.message }, { status: mapped.status });
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const params = await context.params;
  return handleCorrectionDocumentReanalyzePost(request, params);
}
