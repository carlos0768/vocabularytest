import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { parseJsonWithSchema } from '@/lib/api/validation';
import { createVocabularyAssetForUser } from '@/lib/learning-assets/service';
import { resolveAuthenticatedUser } from '@/app/api/share-import/shared';

const requestSchema = z.object({
  title: z.string().trim().min(1).max(160),
  collectionId: z.string().uuid(),
  iconImage: z.string().trim().optional(),
}).strict();

type VocabularyAssetsDeps = {
  resolveUser?: typeof resolveAuthenticatedUser;
  createAsset?: typeof createVocabularyAssetForUser;
};

function mapVocabularyCreateError(error: unknown): { status: number; message: string } {
  const code = error instanceof Error ? error.message.split(':', 1)[0] : '';
  if (code === 'collection_not_found') {
    return { status: 404, message: 'フォルダが見つかりません。' };
  }
  return { status: 500, message: '単語帳の作成に失敗しました。' };
}

export async function handleVocabularyAssetsPost(
  request: NextRequest,
  deps: VocabularyAssetsDeps = {},
) {
  const resolveUser = deps.resolveUser ?? resolveAuthenticatedUser;
  const createAsset = deps.createAsset ?? createVocabularyAssetForUser;

  try {
    const user = await resolveUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: '認証が必要です。' }, { status: 401 });
    }

    const parsed = await parseJsonWithSchema(request, requestSchema, {
      invalidMessage: '単語帳作成リクエストが不正です。',
    });
    if (!parsed.ok) {
      return parsed.response;
    }

    const result = await createAsset(user.id, parsed.data);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    const mapped = mapVocabularyCreateError(error);
    return NextResponse.json({ success: false, error: mapped.message }, { status: mapped.status });
  }
}

export async function POST(request: NextRequest) {
  return handleVocabularyAssetsPost(request);
}
