import test from 'node:test';
import assert from 'node:assert/strict';

import {
  evaluateGatewayGuardState,
  loadGatewayFirestoreGuardConfigFromEnv,
} from './gateway-firestore-guard.js';

const limiterConfig = {
  costDailyCapYen: 9,
  estimatedYenPerCall: 3,
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

test('firestore guard blocks when the global stop flag is enabled', () => {
  const decision = evaluateGatewayGuardState(
    {
      disabled: true,
      disabledReason: 'monthly budget threshold exceeded',
    },
    {
      calls: 1,
      yen: 3,
    },
    limiterConfig,
  );

  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, 'budget-guard-disabled');
  assert.equal(decision.disabledReason, 'monthly budget threshold exceeded');
});

test('firestore guard does not block when only the global daily call count is high', () => {
  const decision = evaluateGatewayGuardState(undefined, { calls: 3000, yen: 6 }, limiterConfig);

  assert.equal(decision.allowed, true);
  assert.equal(decision.calls, 3001);
  assert.equal(decision.yen, 9);
});

test('firestore guard blocks when the global daily yen cap is reached', () => {
  const decision = evaluateGatewayGuardState(undefined, { calls: 3, yen: 9 }, limiterConfig);

  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, 'global-daily-cost-cap-reached');
});

test('firestore guard reserves the next global call', () => {
  const decision = evaluateGatewayGuardState(undefined, { calls: 2, yen: 6 }, limiterConfig);

  assert.equal(decision.allowed, true);
  assert.equal(decision.calls, 3);
  assert.equal(decision.yen, 9);
});
