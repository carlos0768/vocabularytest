import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { parseJsonWithSchema } from '@/lib/api/validation';
import { extractRawTextFromImage } from '@/lib/learning-assets/ai';
import { resolveAuthenticatedUser } from '@/app/api/share-import/shared';

const requestSchema = z.object({
  image: z.string().trim().min(1).max(15_000_000),
}).strict();

type OcrTextDeps = {
  resolveUser?: typeof resolveAuthenticatedUser;
  extractText?: typeof extractRawTextFromImage;
};

export async function handleAssetsOcrTextPost(
  request: NextRequest,
  deps: OcrTextDeps = {},
) {
  const resolveUser = deps.resolveUser ?? resolveAuthenticatedUser;
  const extractText = deps.extractText ?? extractRawTextFromImage;

  try {
    const user = await resolveUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: '認証が必要です。' }, { status: 401 });
    }

    const parsed = await parseJsonWithSchema(request, requestSchema, {
      invalidMessage: '画像データが不正です。',
    });
    if (!parsed.ok) {
      return parsed.response;
    }

    const result = await extractText(parsed.data.image);
    return NextResponse.json({
      success: true,
      text: result.text,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const status = message === 'invalid_data_url' ? 400 : 500;
    const userMessage = status === 400
      ? '画像データが不正です。'
      : 'OCR に失敗しました。';

    return NextResponse.json({ success: false, error: userMessage }, { status });
  }
}

export async function POST(request: NextRequest) {
  return handleAssetsOcrTextPost(request);
}
