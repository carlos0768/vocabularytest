import { createClient } from '@supabase/supabase-js';

type ApiCostEventRow = {
  id: string;
  user_id: string | null;
  provider: string;
  model: string;
  operation: string;
  endpoint: string | null;
  status: string;
  input_tokens: number | null;
  output_tokens: number | null;
  total_tokens: number | null;
  estimated_cost_usd: number | string | null;
  estimated_cost_jpy: number | string | null;
  created_at: string;
};

function toNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error('Supabase environment variables not configured');
  }

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function clampDays(days: number): number {
  if (!Number.isFinite(days)) return 30;
  return Math.max(1, Math.min(365, Math.round(days)));
}

export type ApiCostDashboardSummary = {
  days: number;
  totals: {
    calls: number;
    succeededCalls: number;
    failedCalls: number;
    pricedCalls: number;
    unpricedCalls: number;
    totalTokens: number;
    costUsd: number;
    costJpy: number;
  };
  byDay: Array<{
    day: string;
    calls: number;
    costUsd: number;
    costJpy: number;
    totalTokens: number;
  }>;
  byModel: Array<{
    provider: string;
    model: string;
    calls: number;
    costUsd: number;
    costJpy: number;
    totalTokens: number;
  }>;
  recentEvents: ApiCostEventRow[];
};

export async function getApiCostDashboardSummary(daysInput = 30): Promise<ApiCostDashboardSummary> {
  const days = clampDays(daysInput);
  const supabase = getAdminClient();
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const [{ data: eventsRaw, error: eventsError }, { data: recentRaw, error: recentError }] =
    await Promise.all([
      supabase
        .from('api_cost_events')
        .select(
          'id,user_id,provider,model,operation,endpoint,status,input_tokens,output_tokens,total_tokens,estimated_cost_usd,estimated_cost_jpy,created_at'
        )
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(20000),
      supabase
        .from('api_cost_events')
        .select(
          'id,user_id,provider,model,operation,endpoint,status,input_tokens,output_tokens,total_tokens,estimated_cost_usd,estimated_cost_jpy,created_at'
        )
        .order('created_at', { ascending: false })
        .limit(80),
    ]);

  if (eventsError) {
    throw new Error(eventsError.message);
  }
  if (recentError) {
    throw new Error(recentError.message);
  }

  const events = (eventsRaw ?? []) as ApiCostEventRow[];
  const recentEvents = (recentRaw ?? []) as ApiCostEventRow[];

  const totals = {
    calls: 0,
    succeededCalls: 0,
    failedCalls: 0,
    pricedCalls: 0,
    unpricedCalls: 0,
    totalTokens: 0,
    costUsd: 0,
    costJpy: 0,
  };

  const byDayMap = new Map<string, ApiCostDashboardSummary['byDay'][number]>();
  const byModelMap = new Map<string, ApiCostDashboardSummary['byModel'][number]>();

  for (const event of events) {
    totals.calls += 1;
    if (event.status === 'failed') totals.failedCalls += 1;
    else totals.succeededCalls += 1;

    const costUsd = toNumber(event.estimated_cost_usd);
    const costJpy = toNumber(event.estimated_cost_jpy);
    const tokens = toNumber(event.total_tokens);

    totals.totalTokens += tokens;
    totals.costUsd += costUsd;
    totals.costJpy += costJpy;

    if (costUsd > 0 || costJpy > 0) totals.pricedCalls += 1;
    else totals.unpricedCalls += 1;

    const day = event.created_at.slice(0, 10);
    const dayAgg = byDayMap.get(day) ?? {
      day,
      calls: 0,
      costUsd: 0,
      costJpy: 0,
      totalTokens: 0,
    };
    dayAgg.calls += 1;
    dayAgg.costUsd += costUsd;
    dayAgg.costJpy += costJpy;
    dayAgg.totalTokens += tokens;
    byDayMap.set(day, dayAgg);

    const modelKey = `${event.provider}::${event.model}`;
    const modelAgg = byModelMap.get(modelKey) ?? {
      provider: event.provider,
      model: event.model,
      calls: 0,
      costUsd: 0,
      costJpy: 0,
      totalTokens: 0,
    };
    modelAgg.calls += 1;
    modelAgg.costUsd += costUsd;
    modelAgg.costJpy += costJpy;
    modelAgg.totalTokens += tokens;
    byModelMap.set(modelKey, modelAgg);
  }

  const byDay = Array.from(byDayMap.values()).sort((a, b) => a.day.localeCompare(b.day));
  const byModel = Array.from(byModelMap.values()).sort((a, b) => b.costJpy - a.costJpy);

  return {
    days,
    totals: {
      ...totals,
      costUsd: Number(totals.costUsd.toFixed(6)),
      costJpy: Number(totals.costJpy.toFixed(2)),
    },
    byDay: byDay.map((item) => ({
      ...item,
      costUsd: Number(item.costUsd.toFixed(6)),
      costJpy: Number(item.costJpy.toFixed(2)),
    })),
    byModel: byModel.map((item) => ({
      ...item,
      costUsd: Number(item.costUsd.toFixed(6)),
      costJpy: Number(item.costJpy.toFixed(2)),
    })),
    recentEvents,
  };
}
