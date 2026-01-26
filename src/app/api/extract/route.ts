import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@/lib/supabase/route-client';
import { extractWordsFromImage, extractCircledWordsFromImage, extractEikenWordsFromImage, extractIdiomsFromImage } from '@/lib/ai';

// Extraction modes
// - 'all': Extract all words (OpenAI)
// - 'circled': Extract circled/marked words only (Gemini)
// - 'eiken': Extract words filtered by EIKEN level (Gemini OCR → GPT analysis)
// - 'idiom': Extract idioms and phrases only (OpenAI)
export type ExtractMode = 'all' | 'circled' | 'eiken' | 'idiom';

// EIKEN levels (null means no filter, required for 'eiken' mode)
export type EikenLevel = '5' | '4' | '3' | 'pre2' | '2' | 'pre1' | '1' | null;

// API Route: POST /api/extract
// Extracts words from an uploaded image using OpenAI Vision API or Gemini API
// SECURITY: Requires authentication, enforces server-side scan limits

export async function POST(request: NextRequest) {
  try {
    // ============================================
    // 1. AUTHENTICATION CHECK
    // ============================================
    const supabase = await createRouteHandlerClient(request);
    const authHeader = request.headers.get('authorization');
    const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    const { data: { user }, error: authError } = bearerToken
      ? await supabase.auth.getUser(bearerToken)
      : await supabase.auth.getUser();

    if (authError || !user) {
      console.log('Auth failed:', authError?.message || 'No user');
      return NextResponse.json(
        { success: false, error: '認証が必要です。ログインしてください。' },
        { status: 401 }
      );
    }

    // ============================================
    // 2. PARSE REQUEST BODY
    // ============================================
    let body;
    try {
      body = await request.json();
    } catch (jsonError) {
      console.error('JSON parse error:', jsonError);
      return NextResponse.json(
        { success: false, error: 'リクエストの解析に失敗しました' },
        { status: 400 }
      );
    }

    const { image, mode = 'all', eikenLevel = null } = body as {
      image?: string;
      mode?: ExtractMode;
      eikenLevel?: EikenLevel;
    };

    // Detailed logging for debugging
    const imageLength = image?.length || 0;
    const hasDataPrefix = image?.startsWith('data:') || false;
    const dataTypeMatch = image?.match(/^data:([^;,]+)/);
    const detectedType = dataTypeMatch ? dataTypeMatch[1] : 'unknown';

    console.log('Extract API called:', {
      mode,
      eikenLevel,
      imageLength,
      hasDataPrefix,
      detectedType,
      first50Chars: image?.slice(0, 50),
    });

    if (!image) {
      return NextResponse.json(
        { success: false, error: '画像が必要です' },
        { status: 400 }
      );
    }

    // Validate base64 data URL format
    if (!image.startsWith('data:image/')) {
      console.error('Invalid image format - does not start with data:image/', { first100: image.slice(0, 100) });
      return NextResponse.json(
        { success: false, error: '画像の形式が不正です。JPEG/PNG形式の画像を使用してください。' },
        { status: 400 }
      );
    }

    // Reject unsupported image formats (HEIC/HEIF are not supported by OpenAI Vision API)
    // This can happen when client-side HEIC conversion fails
    if (image.startsWith('data:image/heic') || image.startsWith('data:image/heif')) {
      console.error('Unsupported image format: HEIC/HEIF detected', { detectedType });
      return NextResponse.json(
        { success: false, error: 'HEIC/HEIF形式は対応していません。カメラアプリの設定で「互換性優先」を選択するか、スクリーンショットをお試しください。' },
        { status: 400 }
      );
    }

    // ============================================
    // 3. CHECK & INCREMENT SCAN COUNT (SERVER-SIDE ENFORCEMENT)
    // ============================================
    // 'circled', 'eiken', and 'idiom' modes require Pro subscription
    const requiresPro = mode === 'circled' || mode === 'eiken' || mode === 'idiom';
    const { data: scanData, error: scanError } = await supabase
      .rpc('check_and_increment_scan', { p_require_pro: requiresPro });

    if (scanError || !scanData) {
      console.error('Scan limit check error:', scanError);
      return NextResponse.json(
        { success: false, error: 'スキャン制限の確認に失敗しました' },
        { status: 500 }
      );
    }

    if (scanData.requires_pro) {
      return NextResponse.json(
        { success: false, error: 'この機能はProプラン限定です。' },
        { status: 403 }
      );
    }

    if (!scanData.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: `本日のスキャン上限（${scanData.limit ?? '∞'}回）に達しました。Proプランにアップグレードすると無制限にスキャンできます。`,
          limitReached: true,
          scanInfo: {
            currentCount: scanData.current_count,
            limit: scanData.limit,
            isPro: scanData.is_pro,
          },
        },
        { status: 429 }
      );
    }

    // ============================================
    // 4. PROCESS IMAGE
    // ============================================
    let result;
    const geminiApiKey = process.env.GOOGLE_AI_API_KEY;
    const openaiApiKey = process.env.OPENAI_API_KEY;

    if (mode === 'idiom') {
      // Idiom mode: Use OpenAI API for idiom/phrase extraction
      if (!openaiApiKey) {
        return NextResponse.json(
          { success: false, error: 'OpenAI APIキーが設定されていません' },
          { status: 500 }
        );
      }

      result = await extractIdiomsFromImage(image, openaiApiKey);
    } else if (mode === 'eiken') {
      // EIKEN filter mode: Gemini OCR → GPT analysis (two-stage processing)
      if (!geminiApiKey) {
        return NextResponse.json(
          { success: false, error: 'Gemini APIキーが設定されていません' },
          { status: 500 }
        );
      }
      if (!openaiApiKey) {
        return NextResponse.json(
          { success: false, error: 'OpenAI APIキーが設定されていません' },
          { status: 500 }
        );
      }
      if (!eikenLevel) {
        return NextResponse.json(
          { success: false, error: '英検レベルを指定してください' },
          { status: 400 }
        );
      }

      result = await extractEikenWordsFromImage(image, geminiApiKey, openaiApiKey, eikenLevel);
    } else if (mode === 'circled') {
      // Circled mode: Use Gemini API for circled word extraction
      if (!geminiApiKey) {
        return NextResponse.json(
          { success: false, error: 'Gemini APIキーが設定されていません' },
          { status: 500 }
        );
      }

      // Note: eikenLevel is NOT used for circled mode anymore
      result = await extractCircledWordsFromImage(image, geminiApiKey, {});
    } else {
      // Default 'all' mode: Use OpenAI API for all word extraction
      if (!openaiApiKey) {
        return NextResponse.json(
          { success: false, error: 'OpenAI APIキーが設定されていません' },
          { status: 500 }
        );
      }

      // Note: eikenLevel is NOT used for 'all' mode anymore (use 'eiken' mode instead)
      // Pro users get example sentences included (determined server-side)
      result = await extractWordsFromImage(image, openaiApiKey, {
        includeExamples: scanData.is_pro === true,
      });
    }

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 422 }
      );
    }

    // ============================================
    // 5. RETURN SUCCESS RESPONSE
    // ============================================
    return NextResponse.json({
      success: true,
      words: result.data.words,
      scanInfo: {
        currentCount: scanData.current_count,
        limit: scanData.limit,
        isPro: scanData.is_pro,
      },
    });
  } catch (error) {
    console.error('Extract API error:', error);
    return NextResponse.json(
      { success: false, error: '予期しないエラーが発生しました' },
      { status: 500 }
    );
  }
}
