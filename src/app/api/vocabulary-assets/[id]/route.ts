import { NextRequest, NextResponse } from 'next/server';
import { getVocabularyAssetForUser } from '@/lib/learning-assets/service';
import { resolveAuthenticatedUser } from '@/app/api/share-import/shared';

type VocabularyAssetGetDeps = {
  resolveUser?: typeof resolveAuthenticatedUser;
  getAsset?: typeof getVocabularyAssetForUser;
};

function mapVocabularyGetError(error: unknown): { status: number; message: string } {
  const code = error instanceof Error ? error.message.split(':', 1)[0] : '';
  if (
    code === 'asset_not_found' ||
    code === 'project_not_found' ||
    code === 'vocabulary_asset_project_missing'
  ) {
    return { status: 404, message: '単語帳アセットが見つかりません。' };
  }
  return { status: 500, message: '単語帳アセットの取得に失敗しました。' };
}

export async function handleVocabularyAssetGet(
  request: NextRequest,
  params: { id: string },
  deps: VocabularyAssetGetDeps = {},
) {
  const resolveUser = deps.resolveUser ?? resolveAuthenticatedUser;
  const getAsset = deps.getAsset ?? getVocabularyAssetForUser;

  try {
    const user = await resolveUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: '認証が必要です。' }, { status: 401 });
    }

    const result = await getAsset(user.id, params.id);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    const mapped = mapVocabularyGetError(error);
    return NextResponse.json({ success: false, error: mapped.message }, { status: mapped.status });
  }
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const params = await context.params;
  return handleVocabularyAssetGet(request, params);
}
