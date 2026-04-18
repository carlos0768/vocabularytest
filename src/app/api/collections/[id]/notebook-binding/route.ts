import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { parseJsonWithSchema } from '@/lib/api/validation';
import {
  createCollectionNotebookBindingForUser,
  getCollectionNotebookBindingForUser,
} from '@/lib/learning-assets/service';
import { resolveAuthenticatedUser } from '@/app/api/share-import/shared';

const createBindingSchema = z.object({
  wordbookAssetId: z.string().uuid(),
  structureAssetId: z.string().uuid().optional(),
  correctionAssetId: z.string().uuid().optional(),
}).strict();

type CollectionNotebookBindingDeps = {
  resolveUser?: typeof resolveAuthenticatedUser;
  getBinding?: typeof getCollectionNotebookBindingForUser;
  createBinding?: typeof createCollectionNotebookBindingForUser;
};

function mapNotebookBindingError(error: unknown): { status: number; message: string } {
  const code = error instanceof Error ? error.message.split(':', 1)[0] : '';
  if (code === 'collection_not_found') {
    return { status: 404, message: 'フォルダが見つかりません。' };
  }
  if (code === 'asset_not_found') {
    return { status: 404, message: '学習アセットが見つかりません。' };
  }
  if (code === 'notebook_binding_not_found') {
    return { status: 404, message: '関連付けが見つかりません。' };
  }
  if (code === 'notebook_binding_lookup_missing_key') {
    return { status: 400, message: 'wordbookAssetId か assetId が必要です。' };
  }
  return { status: 500, message: 'ノート関連付けの処理に失敗しました。' };
}

export async function handleCollectionNotebookBindingGet(
  request: NextRequest,
  params: { id: string },
  deps: CollectionNotebookBindingDeps = {},
) {
  const resolveUser = deps.resolveUser ?? resolveAuthenticatedUser;
  const getBinding = deps.getBinding ?? getCollectionNotebookBindingForUser;

  try {
    const user = await resolveUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: '認証が必要です。' }, { status: 401 });
    }

    const wordbookAssetId = request.nextUrl.searchParams.get('wordbookAssetId') ?? undefined;
    const assetId = request.nextUrl.searchParams.get('assetId') ?? undefined;
    if (!wordbookAssetId && !assetId) {
      return NextResponse.json({ success: false, error: 'wordbookAssetId か assetId が必要です。' }, { status: 400 });
    }

    const binding = await getBinding(user.id, params.id, { wordbookAssetId, assetId });
    return NextResponse.json({ success: true, binding });
  } catch (error) {
    const mapped = mapNotebookBindingError(error);
    return NextResponse.json({ success: false, error: mapped.message }, { status: mapped.status });
  }
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const params = await context.params;
  return handleCollectionNotebookBindingGet(request, params);
}

export async function handleCollectionNotebookBindingPost(
  request: NextRequest,
  params: { id: string },
  deps: CollectionNotebookBindingDeps = {},
) {
  const resolveUser = deps.resolveUser ?? resolveAuthenticatedUser;
  const createBinding = deps.createBinding ?? createCollectionNotebookBindingForUser;

  try {
    const user = await resolveUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: '認証が必要です。' }, { status: 401 });
    }

    const parsed = await parseJsonWithSchema(request, createBindingSchema, {
      invalidMessage: 'ノート関連付けリクエストが不正です。',
    });
    if (!parsed.ok) {
      return parsed.response;
    }

    const binding = await createBinding(user.id, params.id, parsed.data);
    return NextResponse.json({ success: true, binding });
  } catch (error) {
    const mapped = mapNotebookBindingError(error);
    return NextResponse.json({ success: false, error: mapped.message }, { status: mapped.status });
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const params = await context.params;
  return handleCollectionNotebookBindingPost(request, params);
}
