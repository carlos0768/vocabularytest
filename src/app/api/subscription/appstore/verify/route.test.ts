import test from 'node:test';
import assert from 'node:assert/strict';
import { __internal } from './route';

test('active billing with future period is a conflict', () => {
  const conflict = __internal.isActiveBillingConflict({
    status: 'active',
    plan: 'pro',
    pro_source: 'billing',
    test_pro_expires_at: null,
    current_period_end: '2099-03-01T00:00:00.000Z',
  });

  assert.equal(conflict, true);
});

test('expired billing is not a conflict', () => {
  const conflict = __internal.isActiveBillingConflict({
    status: 'active',
    plan: 'pro',
    pro_source: 'billing',
    test_pro_expires_at: null,
    current_period_end: '2026-01-01T00:00:00.000Z',
  });

  assert.equal(conflict, false);
});

test('appstore source is not treated as billing conflict', () => {
  const conflict = __internal.isActiveBillingConflict({
    status: 'active',
    plan: 'pro',
    pro_source: 'appstore',
    test_pro_expires_at: null,
    current_period_end: '2099-03-01T00:00:00.000Z',
  });

  assert.equal(conflict, false);
});
