import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { parseJsonWithSchema } from '@/lib/api/validation';
import { extractShareCode, requireAuthenticatedUser } from '../../../shared';
import {
  getSharedWordbookLikeState,
  setSharedWordbookLike,
} from '../../../shared-wordbooks';

type Params = { params: Promise<{ shareId: string }> };

const likeSchema = z.object({
  liked: z.boolean(),
}).strict();

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { shareId } = await params;
    const shareCode = extractShareCode(shareId);
    if (!shareCode) {
      return NextResponse.json({ success: false, error: '共有リンクが不正です。' }, { status: 400 });
    }

    const auth = await requireAuthenticatedUser(request);
    const userId = auth.ok ? auth.user.id : null;
    const state = await getSharedWordbookLikeState(shareCode, userId);
    if (!state) {
      return NextResponse.json({ success: false, error: '共有単語帳が見つかりません。' }, { status: 404 });
    }

    return NextResponse.json({ success: true, ...state });
  } catch (error) {
    console.error('shared-wordbook like state error:', error);
    return NextResponse.json({ success: false, error: 'いいねの取得に失敗しました。' }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { shareId } = await params;
    const shareCode = extractShareCode(shareId);
    if (!shareCode) {
      return NextResponse.json({ success: false, error: '共有リンクが不正です。' }, { status: 400 });
    }

    const auth = await requireAuthenticatedUser(request);
    if (!auth.ok) return auth.response;

    const parsed = await parseJsonWithSchema(request, likeSchema, {
      invalidMessage: 'リクエストが不正です。',
    });
    if (!parsed.ok) return parsed.response;

    const state = await setSharedWordbookLike(shareCode, auth.user.id, parsed.data.liked);
    if (!state) {
      return NextResponse.json({ success: false, error: '共有単語帳が見つかりません。' }, { status: 404 });
    }

    return NextResponse.json({ success: true, ...state });
  } catch (error) {
    console.error('shared-wordbook like toggle error:', error);
    return NextResponse.json({ success: false, error: 'いいねに失敗しました。' }, { status: 500 });
  }
}
