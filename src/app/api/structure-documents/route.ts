import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { parseJsonWithSchema } from '@/lib/api/validation';
import { createStructureDocumentForUser } from '@/lib/learning-assets/service';
import { resolveAuthenticatedUser } from '@/app/api/share-import/shared';

const requestSchema = z.object({
  title: z.string().trim().min(1).max(160),
  collectionId: z.string().uuid().optional(),
  text: z.string().trim().min(1).max(20_000),
  sourceType: z.enum(['paste', 'scan']),
}).strict();

type StructureDocumentsDeps = {
  resolveUser?: typeof resolveAuthenticatedUser;
  createDocument?: typeof createStructureDocumentForUser;
};

function mapStructureError(error: unknown): { status: number; message: string } {
  const code = error instanceof Error ? error.message.split(':', 1)[0] : '';
  if (code === 'collection_not_found') {
    return { status: 404, message: 'フォルダが見つかりません。' };
  }
  return { status: 500, message: '構造解析ドキュメントの作成に失敗しました。' };
}

export async function handleStructureDocumentsPost(
  request: NextRequest,
  deps: StructureDocumentsDeps = {},
) {
  const resolveUser = deps.resolveUser ?? resolveAuthenticatedUser;
  const createDocument = deps.createDocument ?? createStructureDocumentForUser;

  try {
    const user = await resolveUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: '認証が必要です。' }, { status: 401 });
    }

    const parsed = await parseJsonWithSchema(request, requestSchema, {
      invalidMessage: '構造解析リクエストが不正です。',
    });
    if (!parsed.ok) {
      return parsed.response;
    }

    const result = await createDocument(user.id, parsed.data);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    const mapped = mapStructureError(error);
    return NextResponse.json({ success: false, error: mapped.message }, { status: mapped.status });
  }
}

export async function POST(request: NextRequest) {
  return handleStructureDocumentsPost(request);
}
