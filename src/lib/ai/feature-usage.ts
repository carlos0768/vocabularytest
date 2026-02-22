import type { SupabaseClient } from '@supabase/supabase-js';

export interface FeatureUsageCheckResult {
  allowed: boolean;
  requires_pro: boolean;
  current_count: number;
  limit: number | null;
  is_pro: boolean;
}

type FeatureUsageCheckInput = {
  supabase: SupabaseClient;
  featureKey: string;
  freeDailyLimit: number;
  proDailyLimit: number;
  requirePro?: boolean;
};

export function readBooleanEnv(name: string, defaultValue: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined) return defaultValue;
  const normalized = raw.trim().toLowerCase();
  if (normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on') {
    return true;
  }
  if (normalized === '0' || normalized === 'false' || normalized === 'no' || normalized === 'off') {
    return false;
  }
  return defaultValue;
}

export function readNumberEnv(name: string, defaultValue: number): number {
  const raw = process.env[name];
  if (!raw) return defaultValue;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) return defaultValue;
  return Math.floor(parsed);
}

export function isAiUsageLimitsEnabled(): boolean {
  return readBooleanEnv('ENABLE_AI_USAGE_LIMITS', true);
}

export function normalizeFeatureUsageResult(raw: unknown): FeatureUsageCheckResult {
  const value = raw && typeof raw === 'object'
    ? raw as Record<string, unknown>
    : {};

  return {
    allowed: Boolean(value.allowed),
    requires_pro: Boolean(value.requires_pro),
    current_count: typeof value.current_count === 'number' ? value.current_count : 0,
    limit: typeof value.limit === 'number' ? value.limit : null,
    is_pro: Boolean(value.is_pro),
  };
}

export async function checkAndIncrementFeatureUsage(
  input: FeatureUsageCheckInput
): Promise<FeatureUsageCheckResult> {
  const { data, error } = await input.supabase.rpc('check_and_increment_feature_usage', {
    p_feature_key: input.featureKey,
    p_require_pro: input.requirePro === true,
    p_free_limit: input.freeDailyLimit,
    p_pro_limit: input.proDailyLimit,
  });

  if (error) {
    throw new Error(error.message || 'feature_usage_check_failed');
  }

  return normalizeFeatureUsageResult(data);
}
