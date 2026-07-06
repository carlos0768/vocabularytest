import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { getCheckoutSession } from '@/lib/stripe/client';
import { isCoinSystemEnabled } from '@/lib/coins/feature';
import { getCoinPack } from '@/lib/coins/packs';

// GET /api/coins/checkout/confirm?session_id=cs_...
// 購入成功ページからの即時反映用。Webhookと競合しても
// credit_coin_pack の (provider, external_ref) ユニークで二重加算されない。
export async function GET(request: NextRequest) {
  try {
    if (!isCoinSystemEnabled()) {
      return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
    }

    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: 'ログインが必要です' },
        { status: 401 }
      );
    }

    const sessionId = request.nextUrl.searchParams.get('session_id')?.trim();
    if (!sessionId || !sessionId.startsWith('cs_')) {
      return NextResponse.json(
        { success: false, error: 'session_id が不正です' },
        { status: 400 }
      );
    }

    const session = await getCheckoutSession(sessionId);

    if (session.metadata?.purpose !== 'coin_pack') {
      return NextResponse.json(
        { success: false, error: '対象外のセッションです' },
        { status: 400 }
      );
    }

    // 他人のセッションIDを渡して加算させる攻撃を防ぐ
    if (session.metadata?.user_id !== user.id) {
      return NextResponse.json(
        { success: false, error: '対象外のセッションです' },
        { status: 403 }
      );
    }

    if (session.payment_status !== 'paid') {
      return NextResponse.json({ success: true, credited: false, pending: true });
    }

    const pack = getCoinPack(session.metadata?.pack_id ?? '');
    if (!pack) {
      return NextResponse.json(
        { success: false, error: 'コインパックを特定できませんでした' },
        { status: 400 }
      );
    }

    const { data, error } = await getSupabaseAdmin().rpc('credit_coin_pack', {
      p_user_id: user.id,
      p_coins: pack.coins,
      p_provider: 'stripe',
      p_external_ref: session.id,
      p_pack_id: pack.id,
    });

    if (error) {
      console.error('[coins] confirm credit failed:', error);
      return NextResponse.json(
        { success: false, error: 'コインの反映に失敗しました' },
        { status: 500 }
      );
    }

    const result = data as { credited?: boolean; reason?: string } | null;
    return NextResponse.json({
      success: true,
      credited: Boolean(result?.credited),
      // duplicate = Webhook側で反映済み。クライアントは成功として扱ってよい
      alreadyCredited: result?.reason === 'duplicate',
    });
  } catch (error) {
    console.error('Coin checkout confirm error:', error);
    return NextResponse.json(
      { success: false, error: 'コインの反映に失敗しました' },
      { status: 500 }
    );
  }
}
