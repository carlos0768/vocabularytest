import type { SupabaseClient } from '@supabase/supabase-js';
import type Stripe from 'stripe';
import { getCoinPack } from './packs';

export function isCoinPackCheckoutSession(session: Stripe.Checkout.Session): boolean {
  return session.mode === 'payment' && session.metadata?.purpose === 'coin_pack';
}

/**
 * コインパック購入の checkout.session.completed 処理。
 * 冪等性は claim_webhook_event（ルート層）+ credit_coin_pack の
 * (provider, external_ref) ユニークインデックス（台帳層）の二段構え。
 */
export async function handleCoinPackCheckoutCompleted(
  supabaseAdmin: SupabaseClient,
  session: Stripe.Checkout.Session,
): Promise<void> {
  if (session.payment_status !== 'paid') {
    console.log('[coins] coin pack session not paid yet, skipping:', {
      sessionId: session.id,
      paymentStatus: session.payment_status,
    });
    return;
  }

  const userId = session.metadata?.user_id;
  if (!userId) {
    throw new Error('No user_id in coin pack session metadata');
  }

  // コイン数は metadata を信用せず、必ずサーバー側のパック定義から解決する。
  const packId = session.metadata?.pack_id ?? '';
  const pack = getCoinPack(packId);
  if (!pack) {
    throw new Error(`Unknown coin pack id in session metadata: ${packId}`);
  }

  const { data, error } = await supabaseAdmin.rpc('credit_coin_pack', {
    p_user_id: userId,
    p_coins: pack.coins,
    p_provider: 'stripe',
    p_external_ref: session.id,
    p_pack_id: pack.id,
  });

  if (error) {
    throw new Error(`credit_coin_pack failed: ${error.message}`);
  }

  const result = data as { credited?: boolean; reason?: string } | null;
  if (result?.credited) {
    console.log('[coins] coin pack credited:', {
      userId,
      packId: pack.id,
      coins: pack.coins,
      sessionId: session.id,
    });
  } else {
    // Webhook再送・confirmとの競合はここに落ちる。成功扱いで冪等。
    console.log('[coins] coin pack credit skipped:', {
      userId,
      packId: pack.id,
      sessionId: session.id,
      reason: result?.reason ?? 'unknown',
    });
  }
}
