import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { parseJsonWithSchema } from '@/lib/api/validation';
import { requireAuthenticatedUser } from '../../shared';
import {
  renameSharedWordbook,
  unpublishSharedWordbook,
  SharedWordbookError,
} from '../../shared-wordbooks';

type Params = { params: Promise<{ id: string }> };

const renameSchema = z.object({
  title: z.string().trim().min(1).max(80),
}).strict();

function errorStatus(error: SharedWordbookError): number {
  if (error.code === 'not_found') return 404;
  if (error.code === 'forbidden') return 403;
  return 400;
}

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const auth = await requireAuthenticatedUser(request);
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const parsed = await parseJsonWithSchema(request, renameSchema, {
      invalidMessage: '単語帳名を確認してください。',
    });
    if (!parsed.ok) return parsed.response;

    const wordbook = await renameSharedWordbook(auth.user.id, id, parsed.data.title);
    return NextResponse.json({ success: true, wordbook });
  } catch (error) {
    if (error instanceof SharedWordbookError) {
      return NextResponse.json({ success: false, error: '共有単語帳を更新できませんでした。' }, { status: errorStatus(error) });
    }
    console.error('share-wordbook rename error:', error);
    return NextResponse.json({ success: false, error: '共有単語帳の更新に失敗しました。' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const auth = await requireAuthenticatedUser(request);
    if (!auth.ok) return auth.response;

    const { id } = await params;
    await unpublishSharedWordbook(auth.user.id, id);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof SharedWordbookError) {
      return NextResponse.json({ success: false, error: '共有を停止できませんでした。' }, { status: errorStatus(error) });
    }
    console.error('share-wordbook unpublish error:', error);
    return NextResponse.json({ success: false, error: '共有の停止に失敗しました。' }, { status: 500 });
  }
}
