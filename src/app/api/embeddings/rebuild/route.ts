import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  EMBEDDINGS_DISABLED_MESSAGE,
  isEmbeddingsEnabled,
} from '@/lib/embeddings/feature';

const adminHeaderSchema = z.object({
  adminSecret: z.string().trim().min(1),
}).strict();

export async function POST(request: NextRequest) {
  try {
    const adminSecret = request.headers.get('x-admin-secret');
    if (adminSecret === null) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const parsedHeader = adminHeaderSchema.safeParse({ adminSecret });
    if (!parsedHeader.success) {
      return NextResponse.json({ error: 'Invalid admin secret header' }, { status: 400 });
    }

    if (parsedHeader.data.adminSecret !== process.env.ADMIN_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!isEmbeddingsEnabled()) {
      return NextResponse.json({
        success: true,
        disabled: true,
        message: EMBEDDINGS_DISABLED_MESSAGE,
        processed: 0,
        failed: 0,
        remaining: 0,
        done: true,
      });
    }

    return NextResponse.json(
      { error: 'Embedding rebuild implementation is unavailable' },
      { status: 500 },
    );
  } catch (error) {
    console.error('Embedding rebuild error:', error);
    return NextResponse.json(
      { error: '予期しないエラーが発生しました' },
      { status: 500 },
    );
  }
}
