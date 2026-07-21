// 財務ダッシュボード(/ops/finance)の月次集計。
//
// 集計方針:
// - 売上(サブスク): Stripeの支払済み請求書(invoice)実績をAPIから取得。
//   Stripeに到達できない場合は当月のみ「アクティブ課金会員数 × 月額」で推定し、
//   過去月は unavailable とする(webhookハンドラは変更しない)。
// - 売上(コインパック): coin_transactions の pack_purchase を月次RPCで集計し、
//   pack_id → 価格表(src/lib/coins/packs.ts)で円換算。
// - 変動費(AI原価): api_cost_events の記録済み推定コストを月次RPCで集計。
// - 変動費(決済手数料): Stripe経由売上 × STRIPE_FEE_RATE の試算値。
// - 固定費: finance_fixed_costs を月割按分(fixed-costs.ts)。
//
// buildFinanceSummary は純粋関数として分離しユニットテスト対象とする。

import { STRIPE_CONFIG } from '@/lib/stripe/config';
import { getCoinPack } from '@/lib/coins/packs';
import { listPaidInvoicesSince, listSucceededRefundsSince } from '@/lib/stripe/client';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import {
  fixedCostRowToDomain,
  monthlyAmountJpy,
  type FixedCost,
  type FixedCostCategory,
} from './fixed-costs';
import {
  daysInJstMonth,
  jstDayOfMonth,
  jstMonthKey,
  jstMonthStartUtc,
  lastJstMonthKeys,
} from './months';

// Stripe標準手数料(国内カード3.6%)による試算。実額はStripeダッシュボード参照。
export const STRIPE_FEE_RATE = 0.036;

export type SubscriptionRevenueSource = 'stripe' | 'estimate' | 'unavailable';

export type FinanceMonthlyRow = {
  monthKey: string;
  revenue: {
    subscriptionJpy: number;
    subscriptionSource: SubscriptionRevenueSource;
    coinPackJpy: number;
    grossJpy: number;
    refundJpy: number;
    netJpy: number;
  };
  costs: {
    aiJpy: number;
    aiCalls: number;
    aiFailedCalls: number;
    aiTokens: number;
    paymentFeeJpy: number;
    fixedJpy: number;
    fixedByCategory: Partial<Record<FixedCostCategory, number>>;
    totalJpy: number;
  };
  profit: {
    marginalJpy: number;
    marginalRate: number | null;
    operatingJpy: number;
    operatingRate: number | null;
  };
};

export type FinanceKpis = {
  mrr: {
    billingJpy: number;
    appstoreJpy: number;
    totalJpy: number;
  };
  members: {
    activeProBilling: number;
    activeProAppstore: number;
    activeProTest: number;
    pastDue: number;
    pendingCancellations: number;
  };
  arppuJpy: number | null;
  currentMonthAiForecastJpy: number | null;
  breakeven: {
    monthlyFixedJpy: number;
    contributionPerMemberJpy: number;
    requiredProMembers: number | null;
  };
};

export type FinanceDashboardSummary = {
  months: number;
  monthKeys: string[];
  currentMonthKey: string;
  generatedAt: string;
  assumptions: {
    proPriceJpy: number;
    stripeFeeRate: number;
  };
  kpis: FinanceKpis;
  monthly: FinanceMonthlyRow[];
  totals: {
    revenueNetJpy: number;
    aiJpy: number;
    paymentFeeJpy: number;
    fixedJpy: number;
    operatingJpy: number;
  };
  aiBreakdown: Array<{
    provider: string;
    model: string;
    calls: number;
    totalTokens: number;
    costJpy: number;
  }>;
  coinPackSummary: Array<{
    packId: string;
    name: string;
    unitPriceJpy: number;
    purchases: number;
    coins: number;
    revenueJpy: number;
  }>;
  warnings: string[];
};

export type FinanceSummaryInputs = {
  monthKeys: string[];
  now: Date;
  aiMonthly: Array<{
    monthKey: string;
    calls: number;
    failedCalls: number;
    totalTokens: number;
    costJpy: number;
  }>;
  aiBreakdown: FinanceDashboardSummary['aiBreakdown'];
  coinSales: Array<{
    monthKey: string;
    packId: string | null;
    purchases: number;
    coins: number;
  }>;
  stripeInvoices: {
    ok: boolean;
    byMonthJpy: Record<string, number>;
  };
  refunds: {
    ok: boolean;
    byMonthJpy: Record<string, number>;
  };
  fixedCosts: FixedCost[];
  members: FinanceKpis['members'];
  warnings: string[];
};

function round2(value: number): number {
  return Number(value.toFixed(2));
}

function rate(numerator: number, denominator: number): number | null {
  if (denominator === 0) return null;
  return Number((numerator / denominator).toFixed(4));
}

