import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeGeminiUsage, normalizeOpenAIUsage } from './usage-normalizer.js';

test('normalizeOpenAIUsage maps token fields from the SDK response', () => {
  const usage = normalizeOpenAIUsage(
    {
      prompt_tokens: 120,
      completion_tokens: 40,
      total_tokens: 160,
      prompt_tokens_details: { cached_tokens: 20 },
      completion_tokens_details: { reasoning_tokens: 5 },
    },
    'gpt-4o-mini',
    false,
  );

  assert.deepEqual(usage, {
    provider: 'openai',
    model: 'gpt-4o-mini',
    inputTokens: 120,
    outputTokens: 40,
    totalTokens: 160,
    cachedInputTokens: 20,
    thinkingTokens: 5,
    imageInputPresent: false,
    usageAvailable: true,
    usageSource: 'provider_response',
  });
});

test('normalizeOpenAIUsage marks usage missing when the SDK omits it', () => {
  const usage = normalizeOpenAIUsage(undefined, 'gpt-4o-mini', true);

  assert.equal(usage.usageAvailable, false);
  assert.equal(usage.usageSource, 'missing');
  assert.equal(usage.imageInputPresent, true);
  assert.equal(usage.inputTokens, undefined);
});

test('normalizeGeminiUsage maps usageMetadata fields', () => {
  const usage = normalizeGeminiUsage(
    {
      promptTokenCount: 300,
      candidatesTokenCount: 80,
      totalTokenCount: 410,
      cachedContentTokenCount: 10,
      thoughtsTokenCount: 30,
    },
    'gemini-2.5-flash',
    true,
  );

  assert.deepEqual(usage, {
    provider: 'gemini',
    model: 'gemini-2.5-flash',
    inputTokens: 300,
    outputTokens: 80,
    totalTokens: 410,
    cachedInputTokens: 10,
    thinkingTokens: 30,
    imageInputPresent: true,
    usageAvailable: true,
    usageSource: 'provider_response',
  });
});

test('normalizeGeminiUsage marks usage missing when usageMetadata is absent', () => {
  const usage = normalizeGeminiUsage(null, 'gemini-2.5-flash', false);

  assert.equal(usage.usageAvailable, false);
  assert.equal(usage.usageSource, 'missing');
});
