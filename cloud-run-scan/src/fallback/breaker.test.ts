import test from 'node:test';
import assert from 'node:assert/strict';

import { RollingCircuitBreaker } from './breaker.js';
import type { ClassifiedGeminiError } from './types.js';

function classified(kind: ClassifiedGeminiError['kind']): ClassifiedGeminiError {
  return {
    kind,
    message: kind,
    reasonForSlack: kind,
    eligibleForBreaker: kind === '429' || kind === 'UPSTREAM_5XX' || kind === 'TIMEOUT',
    shouldFallback: true,
    retriable: true,
    ...(kind === '429' ? { label: 'RATE_LIMIT_BURST' as const } : {}),
  };
}

test('opens when 429 count reaches threshold in rolling window', () => {
  const breaker = new RollingCircuitBreaker({ windowMs: 60_000, openMs: 300_000, halfOpenProbeCount: 3 });
  const base = 1_000_000;

  for (let i = 0; i < 9; i += 1) {
    const observed = breaker.recordFailure(classified('429'), base + i);
    assert.equal(observed.transitionedToOpen, false);
  }

  const observed = breaker.recordFailure(classified('429'), base + 10);
  assert.equal(observed.transitionedToOpen, true);
  assert.equal(observed.state, 'OPEN');
});

test('opens when 5xx count reaches threshold in rolling window', () => {
  const breaker = new RollingCircuitBreaker({ windowMs: 60_000, openMs: 300_000, halfOpenProbeCount: 3 });
  const base = 2_000_000;

  for (let i = 0; i < 5; i += 1) {
    const observed = breaker.recordFailure(classified('UPSTREAM_5XX'), base + i);
    assert.equal(observed.transitionedToOpen, false);
  }

  const observed = breaker.recordFailure(classified('UPSTREAM_5XX'), base + 10);
  assert.equal(observed.transitionedToOpen, true);
  assert.equal(observed.state, 'OPEN');
});

test('half-open closes after 3 consecutive successes', () => {
  const breaker = new RollingCircuitBreaker({ windowMs: 60_000, openMs: 100, halfOpenProbeCount: 3 });
  const base = 3_000_000;

  breaker.forceOpen('test', base);
  assert.equal(breaker.getState(base + 200), 'HALF_OPEN');

  let observed = breaker.recordSuccess(base + 201);
  assert.equal(observed.state, 'HALF_OPEN');
  assert.equal(observed.transitionedToClosed, false);

  observed = breaker.recordSuccess(base + 202);
  assert.equal(observed.state, 'HALF_OPEN');
  assert.equal(observed.transitionedToClosed, false);

  observed = breaker.recordSuccess(base + 203);
  assert.equal(observed.state, 'CLOSED');
  assert.equal(observed.transitionedToClosed, true);
});

test('half-open reopens immediately on timeout failure', () => {
  const breaker = new RollingCircuitBreaker({ windowMs: 60_000, openMs: 100, halfOpenProbeCount: 3 });
  const base = 4_000_000;

  breaker.forceOpen('test', base);
  assert.equal(breaker.getState(base + 200), 'HALF_OPEN');

  const observed = breaker.recordFailure(classified('TIMEOUT'), base + 201);
  assert.equal(observed.state, 'OPEN');
  assert.equal(observed.transitionedToOpen, true);
});
