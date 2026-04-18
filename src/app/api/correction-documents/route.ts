import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { parseJsonWithSchema } from '@/lib/api/validation';
import { createCorrectionDocumentForUser } from '@/lib/learning-assets/service';
import { resolveAuthenticatedUser } from '@/app/api/share-import/shared';

const requestSchema = z.object({
  title: z.string().trim().min(1).max(160),
  collectionId: z.string().uuid().optional(),
  wordbookAssetId: z.string().uuid().optional(),
  text: z.string().trim().min(1).max(20_000),
  sourceType: z.enum(['paste', 'scan']),
}).strict();

type CorrectionDocumentsDeps = {
  resolveUser?: typeof resolveAuthenticatedUser;
  createDocument?: typeof createCorrectionDocumentForUser;
};

function mapCorrectionError(error: unknown): { status: number; message: string } {
  const code = error instanceof Error ? error.message.split(':', 1)[0] : '';
  if (code === 'collection_not_found') {
    return { status: 404, message: 'フォルダが見つかりません。' };
  }
  if (code === 'asset_not_found') {
    return { status: 404, message: '関連付け対象の単語帳が見つかりません。' };
  }
  if (code === 'notebook_binding_requires_collection') {
    return { status: 400, message: '関連付けにはフォルダ指定が必要です。' };
  }
  return { status: 500, message: '添削ドキュメントの作成に失敗しました。' };
}

export async function handleCorrectionDocumentsPost(
  request: NextRequest,
  deps: CorrectionDocumentsDeps = {},
) {
  const resolveUser = deps.resolveUser ?? resolveAuthenticatedUser;
  const createDocument = deps.createDocument ?? createCorrectionDocumentForUser;

  try {
    const user = await resolveUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: '認証が必要です。' }, { status: 401 });
    }

    const parsed = await parseJsonWithSchema(request, requestSchema, {
      invalidMessage: '添削リクエストが不正です。',
    });
    if (!parsed.ok) {
      return parsed.response;
    }

    const result = await createDocument(user.id, parsed.data);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    const mapped = mapCorrectionError(error);
    return NextResponse.json({ success: false, error: mapped.message }, { status: mapped.status });
  }
}

export async function POST(request: NextRequest) {
  return handleCorrectionDocumentsPost(request);
}
