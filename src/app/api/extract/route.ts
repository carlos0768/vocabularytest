import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { extractWordsFromImage, extractCircledWordsFromImage } from '@/lib/ai';

// Extraction modes
export type ExtractMode = 'all' | 'circled';

// EIKEN levels (null means no filter)
export type EikenLevel = '5' | '4' | '3' | 'pre2' | '2' | 'pre1' | '1' | null;

// Free tier daily scan limit
const FREE_DAILY_SCAN_LIMIT = 3;

// API Route: POST /api/extract
// Extracts words from an uploaded image using OpenAI Vision API or Gemini API
// SECURITY: Requires authentication, enforces server-side scan limits

export async function POST(request: NextRequest) {
  try {
    // ============================================
    // 1. AUTHENTICATION CHECK
    // ============================================
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      console.log('Auth failed:', authError?.message || 'No user');
      return NextResponse.json(
        { success: false, error: '認証が必要です。ログインしてください。' },
        { status: 401 }
      );
    }

    // ============================================
    // 2. GET SUBSCRIPTION STATUS (SERVER-SIDE VERIFICATION)
    // ============================================
    const { data: subscription, error: subError } = await supabase
      .from('subscriptions')
      .select('status, plan')
      .eq('user_id', user.id)
      .single();

    if (subError) {
      console.error('Subscription fetch error:', subError);
      // If no subscription found, treat as free user
    }

    const isPro = subscription?.status === 'active' && subscription?.plan === 'pro';
    const scanLimit = isPro ? Infinity : FREE_DAILY_SCAN_LIMIT;

    console.log('User:', user.id, 'isPro:', isPro, 'plan:', subscription?.plan);

    // ============================================
    // 3. CHECK & INCREMENT SCAN COUNT (SERVER-SIDE ENFORCEMENT)
    // ============================================
    const today = new Date().toISOString().split('T')[0];

    // Get current scan count for today
    const { data: usageData, error: usageError } = await supabase
      .from('daily_scan_usage')
      .select('scan_count')
      .eq('user_id', user.id)
      .eq('scan_date', today)
      .single();

    let currentCount = 0;
    if (!usageError && usageData) {
      currentCount = usageData.scan_count;
    }

    // Check if limit exceeded (only for non-Pro users)
    if (!isPro && currentCount >= scanLimit) {
      console.log('Scan limit exceeded:', currentCount, '>=', scanLimit);
      return NextResponse.json(
        {
          success: false,
          error: `本日のスキャン上限（${scanLimit}回）に達しました。Proプランにアップグレードすると無制限にスキャンできます。`,
          limitReached: true,
          currentCount,
          limit: scanLimit
        },
        { status: 429 }
      );
    }

    // ============================================
    // 4. PARSE REQUEST BODY
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

    // Note: isPro is now determined server-side, not from client request
    console.log('Extract API called:', { mode, eikenLevel, isPro, imageLength: image?.length });

    if (!image) {
      return NextResponse.json(
        { success: false, error: '画像が必要です' },
        { status: 400 }
      );
    }

    // ============================================
    // 5. PROCESS IMAGE
    // ============================================
    let result;

    if (mode === 'circled') {
      // Use Gemini API for circled word extraction
      const geminiApiKey = process.env.GOOGLE_AI_API_KEY;

      if (!geminiApiKey) {
        return NextResponse.json(
          { success: false, error: 'Gemini APIキーが設定されていません' },
          { status: 500 }
        );
      }

      result = await extractCircledWordsFromImage(image, geminiApiKey, { eikenLevel });
    } else {
      // Default: Use OpenAI API for all word extraction
      const openaiApiKey = process.env.OPENAI_API_KEY;

      if (!openaiApiKey) {
        return NextResponse.json(
          { success: false, error: 'OpenAI APIキーが設定されていません' },
          { status: 500 }
        );
      }

      // Pro users get example sentences included (determined server-side)
      result = await extractWordsFromImage(image, openaiApiKey, {
        includeExamples: isPro,
        eikenLevel,
      });
    }

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 422 }
      );
    }

    // ============================================
    // 6. INCREMENT SCAN COUNT AFTER SUCCESSFUL EXTRACTION
    // ============================================
    if (usageData) {
      // Update existing record
      await supabase
        .from('daily_scan_usage')
        .update({ scan_count: currentCount + 1 })
        .eq('user_id', user.id)
        .eq('scan_date', today);
    } else {
      // Insert new record for today
      await supabase
        .from('daily_scan_usage')
        .insert({ user_id: user.id, scan_date: today, scan_count: 1 });
    }

    console.log('Scan successful. New count:', currentCount + 1);

    // ============================================
    // 7. RETURN SUCCESS RESPONSE
    // ============================================
    return NextResponse.json({
      success: true,
      words: result.data.words,
      scanInfo: {
        currentCount: currentCount + 1,
        limit: isPro ? null : scanLimit,
        isPro
      }
    });
  } catch (error) {
    console.error('Extract API error:', error);
    return NextResponse.json(
      { success: false, error: '予期しないエラーが発生しました' },
      { status: 500 }
    );
  }
}