export function buildFinanceSummary(inputs: FinanceSummaryInputs): FinanceDashboardSummary {
  const { monthKeys, now, fixedCosts, members } = inputs;
  const currentMonthKey = jstMonthKey(now);
  const proPriceJpy = STRIPE_CONFIG.plans.pro.price;

  const aiByMonth = new Map(inputs.aiMonthly.map((row) => [row.monthKey, row]));

  const coinByMonthJpy = new Map<string, number>();
  const coinPackAgg = new Map<string, { purchases: number; coins: number; revenueJpy: number }>();
  for (const sale of inputs.coinSales) {
    const pack = sale.packId ? getCoinPack(sale.packId) : null;
    const revenue = (pack?.price ?? 0) * sale.purchases;
    coinByMonthJpy.set(sale.monthKey, (coinByMonthJpy.get(sale.monthKey) ?? 0) + revenue);
    const key = sale.packId ?? 'unknown';
    const agg = coinPackAgg.get(key) ?? { purchases: 0, coins: 0, revenueJpy: 0 };
    agg.purchases += sale.purchases;
    agg.coins += sale.coins;
    agg.revenueJpy += revenue;
    coinPackAgg.set(key, agg);
  }

  const monthly: FinanceMonthlyRow[] = monthKeys.map((monthKey) => {
    const ai = aiByMonth.get(monthKey);
    const aiJpy = ai?.costJpy ?? 0;

    let subscriptionJpy = 0;
    let subscriptionSource: SubscriptionRevenueSource;
    if (inputs.stripeInvoices.ok) {
      subscriptionJpy = inputs.stripeInvoices.byMonthJpy[monthKey] ?? 0;
      subscriptionSource = 'stripe';
    } else if (monthKey === currentMonthKey) {
      subscriptionJpy = members.activeProBilling * proPriceJpy;
      subscriptionSource = 'estimate';
    } else {
      subscriptionSource = 'unavailable';
    }

    const coinPackJpy = coinByMonthJpy.get(monthKey) ?? 0;
    const grossJpy = subscriptionJpy + coinPackJpy;
    const refundJpy = inputs.refunds.ok ? (inputs.refunds.byMonthJpy[monthKey] ?? 0) : 0;
    const netJpy = grossJpy - refundJpy;

    const paymentFeeJpy = round2(grossJpy * STRIPE_FEE_RATE);

    const fixedByCategory: Partial<Record<FixedCostCategory, number>> = {};
    let fixedJpy = 0;
    for (const cost of fixedCosts) {
      const amount = monthlyAmountJpy(cost, monthKey);
      if (amount <= 0) continue;
      fixedJpy += amount;
      fixedByCategory[cost.category] = (fixedByCategory[cost.category] ?? 0) + amount;
    }
    fixedJpy = round2(fixedJpy);
    for (const key of Object.keys(fixedByCategory) as FixedCostCategory[]) {
      fixedByCategory[key] = round2(fixedByCategory[key] ?? 0);
    }

    const marginalJpy = round2(netJpy - aiJpy - paymentFeeJpy);
    const operatingJpy = round2(marginalJpy - fixedJpy);

    return {
      monthKey,
      revenue: {
        subscriptionJpy: round2(subscriptionJpy),
        subscriptionSource,
        coinPackJpy: round2(coinPackJpy),
        grossJpy: round2(grossJpy),
        refundJpy: round2(refundJpy),
        netJpy: round2(netJpy),
      },
      costs: {
        aiJpy: round2(aiJpy),
        aiCalls: ai?.calls ?? 0,
        aiFailedCalls: ai?.failedCalls ?? 0,
        aiTokens: ai?.totalTokens ?? 0,
        paymentFeeJpy,
        fixedJpy,
        fixedByCategory,
        totalJpy: round2(aiJpy + paymentFeeJpy + fixedJpy),
      },
      profit: {
        marginalJpy,
        marginalRate: rate(marginalJpy, netJpy),
        operatingJpy,
        operatingRate: rate(operatingJpy, netJpy),
      },
    };
  });

  const totals = monthly.reduce(
    (acc, row) => {
      acc.revenueNetJpy += row.revenue.netJpy;
      acc.aiJpy += row.costs.aiJpy;
      acc.paymentFeeJpy += row.costs.paymentFeeJpy;
      acc.fixedJpy += row.costs.fixedJpy;
      acc.operatingJpy += row.profit.operatingJpy;
      return acc;
    },
    { revenueNetJpy: 0, aiJpy: 0, paymentFeeJpy: 0, fixedJpy: 0, operatingJpy: 0 }
  );

  const currentRow = monthly.find((row) => row.monthKey === currentMonthKey) ?? null;
  const payingMembers = members.activeProBilling + members.activeProAppstore;

  // 当月AIコストの日割りペース予測(JST)
  let currentMonthAiForecastJpy: number | null = null;
  if (currentRow) {
    const elapsedDays = jstDayOfMonth(now);
    if (elapsedDays > 0) {
      currentMonthAiForecastJpy = round2(
        (currentRow.costs.aiJpy / elapsedDays) * daysInJstMonth(currentMonthKey)
      );
    }
  }

  // 損益分岐点: 1会員あたり貢献利益 = 月額×(1-手数料率) − 当月AI原価/有料会員数
  const monthlyFixedJpy = currentRow?.costs.fixedJpy ?? 0;
  const aiVariablePerMemberJpy =
    payingMembers > 0 && currentRow ? currentRow.costs.aiJpy / payingMembers : 0;
  const contributionPerMemberJpy = round2(
    proPriceJpy * (1 - STRIPE_FEE_RATE) - aiVariablePerMemberJpy
  );
  const requiredProMembers =
    contributionPerMemberJpy > 0 ? Math.ceil(monthlyFixedJpy / contributionPerMemberJpy) : null;

  const arppuJpy =
    payingMembers > 0 && currentRow ? round2(currentRow.revenue.netJpy / payingMembers) : null;

  const coinPackSummary = Array.from(coinPackAgg.entries())
    .map(([packId, agg]) => {
      const pack = getCoinPack(packId);
      return {
        packId,
        name: pack?.name ?? packId,
        unitPriceJpy: pack?.price ?? 0,
        purchases: agg.purchases,
        coins: agg.coins,
        revenueJpy: round2(agg.revenueJpy),
      };
    })
    .sort((a, b) => b.revenueJpy - a.revenueJpy);

  return {
    months: monthKeys.length,
    monthKeys,
    currentMonthKey,
    generatedAt: now.toISOString(),
    assumptions: {
      proPriceJpy,
      stripeFeeRate: STRIPE_FEE_RATE,
    },
    kpis: {
      mrr: {
        billingJpy: members.activeProBilling * proPriceJpy,
        appstoreJpy: members.activeProAppstore * proPriceJpy,
        totalJpy: payingMembers * proPriceJpy,
      },
      members,
      arppuJpy,
      currentMonthAiForecastJpy,
      breakeven: {
        monthlyFixedJpy,
        contributionPerMemberJpy,
        requiredProMembers,
      },
    },
    monthly,
    totals: {
      revenueNetJpy: round2(totals.revenueNetJpy),
      aiJpy: round2(totals.aiJpy),
      paymentFeeJpy: round2(totals.paymentFeeJpy),
      fixedJpy: round2(totals.fixedJpy),
      operatingJpy: round2(totals.operatingJpy),
    },
    aiBreakdown: inputs.aiBreakdown,
    coinPackSummary,
    warnings: inputs.warnings,
  };
}

