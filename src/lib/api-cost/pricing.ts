type PricingPerMillionTokens = {
  inputUsdPerMillion: number;
  outputUsdPerMillion: number;
};

type ProviderPricingTable = Record<string, PricingPerMillionTokens>;

const DEFAULT_USD_TO_JPY = 150;

const DEFAULT_PRICING: Record<'openai' | 'gemini', ProviderPricingTable> = {
  openai: {
    'gpt-4o-mini': { inputUsdPerMillion: 0.15, outputUsdPerMillion: 0.6 },
    'gpt-4o': { inputUsdPerMillion: 2.5, outputUsdPerMillion: 10.0 },
    'text-embedding-3-small': { inputUsdPerMillion: 0.02, outputUsdPerMillion: 0.0 },
  },
  gemini: {
    'gemini-2.0-flash-001': { inputUsdPerMillion: 0.10, outputUsdPerMillion: 0.40 },
    'gemini-2.5-flash': { inputUsdPerMillion: 0.3, outputUsdPerMillion: 2.5 },
  },
};

export type ApiCostCalculationInput = {
  provider: string;
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
};

export type ApiCostCalculationResult = {
  estimatedCostUsd: number | null;
  estimatedCostJpy: number | null;
  pricingFound: boolean;
};

function asFiniteNumber(value: unknown): number | null {
  if (typeof value !== 'number') return null;
  if (!Number.isFinite(value)) return null;
  return value;
}

function normalizeProvider(provider: string): 'openai' | 'gemini' | null {
  const normalized = provider.trim().toLowerCase();
  if (normalized.includes('openai')) return 'openai';
  if (normalized.includes('gemini')) return 'gemini';
  return null;
}

function normalizeModel(model: string): string {
  const normalized = model.trim().toLowerCase();
  if (normalized.includes('gemini-2.0-flash')) return 'gemini-2.0-flash-001';
  if (normalized.includes('gemini-2.5-flash')) return 'gemini-2.5-flash';
  if (normalized.includes('gpt-4o-mini')) return 'gpt-4o-mini';
  if (normalized.includes('gpt-4o')) return 'gpt-4o';
  if (normalized.includes('text-embedding-3-small')) return 'text-embedding-3-small';
  return normalized;
}

function sanitizeTokens(value: number | null): number {
  if (value === null) return 0;
  const rounded = Math.round(value);
  if (!Number.isFinite(rounded) || rounded <= 0) return 0;
  return rounded;
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function getUsdToJpyRate(): number {
  const configured = Number(process.env.API_COST_USD_TO_JPY);
  if (Number.isFinite(configured) && configured > 0) {
    return configured;
  }
  return DEFAULT_USD_TO_JPY;
}

function getEnvPricing(provider: 'openai' | 'gemini', model: string): PricingPerMillionTokens | null {
  const providerUpper = provider.toUpperCase();
  const modelKey = model.replace(/[^a-zA-Z0-9]+/g, '_').toUpperCase();
  const input = asFiniteNumber(
    Number(process.env[`API_PRICE_${providerUpper}_${modelKey}_INPUT_USD_PER_1M`])
  );
  const output = asFiniteNumber(
    Number(process.env[`API_PRICE_${providerUpper}_${modelKey}_OUTPUT_USD_PER_1M`])
  );

  if (input !== null && output !== null && input >= 0 && output >= 0) {
    return {
      inputUsdPerMillion: input,
      outputUsdPerMillion: output,
    };
  }

  return null;
}

function getPricing(provider: 'openai' | 'gemini', model: string): PricingPerMillionTokens | null {
  const envPricing = getEnvPricing(provider, model);
  if (envPricing) return envPricing;

  const defaults = DEFAULT_PRICING[provider];
  return defaults[model] ?? null;
}

export function calculateEstimatedApiCost(
  input: ApiCostCalculationInput
): ApiCostCalculationResult {
  const provider = normalizeProvider(input.provider);
  const model = normalizeModel(input.model);

  if (!provider || !model) {
    return {
      estimatedCostUsd: null,
      estimatedCostJpy: null,
      pricingFound: false,
    };
  }

  const pricing = getPricing(provider, model);
  if (!pricing) {
    return {
      estimatedCostUsd: null,
      estimatedCostJpy: null,
      pricingFound: false,
    };
  }

  const inputTokens = sanitizeTokens(input.inputTokens);
  const outputTokens = sanitizeTokens(input.outputTokens);
  const totalTokens = sanitizeTokens(input.totalTokens);

  const inferredInputTokens = inputTokens === 0 && outputTokens === 0 ? totalTokens : inputTokens;
  const inferredOutputTokens = outputTokens;

  const estimatedCostUsd =
    (inferredInputTokens / 1_000_000) * pricing.inputUsdPerMillion +
    (inferredOutputTokens / 1_000_000) * pricing.outputUsdPerMillion;

  const usdToJpy = getUsdToJpyRate();

  return {
    estimatedCostUsd: round(estimatedCostUsd, 8),
    estimatedCostJpy: round(estimatedCostUsd * usdToJpy, 4),
    pricingFound: true,
  };
}
