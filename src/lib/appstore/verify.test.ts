import test from 'node:test';
import assert from 'node:assert/strict';
import { isAllowedAppStoreProduct } from './verify';

test('isAllowedAppStoreProduct returns true for allowlisted product', () => {
  const allowed = isAllowedAppStoreProduct(
    'com.example.merken.pro.monthly',
    ['com.example.merken.pro.monthly']
  );
  assert.equal(allowed, true);
});

test('isAllowedAppStoreProduct returns false when product is not allowlisted', () => {
  const allowed = isAllowedAppStoreProduct(
    'com.example.merken.pro.yearly',
    ['com.example.merken.pro.monthly']
  );
  assert.equal(allowed, false);
});

