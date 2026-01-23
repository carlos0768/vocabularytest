import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createSubscriptionSession, KOMOJU_CONFIG } from '@/lib/komoju';

// POST /api/subscription/create
// Creates a KOMOJU subscription session and returns the payment URL
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: 'ログインが必要です' },
        { status: 401 }
      );
    }

    // Check if user already has active subscription
    const { data: existingSub } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (existingSub?.status === 'active') {
      return NextResponse.json(
        { success: false, error: '既にProプランに加入しています' },
        { status: 400 }
      );
    }

    // Create subscription session
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;

    const session = await createSubscriptionSession({
      planId: 'pro_monthly',
      customerEmail: user.email!,
      returnUrl: `${baseUrl}/subscription/success?session_id={SESSION_ID}`,
      cancelUrl: `${baseUrl}/subscription/cancel`,
      metadata: {
        user_id: user.id,
        plan: 'pro',
      },
    });

    return NextResponse.json({
      success: true,
      sessionId: session.id,
      paymentUrl: session.session_url,
    });
  } catch (error) {
    console.error('Subscription creation error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '決済セッションの作成に失敗しました',
      },
      { status: 500 }
    );
  }
}
