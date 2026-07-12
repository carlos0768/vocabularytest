import test from 'node:test';
import assert from 'node:assert/strict';

import {
  evaluateGatewayEligibility,
  loadGatewayCapConfigFromEnv,
  loadGatewayFirestoreGuardConfigFromEnv,
} from './gateway-firestore-guard.js';

const capConfig = {
  costDailyCapYen: 9,
  usageMissingCallsDailyCap: 0,
};

test('firestore guard is opt-in and fail-closed by default', () => {
  const config = loadGatewayFirestoreGuardConfigFromEnv({});

  assert.equal(config.enabled, false);
  assert.equal(config.failClosed, true);
  assert.equal(config.stateDocPath, 'ops/aiGatewayGuard');
});

test('firestore guard env parser enables shared guard', () => {
  const config = loadGatewayFirestoreGuardConfigFromEnv({
    GATEWAY_FIRESTORE_GUARD_ENABLED: 'true',
    GATEWAY_FIRESTORE_GUARD_FAIL_CLOSED: 'false',
    GATEWAY_GUARD_STATE_DOC: 'ops/customGuard',
    GCP_PROJECT_ID: 'project-id',
  });

  assert.equal(config.enabled, true);
  assert.equal(config.failClosed, false);
  assert.equal(config.stateDocPath, 'ops/customGuard');
  assert.equal(config.projectId, 'project-id');
});

test('gateway cap config env parser allows zero yen cap for emergency stop', () => {
  const config = loadGatewayCapConfigFromEnv({
    GATEWAY_COST_DAILY_CAP_YEN: '0',
  });

  assert.equal(config.costDailyCapYen, 0);
});

test('gateway cap config env parser reads the usage-missing safety cap', () => {
  const config = loadGatewayCapConfigFromEnv({ GATEWAY_USAGE_MISSING_CALLS_DAILY_CAP: '25' });
  assert.equal(config.usageMissingCallsDailyCap, 25);
});

test('firestore guard blocks when the global stop flag is enabled', () => {
  const decision = evaluateGatewayEligibility(
    {
      disabled: true,
      disabledReason: 'monthly budget threshold exceeded',
    },
    {
      calls: 1,
      yen: 3,
    },
    capConfig,
  );

  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, 'budget_guard_disabled');
  assert.equal(decision.disabledReason, 'monthly budget threshold exceeded');
});

test('firestore guard does not block when only the global daily call count is high', () => {
  const decision = evaluateGatewayEligibility(undefined, { calls: 3000, yen: 1 }, capConfig);

  assert.equal(decision.allowed, true);
  assert.equal(decision.calls, 3001);
});

test('firestore guard blocks when the global daily cost cap is reached', () => {
  const decision = evaluateGatewayEligibility(undefined, { calls: 1, yen: 9 }, capConfig);

  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, 'global_daily_cost_cap_reached');
});

test('firestore guard blocks on the usage-missing safety cap when configured', () => {
  const decision = evaluateGatewayEligibility(
    undefined,
    { calls: 1, yen: 1, usageMissingCalls: 5 },
    { ...capConfig, usageMissingCallsDailyCap: 5 },
  );

  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, 'usage_missing_fallback_cap_reached');
});

test('usage-missing safety cap is skipped when set to 0 (disabled)', () => {
  const decision = evaluateGatewayEligibility(
    undefined,
    { calls: 1, yen: 1, usageMissingCalls: 1000 },
    capConfig,
  );

  assert.equal(decision.allowed, true);
});

test('firestore guard reserves the next call slot without touching yen', () => {
  const decision = evaluateGatewayEligibility(undefined, { calls: 1, yen: 6 }, capConfig);

  assert.equal(decision.allowed, true);
  assert.equal(decision.calls, 2);
  assert.equal(decision.yen, 6);
});
