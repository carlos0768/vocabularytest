import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { parseJsonWithSchema } from '@/lib/api/validation';
import { updateCollectionNotebookBindingForUser } from '@/lib/learning-assets/service';
import { resolveAuthenticatedUser } from '@/app/api/share-import/shared';

const updateBindingSchema = z.object({
  wordbookAssetId: z.string().uuid().optional(),
  structureAssetId: z.string().uuid().nullable().optional(),
  correctionAssetId: z.string().uuid().nullable().optional(),
}).strict().refine(
  (value) =>
    value.wordbookAssetId !== undefined ||
    value.structureAssetId !== undefined ||
    value.correctionAssetId !== undefined,
  '少なくとも1つの更新項目が必要です。',
);

type CollectionNotebookBindingPatchDeps = {
  resolveUser?: typeof resolveAuthenticatedUser;
  updateBinding?: typeof updateCollectionNotebookBindingForUser;
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
  return { status: 500, message: 'ノート関連付けの更新に失敗しました。' };
}

export async function handleCollectionNotebookBindingPatch(
  request: NextRequest,
  params: { id: string; bindingId: string },
  deps: CollectionNotebookBindingPatchDeps = {},
) {
  const resolveUser = deps.resolveUser ?? resolveAuthenticatedUser;
  const updateBinding = deps.updateBinding ?? updateCollectionNotebookBindingForUser;

  try {
    const user = await resolveUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: '認証が必要です。' }, { status: 401 });
    }

    const parsed = await parseJsonWithSchema(request, updateBindingSchema, {
      invalidMessage: 'ノート関連付け更新リクエストが不正です。',
    });
    if (!parsed.ok) {
      return parsed.response;
    }

    const binding = await updateBinding(user.id, params.id, params.bindingId, parsed.data);
    return NextResponse.json({ success: true, binding });
  } catch (error) {
    const mapped = mapNotebookBindingError(error);
    return NextResponse.json({ success: false, error: mapped.message }, { status: mapped.status });
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string; bindingId: string }> },
) {
  const params = await context.params;
  return handleCollectionNotebookBindingPatch(request, params);
}
