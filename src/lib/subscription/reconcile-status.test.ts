import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyPaymentStatus,
  isCapturedStatus,
  isFailedStatus,
} from './reconcile-status';

test('captured statuses are classified as confirmed', () => {
  const captured = ['complete', 'paid', 'succeeded', 'captured', 'completed'];
  for (const status of captured) {
    assert.equal(isCapturedStatus(status), true, `expected ${status} to be captured`);
    assert.equal(classifyPaymentStatus(status), 'confirmed');
  }
});

test('failed statuses are classified as failed', () => {
  const failed = ['failed', 'expired', 'cancelled', 'canceled', 'declined', 'rejected'];
  for (const status of failed) {
    assert.equal(isFailedStatus(status), true, `expected ${status} to be failed`);
    assert.equal(classifyPaymentStatus(status), 'failed');
  }
});

test('unknown or empty statuses are classified as pending', () => {
  assert.equal(classifyPaymentStatus(null), 'pending');
  assert.equal(classifyPaymentStatus(undefined), 'pending');
  assert.equal(classifyPaymentStatus(''), 'pending');
  assert.equal(classifyPaymentStatus('pending'), 'pending');
  assert.equal(classifyPaymentStatus('authorized'), 'pending');
});
