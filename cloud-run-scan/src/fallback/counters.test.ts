import test from 'node:test';
import assert from 'node:assert/strict';

import { FallbackCounters } from './counters.js';

test('blocks fallback when calls cap reached', () => {
  const counters = new FallbackCounters({ callsDailyCap: 2, costDailyCapYen: 3000, estimatedYenPerCall: 3, fallbackRateWindowMs: 600000 });
  const base = 1_000_000;

  counters.recordRequest(base);
  assert.equal(counters.canFallback(base), true);

  counters.recordFallback(base + 1);
  assert.equal(counters.canFallback(base + 2), true);

  counters.recordFallback(base + 3);
  assert.equal(counters.canFallback(base + 4), false);
});

test('blocks fallback when cost cap reached', () => {
  const counters = new FallbackCounters({ callsDailyCap: 1000, costDailyCapYen: 6, estimatedYenPerCall: 3, fallbackRateWindowMs: 600000 });
  const base = 2_000_000;

  counters.recordRequest(base);
  counters.recordFallback(base + 1);
  counters.recordFallback(base + 2);

  assert.equal(counters.canFallback(base + 3), false);
});

test('cap notification marker is emitted only once per day', () => {
  const counters = new FallbackCounters({ callsDailyCap: 1, costDailyCapYen: 3000, estimatedYenPerCall: 3, fallbackRateWindowMs: 600000 });
  const base = 3_000_000;

  counters.recordRequest(base);
  counters.recordFallback(base + 1);

  assert.equal(counters.markCapNotified(base + 2), true);
  assert.equal(counters.markCapNotified(base + 3), false);
});

test('fallback rate window computes ratio correctly', () => {
  const counters = new FallbackCounters({ callsDailyCap: 1000, costDailyCapYen: 3000, estimatedYenPerCall: 3, fallbackRateWindowMs: 600_000 });
  const base = 4_000_000;

  for (let i = 0; i < 10; i += 1) {
    counters.recordRequest(base + i);
  }

  counters.recordFallback(base + 20);
  counters.recordFallback(base + 30);

  const rate = counters.getFallbackRateWindow(base + 40);
  assert.equal(rate.totalRequests, 10);
  assert.equal(rate.fallbackCount, 2);
  assert.equal(rate.fallbackRate, 0.2);
});