// ============================================
// データ取得
// ============================================

function toNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function isMissingRelationError(message: string, name: string): boolean {
  return message.includes(name) && (message.includes('does not exist') || message.includes('Could not find'));
}

async function fetchMemberCounts(): Promise<FinanceKpis['members']> {
  const supabase = getSupabaseAdmin();

  const countActive = (source: 'billing' | 'appstore' | 'test') =>
    supabase
      .from('subscriptions')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'active')
      .eq('plan', 'pro')
      .eq('pro_source', source);

  const [billing, appstore, test, pastDue, pendingCancel] = await Promise.all([
    countActive('billing'),
    countActive('appstore'),
    countActive('test'),
    supabase
      .from('subscriptions')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'past_due'),
    supabase
      .from('subscriptions')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'active')
      .eq('cancel_at_period_end', true),
  ]);

  for (const result of [billing, appstore, test, pastDue, pendingCancel]) {
    if (result.error) throw new Error(result.error.message);
  }

  return {
    activeProBilling: billing.count ?? 0,
    activeProAppstore: appstore.count ?? 0,
    activeProTest: test.count ?? 0,
    pastDue: pastDue.count ?? 0,
    pendingCancellations: pendingCancel.count ?? 0,
  };
}

export async function getFinanceDashboardSummary(
  monthsInput = 6,
  now: Date = new Date()
): Promise<FinanceDashboardSummary> {
  const months = Math.max(1, Math.min(12, Math.round(monthsInput)));
  const monthKeys = lastJstMonthKeys(months, now);
  const fromDate = jstMonthStartUtc(monthKeys[0]);
  const fromIso = fromDate.toISOString();
  const fromUnix = Math.floor(fromDate.getTime() / 1000);

  const supabase = getSupabaseAdmin();
  const warnings: string[] = [];

  const [aiMonthlyResult, aiBreakdownResult, coinSalesResult, fixedCostsResult, members, stripeResult, refundsResult] =
    await Promise.all([
      supabase.rpc('finance_monthly_ai_costs', { p_from: fromIso }),
      supabase.rpc('finance_ai_cost_breakdown', { p_from: fromIso }),
      supabase.rpc('finance_monthly_coin_pack_sales', { p_from: fromIso }),
      supabase
        .from('finance_fixed_costs')
        .select('*')
        .order('category')
        .order('name'),
      fetchMemberCounts(),
      fetchStripeSubscriptionRevenue(fromUnix, warnings),
      fetchStripeRefunds(fromUnix, warnings),
    ]);

  let aiMonthly: FinanceSummaryInputs['aiMonthly'] = [];
  if (aiMonthlyResult.error) {
    if (isMissingRelationError(aiMonthlyResult.error.message, 'finance_monthly_ai_costs')) {
      warnings.push('ai_rpc_missing');
    } else {
      throw new Error(aiMonthlyResult.error.message);
    }
  } else {
    aiMonthly = ((aiMonthlyResult.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
      monthKey: String(row.month_key ?? ''),
      calls: toNumber(row.calls),
      failedCalls: toNumber(row.failed_calls),
      totalTokens: toNumber(row.total_tokens),
      costJpy: toNumber(row.cost_jpy),
    }));
  }

  let aiBreakdown: FinanceDashboardSummary['aiBreakdown'] = [];
  if (!aiBreakdownResult.error) {
    aiBreakdown = ((aiBreakdownResult.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
      provider: String(row.provider ?? ''),
      model: String(row.model ?? ''),
      calls: toNumber(row.calls),
      totalTokens: toNumber(row.total_tokens),
      costJpy: toNumber(row.cost_jpy),
    }));
  }

  let coinSales: FinanceSummaryInputs['coinSales'] = [];
  if (coinSalesResult.error) {
    if (isMissingRelationError(coinSalesResult.error.message, 'finance_monthly_coin_pack_sales')) {
      warnings.push('coin_rpc_missing');
    } else {
      throw new Error(coinSalesResult.error.message);
    }
  } else {
    coinSales = ((coinSalesResult.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
      monthKey: String(row.month_key ?? ''),
      packId: row.pack_id == null ? null : String(row.pack_id),
      purchases: toNumber(row.purchases),
      coins: toNumber(row.coins),
    }));
  }

  let fixedCosts: FixedCost[] = [];
  if (fixedCostsResult.error) {
    if (isMissingRelationError(fixedCostsResult.error.message, 'finance_fixed_costs')) {
      warnings.push('fixed_costs_table_missing');
    } else {
      throw new Error(fixedCostsResult.error.message);
    }
  } else {
    fixedCosts = (fixedCostsResult.data ?? []).map(fixedCostRowToDomain);
  }

  return buildFinanceSummary({
    monthKeys,
    now,
    aiMonthly,
    aiBreakdown,
    coinSales,
    stripeInvoices: stripeResult,
    refunds: refundsResult,
    fixedCosts,
    members,
    warnings,
  });
}

