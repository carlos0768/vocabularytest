import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@/lib/supabase/route-client';
import { extractGrammarFromImage } from '@/lib/ai';
import type { EikenGrammarLevel } from '@/types';

// API Route: POST /api/grammar
// Extracts grammar patterns from an uploaded image using Gemini (OCR) + GPT (analysis)
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

    const { image, eikenLevel = null } = body as {
      image?: string;
      eikenLevel?: EikenGrammarLevel;
    };

    console.log('Grammar API called:', { eikenLevel, imageLength: image?.length });

    if (!image) {
      return NextResponse.json(
        { success: false, error: '画像が必要です' },
        { status: 400 }
      );
    }

    // ============================================
    // 3. CHECK API KEYS
    // ============================================
    const geminiApiKey = process.env.GOOGLE_AI_API_KEY;
    const openaiApiKey = process.env.OPENAI_API_KEY;

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

    // ============================================
    // 4. CHECK & INCREMENT SCAN COUNT (SERVER-SIDE ENFORCEMENT)
    // ============================================
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
    // 5. EXTRACT GRAMMAR
    // ============================================
    const result = await extractGrammarFromImage(
      image,
      geminiApiKey,
      openaiApiKey,
      eikenLevel
    );

    if (!result.success) {
      console.error('Grammar extraction failed:', result.error);
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 422 }
      );
    }

    // ============================================
    // 6. RETURN SUCCESS RESPONSE
    // ============================================
    return NextResponse.json({
      success: true,
      extractedText: result.extractedText,
      patterns: result.patterns,
      scanInfo: {
        currentCount: scanData.current_count,
        limit: scanData.limit,
        isPro: scanData.is_pro,
      },
    });
  } catch (error) {
    console.error('Grammar API error:', error);
    return NextResponse.json(
      { success: false, error: '予期しないエラーが発生しました' },
      { status: 500 }
    );
  }
}
