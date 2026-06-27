import { NextRequest, NextResponse } from 'next/server';
import { extractShareCode } from '../../shared';
import { getSharedWordbookPreview as getSharedProjectPreviewByShareCode } from '../../shared-wordbooks';

type Params = { params: Promise<{ shareId: string }> };

type SharedProjectPreviewGetDeps = {
  extractShareCode?: typeof extractShareCode;
  getSharedProjectPreviewByShareCode?: typeof getSharedProjectPreviewByShareCode;
};

export async function handleSharedProjectPreviewGet(
  request: NextRequest,
  { params }: Params,
  deps: SharedProjectPreviewGetDeps = {},
) {
  const parseShareCode = deps.extractShareCode ?? extractShareCode;
  const fetchPreview = deps.getSharedProjectPreviewByShareCode ?? getSharedProjectPreviewByShareCode;

  try {
    const { shareId } = await params;
    const shareCode = parseShareCode(shareId);
    if (!shareCode) {
      return NextResponse.json({ success: false, error: '共有リンクが不正です。' }, { status: 400 });
    }

    const limit = Number(request.nextUrl.searchParams.get('limit') ?? '');
    const preview = await fetchPreview(shareCode, Number.isFinite(limit) ? limit : undefined);
    if (!preview) {
      return NextResponse.json({ success: false, error: '共有単語帳が見つかりません。' }, { status: 404 });
    }

    return NextResponse.json(
      { success: true, ...preview },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    console.error('shared-project preview error:', error);
    return NextResponse.json({ success: false, error: '共有単語帳の読み込みに失敗しました。' }, { status: 500 });
  }
}

export async function GET(request: NextRequest, context: Params) {
  return handleSharedProjectPreviewGet(request, context);
}
