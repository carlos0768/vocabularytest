import test from 'node:test';
import assert from 'node:assert/strict';

import { calculateEstimatedCost, findModelPrice, loadPricingEnvConfig, PRICING_VERSION } from './pricing.js';
import type { NormalizedUsage } from './types.js';

const config = { usdToJpyRate: 150, flatFallbackUsd: 0.05 };

function usage(overrides: Partial<NormalizedUsage>): NormalizedUsage {
  return {
    provider: 'gemini',
    model: 'gemini-2.5-flash',
    imageInputPresent: false,
    usageAvailable: true,
    usageSource: 'provider_response',
    ...overrides,
  };
}

test('findModelPrice matches gpt-4o-mini before the generic gpt-4o entry', () => {
  const price = findModelPrice('openai', 'gpt-4o-mini-2024-07-18');
  assert.equal(price?.matchedModelLabel, 'gpt-4o-mini');
});

test('findModelPrice returns undefined for unknown models', () => {
  assert.equal(findModelPrice('openai', 'some-future-model'), undefined);
});

test('calculateEstimatedCost prices full usage as usage_priced', () => {
  const result = calculateEstimatedCost(
    usage({ inputTokens: 1_000_000, outputTokens: 1_000_000 }),
    config,
  );

  assert.equal(result.costCalculationMode, 'usage_priced');
  assert.equal(result.pricingMatchedModel, 'gemini-2.5-flash');
  assert.equal(result.pricingVersion, PRICING_VERSION);
  // 0.30 (input) + 2.50 (output) = 2.80 USD -> * 150 = 420 JPY
  assert.equal(result.estimatedCostUsd, 2.8);
  assert.equal(result.estimatedCostJpy, 420);
});

test('calculateEstimatedCost includes cached input and thinking tokens', () => {
  const result = calculateEstimatedCost(
    usage({
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
      cachedInputTokens: 1_000_000,
      thinkingTokens: 1_000_000,
    }),
    config,
  );

  // 0.30 + 2.50 + 0.075 + 2.50 = 5.375 USD
  assert.equal(result.estimatedCostUsd, 5.375);
  assert.equal(result.costCalculationMode, 'usage_priced');
});

test('calculateEstimatedCost reconstructs the missing side from total', () => {
  const result = calculateEstimatedCost(
    usage({ inputTokens: 1_000_000, totalTokens: 1_500_000 }),
    config,
  );

  assert.equal(result.costCalculationMode, 'usage_priced_with_fallback_parts');
  // input 1M @ 0.30 + output 0.5M @ 2.50 = 0.30 + 1.25 = 1.55 USD
  assert.equal(result.estimatedCostUsd, 1.55);
});

test('calculateEstimatedCost prices a lone total at the output rate', () => {
  const result = calculateEstimatedCost(usage({ totalTokens: 1_000_000 }), config);

  assert.equal(result.costCalculationMode, 'usage_priced_with_fallback_parts');
  assert.equal(result.estimatedCostUsd, 2.5);
});

test('calculateEstimatedCost mirrors the known side when only one is present and no total', () => {
  const result = calculateEstimatedCost(usage({ inputTokens: 1_000_000 }), config);

  assert.equal(result.costCalculationMode, 'usage_priced_with_fallback_parts');
  // input 1M @ 0.30 + assumed-equal output 1M @ 2.50 = 2.80 USD
  assert.equal(result.estimatedCostUsd, 2.8);
});

test('calculateEstimatedCost falls back to a model-specific flat estimate when usage is missing for a priced model', () => {
  const result = calculateEstimatedCost(
    usage({ usageAvailable: false, usageSource: 'missing', inputTokens: undefined, outputTokens: undefined }),
    config,
  );

  assert.equal(result.costCalculationMode, 'flat_fallback');
  // 2000 tokens @ 0.30/1M + 1500 tokens @ 2.50/1M = 0.0006 + 0.00375 = 0.00435 USD
  assert.equal(result.estimatedCostUsd, 0.00435);
  assert.equal(result.pricingMatchedModel, 'gemini-2.5-flash');
  assert.ok(result.estimatedCostJpy > 0);
});

test('the priced-model flat fallback scales with the model rate instead of sharing one number', () => {
  const cheap = calculateEstimatedCost(
    usage({ model: 'gpt-4o-mini', provider: 'openai', usageAvailable: false, usageSource: 'missing' }),
    config,
  );
  const expensive = calculateEstimatedCost(
    usage({ model: 'gemini-2.5-pro', usageAvailable: false, usageSource: 'missing' }),
    config,
  );

  assert.ok(expensive.estimatedCostUsd > cheap.estimatedCostUsd);
});

test('an entirely unpriced model uses the blanket conservative fallback and never reports zero cost', () => {
  const result = calculateEstimatedCost(
    usage({ model: 'some-future-model', usageAvailable: false, usageSource: 'missing' }),
    config,
  );

  assert.equal(result.costCalculationMode, 'flat_fallback');
  assert.equal(result.estimatedCostUsd, 0.05);
  assert.equal(result.estimatedCostJpy, 8); // ceil(0.05 * 150) = 8
  assert.equal(result.pricingMatchedModel, undefined);
});

test('calculateEstimatedCost falls back to a flat estimate for unpriced models and never reports zero cost', () => {
  const result = calculateEstimatedCost(usage({ model: 'some-future-model', inputTokens: 1000, outputTokens: 1000 }), config);

  assert.equal(result.costCalculationMode, 'flat_fallback');
  assert.equal(result.pricingMatchedModel, undefined);
  assert.ok(result.estimatedCostUsd > 0);
  assert.ok(result.estimatedCostJpy > 0);
});

test('loadPricingEnvConfig reads the configurable exchange rate and fallback estimate', () => {
  const parsed = loadPricingEnvConfig({
    GATEWAY_USD_TO_JPY_RATE: '160',
    GATEWAY_FLAT_FALLBACK_USD: '0.1',
  } as NodeJS.ProcessEnv);

  assert.equal(parsed.usdToJpyRate, 160);
  assert.equal(parsed.flatFallbackUsd, 0.1);
});

test('loadPricingEnvConfig falls back to defaults for invalid values', () => {
  const parsed = loadPricingEnvConfig({ GATEWAY_USD_TO_JPY_RATE: 'not-a-number' } as NodeJS.ProcessEnv);
  assert.equal(parsed.usdToJpyRate, 155);
});
