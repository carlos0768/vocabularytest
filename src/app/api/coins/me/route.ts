import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isCoinSystemEnabled } from '@/lib/coins/feature';
import {
  EXTRA_IMAGE_COIN_COST,
  MONTHLY_COIN_ALLOWANCE,
  SCAN_MODE_COIN_RATES,
} from '@/lib/coins/rates';
import { getCoinPacks } from '@/lib/coins/packs';

// GET /api/coins/me
// コイン残高・消費レート・パック一覧のスナップショット。
// クライアントはこのレスポンスの enabled でコイン制のオン/オフを知る
// （COIN_SYSTEM_ENABLED はサーバー専用envのため）。
export async function GET() {
  try {
    if (!isCoinSystemEnabled()) {
      return NextResponse.json({ enabled: false });
    }

    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: 'ログインが必要です' },
        { status: 401 }
      );
    }

    const { data, error } = await supabase.rpc('get_coin_balance');

    if (error || !data) {
      console.error('[coins] get_coin_balance failed:', error);
      return NextResponse.json(
        { success: false, error: 'コイン残高の取得に失敗しました' },
        { status: 500 }
      );
    }

    const balance = data as {
      is_pro: boolean;
      monthly_remaining: number;
      purchased_remaining: number;
      total_remaining: number;
      monthly_allowance: number;
      month_key: string;
    };

    return NextResponse.json({
      enabled: true,
      isPro: balance.is_pro,
      balance: {
        monthlyRemaining: balance.monthly_remaining,
        purchasedRemaining: balance.purchased_remaining,
        totalRemaining: balance.total_remaining,
      },
      monthlyAllowance: balance.monthly_allowance ?? MONTHLY_COIN_ALLOWANCE,
      monthKey: balance.month_key,
      rates: {
        modes: SCAN_MODE_COIN_RATES,
        extraImageCost: EXTRA_IMAGE_COIN_COST,
      },
      packs: getCoinPacks().map(({ id, name, coins, price }) => ({ id, name, coins, price })),
    });
  } catch (error) {
    console.error('Coins me API error:', error);
    return NextResponse.json(
      { success: false, error: 'コイン残高の取得に失敗しました' },
      { status: 500 }
    );
  }
}
