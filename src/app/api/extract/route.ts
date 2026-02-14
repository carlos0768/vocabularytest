import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@/lib/supabase/route-client';
import { extractWordsFromImage, extractCircledWordsFromImage, extractHighlightedWordsFromImage, extractEikenWordsFromImage, extractIdiomsFromImage, extractWrongAnswersFromImage } from '@/lib/ai';
import { AI_CONFIG } from '@/lib/ai/config';
import { z } from 'zod';
import { parseJsonWithSchema } from '@/lib/api/validation';

// Extraction modes
// - 'all': Extract all words (OpenAI)
// - 'circled': Extract circled/marked words only (Gemini)
// - 'highlighted': Extract highlighted/marker words only (Gemini 2.5 Flash)
// - 'eiken': Extract words filtered by EIKEN level (Gemini OCR → GPT analysis)
// - 'idiom': Extract idioms and phrases only (OpenAI)
// - 'wrong': Extract only incorrectly answered words from vocabulary tests (Gemini OCR → GPT analysis)
export type ExtractMode = 'all' | 'circled' | 'highlighted' | 'eiken' | 'idiom' | 'wrong';

// EIKEN levels (null means no filter, required for 'eiken' mode)
export type EikenLevel = '5' | '4' | '3' | 'pre2' | '2' | 'pre1' | '1' | null;

const requestSchema = z.object({
  image: z.string().min(1).max(15_000_000),
  mode: z.enum(['all', 'circled', 'highlighted', 'eiken', 'idiom', 'wrong']).optional().default('all'),
  eikenLevel: z.enum(['5', '4', '3', 'pre2', '2', 'pre1', '1']).nullable().optional().default(null),
}).strict();

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
    const parsed = await parseJsonWithSchema(request, requestSchema, {
      invalidMessage: 'リクエストの解析に失敗しました',
    });
    if (!parsed.ok) {
      return parsed.response;
    }
    const { image, mode, eikenLevel } = parsed.data as {
      image: string;
      mode: ExtractMode;
      eikenLevel: EikenLevel;
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

    // Validate base64 data URL format (accepts images and PDFs)
    const isValidImage = image.startsWith('data:image/');
    const isValidPdf = image.startsWith('data:application/pdf');

    if (!isValidImage && !isValidPdf) {
      console.error('Invalid file format - not image or PDF', { first100: image.slice(0, 100) });
      return NextResponse.json(
        { success: false, error: 'ファイル形式が不正です。JPEG/PNG形式の画像またはPDFを使用してください。' },
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
    // 'circled', 'highlighted', 'eiken', 'idiom', and 'wrong' modes require Pro subscription
    const requiresPro = mode === 'circled' || mode === 'highlighted' || mode === 'eiken' || mode === 'idiom' || mode === 'wrong';
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

    if (mode === 'wrong') {
      // Wrong answer mode: Gemini OCR → GPT analysis for vocabulary test mistakes
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

      result = await extractWrongAnswersFromImage(image, geminiApiKey, openaiApiKey);
    } else if (mode === 'idiom') {
      // Idiom mode: Use configured provider for idiom/phrase extraction
      const idiomsProvider = AI_CONFIG.extraction.idioms.provider;
      const idiomsApiKey = idiomsProvider === 'gemini' ? geminiApiKey : openaiApiKey;

      if (!idiomsApiKey) {
        return NextResponse.json(
          { success: false, error: `${idiomsProvider === 'gemini' ? 'Gemini' : 'OpenAI'} APIキーが設定されていません` },
          { status: 500 }
        );
      }

      result = await extractIdiomsFromImage(image, idiomsApiKey);
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
      // Circled mode: Use configured provider for circled word extraction
      const circledProvider = AI_CONFIG.extraction.circled.provider;
      const circledApiKey = circledProvider === 'gemini' ? geminiApiKey : openaiApiKey;

      if (!circledApiKey) {
        return NextResponse.json(
          { success: false, error: `${circledProvider === 'gemini' ? 'Gemini' : 'OpenAI'} APIキーが設定されていません` },
          { status: 500 }
        );
      }

      // Note: eikenLevel is NOT used for circled mode anymore
      result = await extractCircledWordsFromImage(image, circledApiKey, {}, openaiApiKey);
    } else if (mode === 'highlighted') {
      // Highlighted mode: Use configured provider for highlighted/marker word extraction
      const highlightedProvider = AI_CONFIG.extraction.circled.provider; // Same config as circled
      const highlightedApiKey = highlightedProvider === 'gemini' ? geminiApiKey : openaiApiKey;

      if (!highlightedApiKey) {
        return NextResponse.json(
          { success: false, error: `${highlightedProvider === 'gemini' ? 'Gemini' : 'OpenAI'} APIキーが設定されていません` },
          { status: 500 }
        );
      }

      result = await extractHighlightedWordsFromImage(image, highlightedApiKey, openaiApiKey);
    } else {
      // Default 'all' mode: Use configured provider for all word extraction
      const wordsProvider = AI_CONFIG.extraction.words.provider;
      const wordsApiKey = wordsProvider === 'gemini' ? geminiApiKey : openaiApiKey;

      if (!wordsApiKey) {
        return NextResponse.json(
          { success: false, error: `${wordsProvider === 'gemini' ? 'Gemini' : 'OpenAI'} APIキーが設定されていません` },
          { status: 500 }
        );
      }

      // Note: eikenLevel is NOT used for 'all' mode anymore (use 'eiken' mode instead)
      // Pro users get example sentences included (determined server-side)
      result = await extractWordsFromImage(image, wordsApiKey, {
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
