export type UsageSource = 'provider_response' | 'estimated' | 'missing';

/**
 * Common usage shape absorbing differences between provider SDK responses
 * (OpenAI chat completions usage, Gemini usageMetadata) and the final
 * provider/model actually used after fallback execution.
 */
export interface NormalizedUsage {
  provider: 'openai' | 'gemini';
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  cachedInputTokens?: number;
  thinkingTokens?: number;
  imageInputPresent: boolean;
  usageAvailable: boolean;
  usageSource: UsageSource;
}

export type CostCalculationMode =
  | 'usage_priced'
  | 'usage_priced_with_fallback_parts'
  | 'flat_fallback'
  | 'rejected_unpriced_model';

export interface CostResult {
  estimatedCostUsd: number;
  estimatedCostJpy: number;
  pricingVersion: string;
  pricingMatchedModel?: string;
  costCalculationMode: CostCalculationMode;
}
