import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateEstimatedApiCost } from './pricing';

test('calculateEstimatedApiCost returns cost for known OpenAI model', () => {
  const result = calculateEstimatedApiCost({
    provider: 'openai',
    model: 'gpt-4o-mini',
    inputTokens: 1000,
    outputTokens: 500,
    totalTokens: 1500,
  });

  assert.equal(result.pricingFound, true);
  assert.equal(result.estimatedCostUsd !== null, true);
  assert.equal(result.estimatedCostJpy !== null, true);

  // gpt-4o-mini default:
  // input: 0.15 / 1M, output: 0.6 / 1M
  // (1000 * 0.15 + 500 * 0.6) / 1_000_000 = 0.00045
  assert.equal(result.estimatedCostUsd, 0.00045);
});

test('calculateEstimatedApiCost returns null for unknown model', () => {
  const result = calculateEstimatedApiCost({
    provider: 'openai',
    model: 'unknown-model',
    inputTokens: 1000,
    outputTokens: 500,
    totalTokens: 1500,
  });

  assert.equal(result.pricingFound, false);
  assert.equal(result.estimatedCostUsd, null);
  assert.equal(result.estimatedCostJpy, null);
});

test('calculateEstimatedApiCost treats cloud-run-openai as openai family', () => {
  const result = calculateEstimatedApiCost({
    provider: 'cloud-run-openai',
    model: 'gpt-4o',
    inputTokens: 1000,
    outputTokens: 1000,
    totalTokens: 2000,
  });

  assert.equal(result.pricingFound, true);
  assert.equal(result.estimatedCostUsd !== null, true);
});
