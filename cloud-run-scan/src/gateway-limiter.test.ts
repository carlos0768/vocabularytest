import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DailyGatewayLimiter,
  loadGatewayLimiterConfigFromEnv,
} from './gateway-limiter.js';

test('blocks gateway calls when call cap is reached', () => {
  const limiter = new DailyGatewayLimiter({
    callsDailyCap: 2,
    costDailyCapYen: 100,
    estimatedYenPerCall: 3,
  });
  const base = 1_000_000;

  assert.equal(limiter.canStart(base), true);
  limiter.recordStart(base + 1);
  assert.equal(limiter.canStart(base + 2), true);
  limiter.recordStart(base + 3);
  assert.equal(limiter.canStart(base + 4), false);
});

test('blocks gateway calls when estimated cost cap is reached', () => {
  const limiter = new DailyGatewayLimiter({
    callsDailyCap: 100,
    costDailyCapYen: 6,
    estimatedYenPerCall: 3,
  });
  const base = 2_000_000;

  limiter.recordStart(base);
  limiter.recordStart(base + 1);

  assert.equal(limiter.canStart(base + 2), false);
});

test('gateway caps reset on the next UTC day', () => {
  const limiter = new DailyGatewayLimiter({
    callsDailyCap: 1,
    costDailyCapYen: 3,
    estimatedYenPerCall: 3,
  });
  const firstDay = Date.parse('2026-06-13T23:59:59.000Z');
  const nextDay = Date.parse('2026-06-14T00:00:01.000Z');

  limiter.recordStart(firstDay);
  assert.equal(limiter.canStart(firstDay), false);
  assert.equal(limiter.canStart(nextDay), true);
});

test('gateway limiter env parser allows zero for emergency stop', () => {
  const config = loadGatewayLimiterConfigFromEnv({
    GATEWAY_CALLS_DAILY_CAP: '0',
    GATEWAY_COST_DAILY_CAP_YEN: '0',
    GATEWAY_ESTIMATED_YEN_PER_CALL: '0',
  });

  assert.equal(config.callsDailyCap, 0);
  assert.equal(config.costDailyCapYen, 0);
  assert.equal(config.estimatedYenPerCall, 0);
});