async function fetchStripeSubscriptionRevenue(
  fromUnix: number,
  warnings: string[]
): Promise<FinanceSummaryInputs['stripeInvoices']> {
  try {
    const invoices = await listPaidInvoicesSince(fromUnix);
    const byMonthJpy: Record<string, number> = {};
    for (const invoice of invoices) {
      if (invoice.currency !== 'jpy') {
        warnings.push('stripe_non_jpy_invoice_skipped');
        continue;
      }
      const paidAtSec = invoice.status_transitions?.paid_at ?? invoice.created;
      const monthKey = jstMonthKey(new Date(paidAtSec * 1000));
      byMonthJpy[monthKey] = (byMonthJpy[monthKey] ?? 0) + invoice.amount_paid;
    }
    return { ok: true, byMonthJpy };
  } catch (error) {
    console.error('[Finance] failed to fetch Stripe invoices:', error);
    warnings.push('stripe_unavailable');
    return { ok: false, byMonthJpy: {} };
  }
}

async function fetchStripeRefunds(
  fromUnix: number,
  warnings: string[]
): Promise<FinanceSummaryInputs['refunds']> {
  try {
    const refunds = await listSucceededRefundsSince(fromUnix);
    const byMonthJpy: Record<string, number> = {};
    for (const refund of refunds) {
      if (refund.currency !== 'jpy') continue;
      const monthKey = jstMonthKey(new Date(refund.created * 1000));
      byMonthJpy[monthKey] = (byMonthJpy[monthKey] ?? 0) + refund.amount;
    }
    return { ok: true, byMonthJpy };
  } catch (error) {
    console.error('[Finance] failed to fetch Stripe refunds:', error);
    warnings.push('stripe_refunds_unavailable');
    return { ok: false, byMonthJpy: {} };
  }
}
