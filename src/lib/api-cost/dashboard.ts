import { createClient } from '@supabase/supabase-js';
import { readSingleLineEnv } from '@/lib/env';

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
  metadata?: Record<string, unknown> | null;
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
  const url = readSingleLineEnv('NEXT_PUBLIC_SUPABASE_URL');
  const key = readSingleLineEnv('SUPABASE_SERVICE_ROLE_KEY');

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
  scans: {
    count: number;
    costUsd: number;
    costJpy: number;
    avgCostUsd: number;
    avgCostJpy: number;
    recent: Array<{
      scanId: string;
      source: string | null;
      userId: string | null;
      modes: string[];
      calls: number;
      failedCalls: number;
      totalTokens: number;
      costUsd: number;
      costJpy: number;
      startedAt: string;
      endedAt: string;
    }>;
  };
  recentEvents: ApiCostEventRow[];
};

const RECENT_SCANS_LIMIT = 50;

type ScanAggregate = ApiCostDashboardSummary['scans']['recent'][number];

function readScanMetadata(metadata: Record<string, unknown> | null | undefined): {
  scanId: string | null;
  source: string | null;
  modes: string[];
} {
  if (!metadata || typeof metadata !== 'object') {
    return { scanId: null, source: null, modes: [] };
  }
  const scanId = typeof metadata.scan_id === 'string' && metadata.scan_id.length > 0
    ? metadata.scan_id
    : null;
  const source = typeof metadata.scan_source === 'string' && metadata.scan_source.length > 0
    ? metadata.scan_source
    : null;
  const modes = Array.isArray(metadata.scan_modes)
    ? metadata.scan_modes.filter((mode): mode is string => typeof mode === 'string')
    : [];
  return { scanId, source, modes };
}

export async function getApiCostDashboardSummary(daysInput = 30): Promise<ApiCostDashboardSummary> {
  const days = clampDays(daysInput);
  const supabase = getAdminClient();
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const [{ data: eventsRaw, error: eventsError }, { data: recentRaw, error: recentError }] =
    await Promise.all([
      supabase
        .from('api_cost_events')
        .select(
          'id,user_id,provider,model,operation,endpoint,status,input_tokens,output_tokens,total_tokens,estimated_cost_usd,estimated_cost_jpy,metadata,created_at'
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
  const byScanMap = new Map<string, ScanAggregate>();

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

    const scanMeta = readScanMetadata(event.metadata);
    if (scanMeta.scanId) {
      const scanAgg = byScanMap.get(scanMeta.scanId) ?? {
        scanId: scanMeta.scanId,
        source: scanMeta.source,
        userId: event.user_id,
        modes: scanMeta.modes,
        calls: 0,
        failedCalls: 0,
        totalTokens: 0,
        costUsd: 0,
        costJpy: 0,
        startedAt: event.created_at,
        endedAt: event.created_at,
      };
      scanAgg.calls += 1;
      if (event.status === 'failed') scanAgg.failedCalls += 1;
      scanAgg.totalTokens += tokens;
      scanAgg.costUsd += costUsd;
      scanAgg.costJpy += costJpy;
      if (event.created_at < scanAgg.startedAt) scanAgg.startedAt = event.created_at;
      if (event.created_at > scanAgg.endedAt) scanAgg.endedAt = event.created_at;
      if (!scanAgg.source && scanMeta.source) scanAgg.source = scanMeta.source;
      if (!scanAgg.userId && event.user_id) scanAgg.userId = event.user_id;
      if (scanAgg.modes.length === 0 && scanMeta.modes.length > 0) scanAgg.modes = scanMeta.modes;
      byScanMap.set(scanMeta.scanId, scanAgg);
    }
  }

  const byDay = Array.from(byDayMap.values()).sort((a, b) => a.day.localeCompare(b.day));
  const byModel = Array.from(byModelMap.values()).sort((a, b) => b.costJpy - a.costJpy);

  const allScans = Array.from(byScanMap.values());
  const scanTotals = allScans.reduce(
    (acc, scan) => {
      acc.costUsd += scan.costUsd;
      acc.costJpy += scan.costJpy;
      return acc;
    },
    { costUsd: 0, costJpy: 0 }
  );
  const recentScans = allScans
    .sort((a, b) => b.endedAt.localeCompare(a.endedAt))
    .slice(0, RECENT_SCANS_LIMIT)
    .map((scan) => ({
      ...scan,
      costUsd: Number(scan.costUsd.toFixed(6)),
      costJpy: Number(scan.costJpy.toFixed(4)),
    }));

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
    scans: {
      count: allScans.length,
      costUsd: Number(scanTotals.costUsd.toFixed(6)),
      costJpy: Number(scanTotals.costJpy.toFixed(2)),
      avgCostUsd: allScans.length > 0 ? Number((scanTotals.costUsd / allScans.length).toFixed(6)) : 0,
      avgCostJpy: allScans.length > 0 ? Number((scanTotals.costJpy / allScans.length).toFixed(4)) : 0,
      recent: recentScans,
    },
    recentEvents,
  };
}
