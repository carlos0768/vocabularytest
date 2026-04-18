import { NextRequest, NextResponse } from 'next/server';
import { listCorrectionReviewQueueForUser } from '@/lib/learning-assets/service';
import { resolveAuthenticatedUser } from '@/app/api/share-import/shared';

type ReviewCorrectionsDeps = {
  resolveUser?: typeof resolveAuthenticatedUser;
  listQueue?: typeof listCorrectionReviewQueueForUser;
};

export async function handleReviewCorrectionsGet(
  request: NextRequest,
  deps: ReviewCorrectionsDeps = {},
) {
  const resolveUser = deps.resolveUser ?? resolveAuthenticatedUser;
  const listQueue = deps.listQueue ?? listCorrectionReviewQueueForUser;

  try {
    const user = await resolveUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: '認証が必要です。' }, { status: 401 });
    }

    const url = new URL(request.url);
    const statusParam = url.searchParams.get('status');
    const status = statusParam === 'new' || statusParam === 'review' || statusParam === 'due'
      ? statusParam
      : undefined;
    const collectionId = url.searchParams.get('collectionId') ?? undefined;

    const items = await listQueue(user.id, { collectionId, status });
    return NextResponse.json({ success: true, items });
  } catch (error) {
    const code = error instanceof Error ? error.message.split(':', 1)[0] : '';
    const status = code === 'collection_not_found' ? 404 : 500;
    const message = code === 'collection_not_found'
      ? 'フォルダが見つかりません。'
      : '添削復習キューの取得に失敗しました。';
    return NextResponse.json({ success: false, error: message }, { status });
  }
}

export async function GET(request: NextRequest) {
  return handleReviewCorrectionsGet(request);
}
