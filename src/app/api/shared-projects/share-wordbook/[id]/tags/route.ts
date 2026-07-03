import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { parseJsonWithSchema } from '@/lib/api/validation';
import { requireAuthenticatedUser } from '../../../shared';
import {
  updateSharedWordbookTags,
  SharedWordbookError,
} from '../../../shared-wordbooks';

type Params = { params: Promise<{ id: string }> };

const tagsSchema = z.object({
  sharedTags: z.array(z.string().trim().min(1).max(64)).max(8),
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
    const parsed = await parseJsonWithSchema(request, tagsSchema, {
      invalidMessage: 'タグを確認してください。',
    });
    if (!parsed.ok) return parsed.response;

    const wordbook = await updateSharedWordbookTags(auth.user.id, id, parsed.data.sharedTags);
    return NextResponse.json({ success: true, wordbook, sharedTags: wordbook.project.sharedTags ?? [] });
  } catch (error) {
    if (error instanceof SharedWordbookError) {
      return NextResponse.json({ success: false, error: '共有単語帳を更新できませんでした。' }, { status: errorStatus(error) });
    }
    console.error('share-wordbook tags update error:', error);
    return NextResponse.json({ success: false, error: 'タグの保存に失敗しました。' }, { status: 500 });
  }
}
