import test from 'node:test';
import assert from 'node:assert/strict';

import { GeminiFallbackRunner } from './runner.js';
import type { FallbackConfig } from './types.js';

const baseConfig: FallbackConfig = {
  fallbackOpenAIModel: 'gpt-4o',
  fallbackCallsDailyCap: 1000,
  fallbackCostDailyCapYen: 3000,
  fallbackEstimatedYenPerCall: 3,
  breakerOpenMs: 100,
  breakerWindowMs: 60_000,
  breakerHalfOpenProbeCount: 3,
  fallbackRateWindowMs: 10 * 60 * 1000,
  fallbackRateWarnThreshold: 0.2,
  appEnv: 'prod',
  slackWebhookUrl: undefined,
};

function createRunner(config: Partial<FallbackConfig> = {}): GeminiFallbackRunner {
  return new GeminiFallbackRunner({ ...baseConfig, ...config });
}

test('QUOTA_EXHAUSTED falls back immediately without retries', async () => {
  const runner = createRunner();

  let geminiCalls = 0;
  let openaiCalls = 0;

  const result = await runner.execute(
    {
      ctx: { env: 'prod', feature: 'scan_extraction', requestId: 'req-1' },
    },
    {
      runGemini: async () => {
        geminiCalls += 1;
        throw { status: 429, message: 'quota exceeded for metric generate_content_free_tier_requests' };
      },
      runOpenAI: async () => {
        openaiCalls += 1;
        return {
          content: 'fallback-ok',
          modelUsed: 'gpt-4o',
          usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
        };
      },
    },
  );

  assert.equal(geminiCalls, 1);
  assert.equal(openaiCalls, 1);
  assert.equal(result.provider, 'openai');
  assert.equal(result.content, 'fallback-ok');
  assert.equal(result.fallbackReason, 'QUOTA_EXHAUSTED');
});

test('RATE_LIMIT_BURST retries twice then falls back', async () => {
  const runner = createRunner();

  let geminiCalls = 0;
  let openaiCalls = 0;

  const result = await runner.execute(
    {
      ctx: { env: 'prod', feature: 'scan_extraction', requestId: 'req-2' },
    },
    {
      runGemini: async () => {
        geminiCalls += 1;
        throw { status: 429, message: 'rate limit exceeded per minute' };
      },
      runOpenAI: async () => {
        openaiCalls += 1;
        return {
          content: 'fallback-after-retry',
          modelUsed: 'gpt-4o',
        };
      },
    },
  );

  assert.equal(geminiCalls, 3);
  assert.equal(openaiCalls, 1);
  assert.equal(result.provider, 'openai');
  assert.equal(result.fallbackReason, 'RATE_LIMIT_BURST');
});

test('TIMEOUT retries once then falls back', async () => {
  const runner = createRunner();

  let geminiCalls = 0;
  let openaiCalls = 0;

  const result = await runner.execute(
    {
      ctx: { env: 'prod', feature: 'scan_extraction', requestId: 'req-3' },
    },
    {
      runGemini: async () => {
        geminiCalls += 1;
        throw new Error('fetch failed ETIMEDOUT');
      },
      runOpenAI: async () => {
        openaiCalls += 1;
        return {
          content: 'fallback-timeout',
          modelUsed: 'gpt-4o',
        };
      },
    },
  );

  assert.equal(geminiCalls, 2);
  assert.equal(openaiCalls, 1);
  assert.equal(result.provider, 'openai');
  assert.equal(result.fallbackReason, 'TIMEOUT');
});

test('INVALID_INPUT does not fallback', async () => {
  const runner = createRunner();

  let openaiCalls = 0;

  await assert.rejects(
    runner.execute(
      {
        ctx: { env: 'prod', feature: 'scan_extraction', requestId: 'req-4' },
      },
      {
        runGemini: async () => {
          throw { status: 400, message: 'invalid input' };
        },
        runOpenAI: async () => {
          openaiCalls += 1;
          return {
            content: 'should-not-run',
            modelUsed: 'gpt-4o',
          };
        },
      },
    ),
  );

  assert.equal(openaiCalls, 0);
});

