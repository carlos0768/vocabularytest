import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isBillingEnabled } from './feature';

function withEnv(value: string | undefined, fn: () => void) {
  const previous = process.env.NEXT_PUBLIC_BILLING_ENABLED;
  if (value === undefined) {
    delete process.env.NEXT_PUBLIC_BILLING_ENABLED;
  } else {
    process.env.NEXT_PUBLIC_BILLING_ENABLED = value;
  }
  try {
    fn();
  } finally {
    if (previous === undefined) {
      delete process.env.NEXT_PUBLIC_BILLING_ENABLED;
    } else {
      process.env.NEXT_PUBLIC_BILLING_ENABLED = previous;
    }
  }
}

test('billing is enabled by default (flag unset)', () => {
  withEnv(undefined, () => {
    assert.equal(isBillingEnabled(), true);
  });
});

test('billing is enabled when flag is true', () => {
  withEnv('true', () => {
    assert.equal(isBillingEnabled(), true);
  });
});

test('billing is disabled only by the explicit false kill switch', () => {
  withEnv('false', () => {
    assert.equal(isBillingEnabled(), false);
  });
});
