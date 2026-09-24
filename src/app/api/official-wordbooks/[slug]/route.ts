import { NextRequest, NextResponse } from 'next/server';
import { resolveAuthenticatedUser } from '@/app/api/share-import/shared';
import {
  OFFICIAL_WORDBOOK_GUEST_PREVIEW_WORDS,
  getPublicOfficialWordbook,
} from '@/lib/official-wordbooks/catalog';

/**
 * GET /api/official-wordbooks/[slug] — 公開中の公式単語帳1冊とその単語。
 *
 * 単語の全文はログイン必須。未ログインには先頭数語だけを返して
 * `previewOnly: true` を立てる (共有単語帳のプレビューと同じ扱い)。
 */

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ slug: string }> };

export type OfficialWordbookDetailRouteDeps = {
  resolveAuthenticatedUser: typeof resolveAuthenticatedUser;
  getPublicOfficialWordbook: typeof getPublicOfficialWordbook;
};

function getDeps(deps?: Partial<OfficialWordbookDetailRouteDeps>): OfficialWordbookDetailRouteDeps {
  return {
    resolveAuthenticatedUser: deps?.resolveAuthenticatedUser ?? resolveAuthenticatedUser,
    getPublicOfficialWordbook: deps?.getPublicOfficialWordbook ?? getPublicOfficialWordbook,
  };
}

export async function handleOfficialWordbookDetailGet(
  request: NextRequest,
  slug: string,
  deps?: Partial<OfficialWordbookDetailRouteDeps>,
) {
  const resolved = getDeps(deps);
  try {
    const user = await resolved.resolveAuthenticatedUser(request);
    const payload = await resolved.getPublicOfficialWordbook(
      decodeURIComponent(slug),
      { wordLimit: user ? null : OFFICIAL_WORDBOOK_GUEST_PREVIEW_WORDS },
    );

    if (!payload) {
      return NextResponse.json(
        { success: false, error: '公式単語帳が見つかりません。' },
        { status: 404 },
      );
    }

    return NextResponse.json(
      { success: true, ...payload },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    console.error('[official-wordbooks] detail error:', error);
    return NextResponse.json(
      { success: false, error: '公式単語帳を取得できませんでした。' },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest, { params }: Params) {
  const { slug } = await params;
  return handleOfficialWordbookDetailGet(request, slug);
}