test('does not use OpenAI when fallback cap has been reached', async () => {
  const runner = createRunner({ fallbackCallsDailyCap: 0 });

  await assert.rejects(
    runner.execute(
      {
        ctx: { env: 'prod', feature: 'scan_extraction', requestId: 'req-5' },
      },
      {
        runGemini: async () => {
          throw { status: 429, message: 'quota exceeded' };
        },
        runOpenAI: async () => {
          throw new Error('should not be called');
        },
      },
    ),
    /Fallback disabled: cap reached/,
  );
});

test('OpenAI fallback failure does not recurse', async () => {
  const runner = createRunner();

  let openaiCalls = 0;

  await assert.rejects(
    runner.execute(
      {
        ctx: { env: 'prod', feature: 'scan_extraction', requestId: 'req-6' },
      },
      {
        runGemini: async () => {
          throw { status: 429, message: 'quota exceeded' };
        },
        runOpenAI: async () => {
          openaiCalls += 1;
          throw new Error('openai down');
        },
      },
    ),
    /OpenAI fallback failed/,
  );

  assert.equal(openaiCalls, 1);
});

// Regression: production logs 2026-06-11 showed window_stats growing by 2 extra 429s
// after BREAKER_OPEN because the retry loop kept calling Gemini after the breaker tripped.
// Fix: bail immediately on transitionedToOpen instead of continuing retries.
test('when breaker opens mid-retry, remaining retries are skipped', async () => {
  // Use instant backoffs so the test accumulates 10 429s quickly.
  // 3 requests × 3 Gemini calls (1 initial + 2 retries) = 9 429s → still CLOSED.
  // 4th request: 1st Gemini call = 10th 429 → breaker opens → must fall back immediately
  // (no retries 2 or 3 for that request).
  const runner = createRunner({ retryBackoffsMs: [0, 0, 0] });

  let geminiCalls = 0;
  let openaiCalls = 0;

  const makeRequest = () =>
    runner.execute(
      { ctx: { env: 'prod', feature: 'scan_extraction', requestId: `req-${geminiCalls}` } },
      {
        runGemini: async () => {
          geminiCalls += 1;
          throw { status: 429, message: 'Please try again later. Resource exhausted' };
        },
        runOpenAI: async () => {
          openaiCalls += 1;
          return { content: 'ok', modelUsed: 'gpt-4o' };
        },
      },
    );

  // Requests 1–3: breaker still CLOSED, each does 1 + 2 retries = 3 Gemini calls
  await makeRequest();
  await makeRequest();
  await makeRequest();
  assert.equal(geminiCalls, 9);
  assert.equal(openaiCalls, 3);

  // Request 4: 1st Gemini call is the 10th 429 → breaker opens → must stop here
  await makeRequest();
  assert.equal(geminiCalls, 10, 'only 1 Gemini call on the breaker-opening request, not 3');
  assert.equal(openaiCalls, 4);

  // Request 5: breaker is OPEN, Gemini must not be called at all
  const result = await makeRequest();
  assert.equal(geminiCalls, 10, 'no Gemini calls when breaker is already OPEN');
  assert.equal(result.provider, 'openai');
  assert.equal(result.fallbackReason, 'BREAKER_OPEN');
  assert.equal(openaiCalls, 5);
});

test('empty-content errors retry and fallback to OpenAI', async () => {
  const runner = createRunner();

  let geminiCalls = 0;
  let openaiCalls = 0;

  const result = await runner.execute(
    {
      ctx: { env: 'prod', feature: 'scan_extraction', requestId: 'req-7' },
    },
    {
      runGemini: async () => {
        geminiCalls += 1;
        throw new Error('Gemini returned empty content');
      },
      runOpenAI: async () => {
        openaiCalls += 1;
        return {
          content: 'fallback-empty-content',
          modelUsed: 'gpt-4o',
        };
      },
    },
  );

  assert.equal(geminiCalls, 3);
  assert.equal(openaiCalls, 1);
  assert.equal(result.provider, 'openai');
  assert.equal(result.fallbackReason, 'EMPTY_CONTENT');
});
