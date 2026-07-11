import type { CostCalculationMode, CostResult, NormalizedUsage } from './types.js';

/**
 * Bump this whenever MODEL_PRICES changes so audit logs/Firestore docs can
 * be correlated to the price table version that produced them.
 */
export const PRICING_VERSION = '2026-07-11.1';

interface ModelPriceEntry {
  provider: 'openai' | 'gemini';
  matchedModelLabel: string;
  inputPerMillionUsd: number;
  outputPerMillionUsd: number;
  cachedInputPerMillionUsd?: number;
  thinkingPerMillionUsd?: number;
  match: (model: string) => boolean;
}

function prefix(name: string): (model: string) => boolean {
  return (model: string) => model.startsWith(name);
}

// Approximate USD list prices per 1M tokens (see docs/ops/gcp-budget-guard-runbook.md
// for the operational caveat: this is an estimate, not a 1:1 invoice match).
// Order matters: more specific prefixes (e.g. gpt-4o-mini) must come before
// their more general counterparts (gpt-4o) so the specific entry wins.
const MODEL_PRICES: ModelPriceEntry[] = [
  {
    provider: 'gemini',
    matchedModelLabel: 'gemini-2.5-flash',
    inputPerMillionUsd: 0.3,
    outputPerMillionUsd: 2.5,
    cachedInputPerMillionUsd: 0.075,
    thinkingPerMillionUsd: 2.5,
    match: prefix('gemini-2.5-flash'),
  },
  {
    provider: 'gemini',
    matchedModelLabel: 'gemini-2.5-pro',
    inputPerMillionUsd: 1.25,
    outputPerMillionUsd: 10.0,
    cachedInputPerMillionUsd: 0.31,
    thinkingPerMillionUsd: 10.0,
    match: prefix('gemini-2.5-pro'),
  },
  {
    provider: 'gemini',
    matchedModelLabel: 'gemini-1.5-pro-002',
    inputPerMillionUsd: 1.25,
    outputPerMillionUsd: 5.0,
    cachedInputPerMillionUsd: 0.3125,
    match: prefix('gemini-1.5-pro'),
  },
  {
    provider: 'openai',
    matchedModelLabel: 'gpt-4o-mini',
    inputPerMillionUsd: 0.15,
    outputPerMillionUsd: 0.6,
    cachedInputPerMillionUsd: 0.075,
    match: prefix('gpt-4o-mini'),
  },
  {
    provider: 'openai',
    matchedModelLabel: 'gpt-4o',
    inputPerMillionUsd: 2.5,
    outputPerMillionUsd: 10.0,
    cachedInputPerMillionUsd: 1.25,
    match: prefix('gpt-4o'),
  },
];

export function findModelPrice(provider: 'openai' | 'gemini', model: string): ModelPriceEntry | undefined {
  const normalized = (model || '').trim().toLowerCase();
  return MODEL_PRICES.find((entry) => entry.provider === provider && entry.match(normalized));
}

export interface PricingEnvConfig {
  usdToJpyRate: number;
  flatFallbackUsd: number;
}

// D1: exchange rate is configurable per environment rather than hardcoded.
const DEFAULT_USD_TO_JPY_RATE = 155;
// D2: default to a high-side flat estimate rather than blocking the model outright.
// Used only when the model itself has no price table entry (no rates to scale from).
const DEFAULT_FLAT_FALLBACK_USD = 0.05;

// Generous token assumptions (well above a typical single scan-extraction request)
// used to build a model-specific flat estimate when a *priced* model returns no
// usage at all. Scaling by the model's real rates keeps cheap and expensive models
// from sharing one flat number (FR5: "model specific flat fallback").
const CONSERVATIVE_FALLBACK_INPUT_TOKENS = 2000;
const CONSERVATIVE_FALLBACK_OUTPUT_TOKENS = 1500;

