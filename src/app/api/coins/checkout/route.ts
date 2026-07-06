import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { parseJsonWithSchema } from '@/lib/api/validation';
import { createClient } from '@/lib/supabase/server';
import { isActiveProSubscription } from '@/lib/subscription/status';
import { isCoinSystemEnabled } from '@/lib/coins/feature';
import { getCoinPack } from '@/lib/coins/packs';
import { getCoinPurchaseProvider } from '@/lib/coins/purchase-providers';

const requestSchema = z.object({
  packId: z.string().trim().min(1).max(50),
  provider: z.enum(['stripe']).optional().default('stripe'),
}).strict();

// POST /api/coins/checkout
// コインパック購入のCheckoutセッションを作成してリダイレクトURLを返す。
// 冪等性はセッションテーブルではなく claim_webhook_event + 台帳の
// (provider, external_ref) ユニークで担保する（サブスクと違い多重起票が無害なため）。
export async function POST(request: NextRequest) {
  try {
    if (!isCoinSystemEnabled()) {
      return NextResponse.json(
        { success: false, error: 'コイン機能は現在公開していません' },
        { status: 404 },
      );
    }

    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: 'ログインが必要です' },
        { status: 401 }
      );
    }

    // スキャン自体がPro限定のため、Freeユーザーには使い道のないコインを売らない
    const { data: existingSub } = await supabase
      .from('subscriptions')
      .select('status, plan, pro_source, test_pro_expires_at, current_period_end')
      .eq('user_id', user.id)
      .single();

    if (
      !isActiveProSubscription({
        status: existingSub?.status,
        plan: existingSub?.plan,
        proSource: existingSub?.pro_source,
        testProExpiresAt: existingSub?.test_pro_expires_at,
        currentPeriodEnd: existingSub?.current_period_end,
      })
    ) {
      return NextResponse.json(
        { success: false, error: 'コインの購入はProプラン限定です' },
        { status: 403 }
      );
    }

    const parsed = await parseJsonWithSchema(request, requestSchema, {
      invalidMessage: 'リクエストの解析に失敗しました',
    });
    if (!parsed.ok) {
      return parsed.response;
    }

    const pack = getCoinPack(parsed.data.packId);
    if (!pack) {
      return NextResponse.json(
        { success: false, error: '指定されたコインパックが見つかりません' },
        { status: 400 }
      );
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
    const provider = getCoinPurchaseProvider(parsed.data.provider);

    const checkout = await provider.createCheckout({
      userId: user.id,
      userEmail: user.email ?? null,
      pack,
      successUrl: `${baseUrl}/coins/success?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${baseUrl}/coins?cancelled=1`,
    });

    return NextResponse.json({
      success: true,
      checkoutUrl: checkout.redirectUrl,
    });
  } catch (error) {
    console.error('Coin checkout creation error:', error);
    return NextResponse.json(
      { success: false, error: '決済セッションの作成に失敗しました' },
      { status: 500 }
    );
  }
}
