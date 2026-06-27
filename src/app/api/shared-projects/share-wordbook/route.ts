import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { parseJsonWithSchema } from '@/lib/api/validation';
import { requireAuthenticatedUser } from '../shared';
import { isUserActivePro } from '../pro';
import {
  listMySharedWordbooks,
  publishSharedWordbook,
  SharedWordbookError,
} from '../shared-wordbooks';

const publishSchema = z.object({
  projectId: z.string().trim().min(1),
  sharedTags: z.array(z.string()).max(16).optional(),
}).strict();

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuthenticatedUser(request);
    if (!auth.ok) return auth.response;

    const wordbooks = await listMySharedWordbooks(auth.user.id);
    return NextResponse.json({ success: true, wordbooks });
  } catch (error) {
    console.error('share-wordbook list error:', error);
    return NextResponse.json({ success: false, error: '共有単語帳の取得に失敗しました。' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuthenticatedUser(request);
    if (!auth.ok) return auth.response;

    const parsed = await parseJsonWithSchema(request, publishSchema, {
      invalidMessage: '共有内容を確認してください。',
    });
    if (!parsed.ok) return parsed.response;

    const isPro = await isUserActivePro(auth.user.id);
    if (!isPro) {
      return NextResponse.json({ success: false, error: '単語帳の共有はProプラン限定です。' }, { status: 403 });
    }

    const wordbook = await publishSharedWordbook(
      auth.user.id,
      parsed.data.projectId,
      parsed.data.sharedTags ?? [],
    );

    return NextResponse.json({ success: true, wordbook }, { status: 201 });
  } catch (error) {
    if (error instanceof SharedWordbookError) {
      const status = error.code === 'not_found' ? 404 : error.code === 'forbidden' ? 403 : 400;
      return NextResponse.json({ success: false, error: '共有する単語帳が見つかりません。' }, { status });
    }
    console.error('share-wordbook publish error:', error);
    return NextResponse.json({ success: false, error: '単語帳の共有に失敗しました。' }, { status: 500 });
  }
}