function parsePositiveFloat(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function loadPricingEnvConfig(env: NodeJS.ProcessEnv): PricingEnvConfig {
  return {
    usdToJpyRate: parsePositiveFloat(env.GATEWAY_USD_TO_JPY_RATE, DEFAULT_USD_TO_JPY_RATE),
    flatFallbackUsd: parsePositiveFloat(env.GATEWAY_FLAT_FALLBACK_USD, DEFAULT_FLAT_FALLBACK_USD),
  };
}

function tokenCost(tokens: number | undefined, ratePerMillion: number | undefined): number {
  if (!tokens || !ratePerMillion) return 0;
  return (tokens / 1_000_000) * ratePerMillion;
}

function roundResult(
  usd: number,
  usdToJpyRate: number,
  mode: CostCalculationMode,
  matchedModel: string | undefined,
): CostResult {
  const estimatedCostUsd = Math.round(usd * 1_000_000) / 1_000_000;
  // Round up: an estimate that undercounts the daily guard defeats its purpose (NFR3).
  const estimatedCostJpy = Math.ceil(estimatedCostUsd * usdToJpyRate);
  return {
    estimatedCostUsd,
    estimatedCostJpy,
    pricingVersion: PRICING_VERSION,
    pricingMatchedModel: matchedModel,
    costCalculationMode: mode,
  };
}

/**
 * Calculates an estimated cost from normalized usage and the price table.
 * Missing usage is never treated as free (FR5): unpriced models and calls
 * with no usage at all fall back to a conservative flat estimate.
 */
export function calculateEstimatedCost(usage: NormalizedUsage, config: PricingEnvConfig): CostResult {
  const price = findModelPrice(usage.provider, usage.model);

  if (!price) {
    return roundResult(config.flatFallbackUsd, config.usdToJpyRate, 'flat_fallback', undefined);
  }

  const modelSpecificFallback = () =>
    roundResult(
      tokenCost(CONSERVATIVE_FALLBACK_INPUT_TOKENS, price.inputPerMillionUsd) +
        tokenCost(CONSERVATIVE_FALLBACK_OUTPUT_TOKENS, price.outputPerMillionUsd),
      config.usdToJpyRate,
      'flat_fallback',
      price.matchedModelLabel,
    );

  if (!usage.usageAvailable) {
    return modelSpecificFallback();
  }

  const hasInput = typeof usage.inputTokens === 'number';
  const hasOutput = typeof usage.outputTokens === 'number';
  const hasTotal = typeof usage.totalTokens === 'number';

  if (!hasInput && !hasOutput && !hasTotal) {
    return modelSpecificFallback();
  }

  let inputTokens = usage.inputTokens ?? 0;
  let outputTokens = usage.outputTokens ?? 0;
  let mode: CostCalculationMode = 'usage_priced';

  if (hasInput && hasOutput) {
    // Full split already known - nothing to reconstruct.
  } else if (hasTotal && (hasInput || hasOutput)) {
    if (!hasOutput) outputTokens = Math.max(0, usage.totalTokens! - inputTokens);
    if (!hasInput) inputTokens = Math.max(0, usage.totalTokens! - outputTokens);
    mode = 'usage_priced_with_fallback_parts';
  } else if (hasTotal) {
    // Only a combined total is available - price it all at the (usually higher)
    // output rate so we never understate cost.
    outputTokens = usage.totalTokens!;
    inputTokens = 0;
    mode = 'usage_priced_with_fallback_parts';
  } else {
    // Only one side is known and no total to reconstruct from - assume the
    // unknown side mirrors the known one rather than treating it as zero.
    if (hasInput) outputTokens = inputTokens;
    if (hasOutput) inputTokens = outputTokens;
    mode = 'usage_priced_with_fallback_parts';
  }

  const cost =
    tokenCost(inputTokens, price.inputPerMillionUsd) +
    tokenCost(outputTokens, price.outputPerMillionUsd) +
    tokenCost(usage.cachedInputTokens, price.cachedInputPerMillionUsd) +
    tokenCost(usage.thinkingTokens, price.thinkingPerMillionUsd);

  return roundResult(cost, config.usdToJpyRate, mode, price.matchedModelLabel);
}
