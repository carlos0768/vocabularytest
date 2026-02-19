import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@/lib/supabase/route-client';
import { extractWordsFromImage, extractCircledWordsFromImage, extractHighlightedWordsFromImage, extractHighlightedWordsFromImages, extractEikenWordsFromImage, extractIdiomsFromImage, extractWrongAnswersFromImage } from '@/lib/ai';
import { AI_CONFIG } from '@/lib/ai/config';
import { z } from 'zod';
import { parseJsonWithSchema } from '@/lib/api/validation';

// Extraction modes
// - 'all': Extract all words (OpenAI)
// - 'circled': Extract circled/marked words only (OpenAI)
// - 'highlighted': Extract highlighted/marker words only (OpenAI)
// - 'eiken': Extract words filtered by EIKEN level (OpenAI)
// - 'idiom': Extract idioms and phrases only (OpenAI)
// - 'wrong': Extract only incorrectly answered words from vocabulary tests (OpenAI)
export type ExtractMode = 'all' | 'circled' | 'highlighted' | 'eiken' | 'idiom' | 'wrong';

// EIKEN levels (null means no filter, required for 'eiken' mode)
export type EikenLevel = '5' | '4' | '3' | 'pre2' | '2' | 'pre1' | '1' | null;

const requestSchema = z.object({
  image: z.string().min(1).max(15_000_000).optional(),
  images: z.array(z.string().min(1).max(15_000_000)).max(5).optional(),
  mode: z.enum(['all', 'circled', 'highlighted', 'eiken', 'idiom', 'wrong']).optional().default('all'),
  eikenLevel: z.enum(['5', '4', '3', 'pre2', '2', 'pre1', '1']).nullable().optional().default(null),
}).strict().refine(
  (data) => data.image || (data.images && data.images.length > 0),
  { message: 'image または images が必要です' }
);

function getProviderForMode(mode: ExtractMode): 'gemini' | 'openai' {
  switch (mode) {
    case 'idiom':
      return AI_CONFIG.extraction.idioms.provider;
    case 'eiken':
      return AI_CONFIG.extraction.eiken.provider;
    case 'circled':
      return AI_CONFIG.extraction.circled.provider;
    case 'highlighted':
      return AI_CONFIG.extraction.words.provider;
    case 'wrong':
      return AI_CONFIG.extraction.words.provider;
    case 'all':
    default:
      return AI_CONFIG.extraction.words.provider;
  }
}

// API Route: POST /api/extract
// Extracts words from an uploaded image using OpenAI Vision API
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
    const { image, images, mode, eikenLevel } = parsed.data as {
      image?: string;
      images?: string[];
      mode: ExtractMode;
      eikenLevel: EikenLevel;
    };

    // Collect all images for validation (single or multi)
    const allImageStrings = images && images.length > 0 ? images : (image ? [image] : []);

    // Detailed logging for debugging
    const primaryImage = allImageStrings[0];
    const imageLength = primaryImage?.length || 0;
    const hasDataPrefix = primaryImage?.startsWith('data:') || false;
    const dataTypeMatch = primaryImage?.match(/^data:([^;,]+)/);
    const detectedType = dataTypeMatch ? dataTypeMatch[1] : 'unknown';

    console.log('Extract API called:', {
      mode,
      eikenLevel,
      imageCount: allImageStrings.length,
      imageLength,
      hasDataPrefix,
      detectedType,
      first50Chars: primaryImage?.slice(0, 50),
    });

    // Validate each image
    for (const img of allImageStrings) {
      const isValidImage = img.startsWith('data:image/');
      const isValidPdf = img.startsWith('data:application/pdf');

      if (!isValidImage && !isValidPdf) {
        console.error('Invalid file format - not image or PDF', { first100: img.slice(0, 100) });
        return NextResponse.json(
          { success: false, error: 'ファイル形式が不正です。JPEG/PNG形式の画像またはPDFを使用してください。' },
          { status: 400 }
        );
      }

      if (isValidPdf && getProviderForMode(mode) === 'openai') {
        return NextResponse.json(
          {
            success: false,
            error: '現在のサーバー設定ではPDF解析に対応していません。PDFを画像（PNG/JPEG）に変換して再アップロードしてください。',
          },
          { status: 400 }
        );
      }

      if (img.startsWith('data:image/heic') || img.startsWith('data:image/heif')) {
        console.error('Unsupported image format: HEIC/HEIF detected');
        return NextResponse.json(
          { success: false, error: 'HEIC/HEIF形式は対応していません。カメラアプリの設定で「互換性優先」を選択するか、スクリーンショットをお試しください。' },
          { status: 400 }
        );
      }
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
    const openaiApiKey = process.env.OPENAI_API_KEY;
    if (!openaiApiKey) {
      return NextResponse.json(
        { success: false, error: 'OpenAI APIキーが設定されていません' },
        { status: 500 }
      );
    }

    // Use the first image for single-image modes
    const singleImage = allImageStrings[0];

    if (mode === 'wrong') {
      // Wrong answer mode: OCR + analysis for vocabulary test mistakes
      result = await extractWrongAnswersFromImage(singleImage, openaiApiKey);
    } else if (mode === 'idiom') {
      result = await extractIdiomsFromImage(singleImage, openaiApiKey);
    } else if (mode === 'eiken') {
      // EIKEN filter mode
      if (!eikenLevel) {
        return NextResponse.json(
          { success: false, error: '英検レベルを指定してください' },
          { status: 400 }
        );
      }

      result = await extractEikenWordsFromImage(singleImage, openaiApiKey, eikenLevel);
    } else if (mode === 'circled') {
      // Note: eikenLevel is NOT used for circled mode anymore
      result = await extractCircledWordsFromImage(singleImage, openaiApiKey, {}, openaiApiKey);
    } else if (mode === 'highlighted') {
      // Multi-image: send all images in a single API call for unified color calibration
      if (allImageStrings.length > 1) {
        result = await extractHighlightedWordsFromImages(allImageStrings, openaiApiKey, openaiApiKey);
      } else {
        result = await extractHighlightedWordsFromImage(singleImage, openaiApiKey, openaiApiKey);
      }
    } else {
      // Note: eikenLevel is NOT used for 'all' mode anymore (use 'eiken' mode instead)
      // Pro users get example sentences included (determined server-side)
      result = await extractWordsFromImage(singleImage, openaiApiKey, {
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
