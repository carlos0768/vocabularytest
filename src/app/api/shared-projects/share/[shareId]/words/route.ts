import { NextRequest, NextResponse } from 'next/server';
import {
  extractShareCode,
  getSharedProjectWordsByShareCode,
  requireAuthenticatedUser,
} from '../../../shared';
import {
  getSharedWordbookByShareId,
  getSharedWordbookWords,
} from '../../../shared-wordbooks';

type Params = { params: Promise<{ shareId: string }> };

/**
 * Full word list for a published shared wordbook. Available to all logged-in
 * users (free included); logged-out visitors see the limited preview returned
 * by the share preview route instead.
 */
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { shareId } = await params;
    const shareCode = extractShareCode(shareId);
    if (!shareCode) {
      return NextResponse.json({ success: false, error: '共有リンクが不正です。' }, { status: 400 });
    }

    const auth = await requireAuthenticatedUser(request);
    if (!auth.ok) return auth.response;

    const sharedWordbook = await getSharedWordbookByShareId(shareCode);
    const words = sharedWordbook
      ? await getSharedWordbookWords(shareCode)
      : await getSharedProjectWordsByShareCode(shareCode);
    return NextResponse.json({ success: true, words }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('shared-wordbook words error:', error);
    return NextResponse.json({ success: false, error: '単語の取得に失敗しました。' }, { status: 500 });
  }
}
