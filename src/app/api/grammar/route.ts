import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@/lib/supabase/route-client';
import { extractGrammarFromImage } from '@/lib/ai/extract-grammar';
import { getAPIKeys } from '@/lib/ai/config';
import { z } from 'zod';
import { parseJsonWithSchema } from '@/lib/api/validation';

const requestSchema = z.object({
  image: z.string().min(1).max(15_000_000),
}).strict();

// API Route: POST /api/grammar
// Extracts grammar patterns from an uploaded image using 2-stage AI processing
// SECURITY: Requires authentication, Pro-only feature

export async function POST(request: NextRequest) {
  try {
    // 1. AUTHENTICATION CHECK
    const supabase = await createRouteHandlerClient(request);
    const authHeader = request.headers.get('authorization');
    const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    const { data: { user }, error: authError } = bearerToken
      ? await supabase.auth.getUser(bearerToken)
      : await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: '認証が必要です。ログインしてください。' },
        { status: 401 }
      );
    }

    // 2. PARSE REQUEST BODY
    const parsed = await parseJsonWithSchema(request, requestSchema, {
      invalidMessage: 'リクエストの解析に失敗しました',
    });
    if (!parsed.ok) {
      return parsed.response;
    }
    const { image } = parsed.data;

    // Validate base64 data URL format
    const isValidImage = image.startsWith('data:image/');
    const isValidPdf = image.startsWith('data:application/pdf');

    if (!isValidImage && !isValidPdf) {
      return NextResponse.json(
        { success: false, error: 'ファイル形式が不正です。JPEG/PNG形式の画像またはPDFを使用してください。' },
        { status: 400 }
      );
    }

    if (image.startsWith('data:image/heic') || image.startsWith('data:image/heif')) {
      return NextResponse.json(
        { success: false, error: 'HEIC/HEIF形式は対応していません。' },
        { status: 400 }
      );
    }

    // 3. CHECK SCAN LIMIT (Pro-only feature)
    const { data: scanData, error: scanError } = await supabase
      .rpc('check_and_increment_scan', { p_require_pro: true });

    if (scanError || !scanData) {
      console.error('Scan limit check error:', scanError);
      return NextResponse.json(
        { success: false, error: 'スキャン制限の確認に失敗しました' },
        { status: 500 }
      );
    }

    if (scanData.requires_pro) {
      return NextResponse.json(
        { success: false, error: '文法抽出はProプラン限定です。' },
        { status: 403 }
      );
    }

    if (!scanData.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: `本日のスキャン上限に達しました。`,
          limitReached: true,
        },
        { status: 429 }
      );
    }

    // 4. EXTRACT GRAMMAR PATTERNS
    const apiKeys = getAPIKeys();
    if (!apiKeys.gemini) {
      return NextResponse.json(
        { success: false, error: 'Google AI APIキーが設定されていません' },
        { status: 500 }
      );
    }

    const result = await extractGrammarFromImage(image, apiKeys);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 422 }
      );
    }

    return NextResponse.json({
      success: true,
      data: result.data,
    });
  } catch (error) {
    console.error('Grammar API error:', error);
    return NextResponse.json(
      { success: false, error: '文法抽出に失敗しました。もう一度お試しください。' },
      { status: 500 }
    );
  }
}
