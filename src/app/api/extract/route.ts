import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@/lib/supabase/route-client';
import { extractWordsFromImage, extractCircledWordsFromImage, extractHighlightedWordsFromImage, extractEikenWordsFromImage, extractIdiomsFromImage, extractWrongAnswersFromImage } from '@/lib/ai';
import { AI_CONFIG, getAPIKeys, type AIProvider } from '@/lib/ai/config';
import { isCloudRunConfigured } from '@/lib/ai/providers';
import { z } from 'zod';
import { parseJsonWithSchema } from '@/lib/api/validation';
import { ensureSourceLabels } from '../../../../shared/source-labels';

// Extraction modes
// - 'all': Extract all words
// - 'circled': Extract hand-circled words only
// - 'highlighted': Extract highlighted/marker words only
// - 'eiken': Extract words filtered by EIKEN level
// - 'idiom': Extract idioms and phrases only
// - 'wrong': Extract only incorrectly answered words from vocabulary tests
export type ExtractMode = 'all' | 'circled' | 'highlighted' | 'eiken' | 'idiom' | 'wrong';

// EIKEN levels (null means no filter, required for 'eiken' mode)
export type EikenLevel = '5' | '4' | '3' | 'pre2' | '2' | 'pre1' | '1' | null;

const requestSchema = z.object({
  image: z.string().min(1).max(15_000_000),
  mode: z.enum(['all', 'circled', 'highlighted', 'eiken', 'idiom', 'wrong']).optional().default('all'),
  eikenLevel: z.enum(['5', '4', '3', 'pre2', '2', 'pre1', '1']).nullable().optional().default(null),
}).strict();

function getProvidersForMode(mode: ExtractMode): AIProvider[] {
  switch (mode) {
    case 'idiom':
      return [AI_CONFIG.extraction.idioms.provider];
    case 'eiken':
      return [AI_CONFIG.extraction.eiken.provider];
    case 'circled':
      return [AI_CONFIG.extraction.circled.provider];
    case 'highlighted':
      return [AI_CONFIG.extraction.highlighted.provider];
    case 'wrong':
      return [AI_CONFIG.extraction.grammar.ocr.provider, AI_CONFIG.extraction.grammar.analysis.provider];
    case 'all':
    default:
      return [AI_CONFIG.extraction.words.provider];
  }
}

function getMissingProviderKey(mode: ExtractMode, apiKeys: { gemini?: string; openai?: string }): AIProvider | null {
  if (isCloudRunConfigured()) return null;

  const requiredProviders = new Set(getProvidersForMode(mode));
  for (const provider of requiredProviders) {
    if (!apiKeys[provider]) {
      return provider;
    }
  }

  return null;
}

export const __internal = {
  getProvidersForMode,
  getMissingProviderKey,
};

// API Route: POST /api/extract
// Extracts words from an uploaded image using configured AI provider
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

    // OpenAI image endpoint does not accept PDF data URLs.
    // Return a clear message instead of surfacing a vague provider error.
    if (isValidPdf && getProvidersForMode(mode).includes('openai')) {
      return NextResponse.json(
        {
          success: false,
          error: '現在のサーバー設定ではPDF解析に対応していません。PDFを画像（PNG/JPEG）に変換して再アップロードしてください。',
        },
        { status: 400 }
      );
    }

    // Reject unsupported image formats (HEIC/HEIF are not supported by the extraction path)
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
    const apiKeys = getAPIKeys();
    const missingProviderKey = getMissingProviderKey(mode, apiKeys);
    if (missingProviderKey) {
      const providerLabel = missingProviderKey === 'gemini' ? 'Google AI' : 'OpenAI';
      return NextResponse.json(
        { success: false, error: `${providerLabel} APIキーが設定されていません` },
        { status: 500 }
      );
    }

    let result;
    if (mode === 'wrong') {
      // Wrong answer mode: OCR + analysis for vocabulary test mistakes
      result = await extractWrongAnswersFromImage(image, apiKeys);
    } else if (mode === 'idiom') {
      result = await extractIdiomsFromImage(image, apiKeys);
    } else if (mode === 'eiken') {
      // EIKEN filter mode
      if (!eikenLevel) {
        return NextResponse.json(
          { success: false, error: '英検レベルを指定してください' },
          { status: 400 }
        );
      }

      result = await extractEikenWordsFromImage(image, apiKeys, eikenLevel);
    } else if (mode === 'circled') {
      // Note: eikenLevel is NOT used for circled mode anymore
      result = await extractCircledWordsFromImage(image, apiKeys, {});
    } else if (mode === 'highlighted') {
      result = await extractHighlightedWordsFromImage(image, apiKeys);
    } else {
      // Note: eikenLevel is NOT used for 'all' mode anymore (use 'eiken' mode instead)
      // Examples are generated in prefill flow to avoid duplicate AI generation costs.
      result = await extractWordsFromImage(image, apiKeys, {
        includeExamples: false,
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
      sourceLabels: ensureSourceLabels(result.data.sourceLabels),
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
