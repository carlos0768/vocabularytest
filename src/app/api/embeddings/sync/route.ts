import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createRouteHandlerClient } from '@/lib/supabase/route-client';
import { parseJsonWithSchema } from '@/lib/api/validation';
import {
  EMBEDDINGS_DISABLED_MESSAGE,
  isEmbeddingsEnabled,
} from '@/lib/embeddings/feature';

const requestSchema = z.object({
  wordIds: z.array(z.string().min(1).max(64)).max(500).optional(),
  limit: z.number().int().min(1).max(50).optional(),
}).strict();

async function authenticate(request: NextRequest) {
  const supabase = await createRouteHandlerClient(request);
  const authHeader = request.headers.get('authorization');
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const { data: { user }, error } = bearerToken
    ? await supabase.auth.getUser(bearerToken)
    : await supabase.auth.getUser();

  return { user, error };
}

export async function POST(request: NextRequest) {
  try {
    const { user, error } = await authenticate(request);
    if (error || !user) {
      return NextResponse.json(
        { success: false, error: '認証が必要です。ログインしてください。' },
        { status: 401 },
      );
    }

    const parsed = await parseJsonWithSchema(request, requestSchema, {
      invalidMessage: '無効なリクエスト形式です',
      allowEmptyBody: true,
    });
    if (!parsed.ok) {
      return parsed.response;
    }

    if (!isEmbeddingsEnabled()) {
      return NextResponse.json({
        success: true,
        disabled: true,
        message: EMBEDDINGS_DISABLED_MESSAGE,
        processed: 0,
        failed: 0,
        remaining: 0,
      });
    }

    return NextResponse.json(
      { success: false, error: 'Embedding同期の実装が見つかりません' },
      { status: 500 },
    );
  } catch (error) {
    console.error('Embedding sync API error:', error);
    return NextResponse.json(
      { success: false, error: '予期しないエラーが発生しました' },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { user, error } = await authenticate(request);
    if (error || !user) {
      return NextResponse.json(
        { success: false, error: '認証が必要です' },
        { status: 401 },
      );
    }

    if (!isEmbeddingsEnabled()) {
      return NextResponse.json({
        success: true,
        disabled: true,
        message: EMBEDDINGS_DISABLED_MESSAGE,
        wordsWithoutEmbedding: 0,
        needsSync: false,
      });
    }

    return NextResponse.json(
      { success: false, error: 'Embedding同期状態の実装が見つかりません' },
      { status: 500 },
    );
  } catch (error) {
    console.error('Embedding sync status error:', error);
    return NextResponse.json(
      { success: false, error: '予期しないエラーが発生しました' },
      { status: 500 },
    );
  }
}
