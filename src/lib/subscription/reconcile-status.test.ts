import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildReconcileActivationErrorResponse,
  buildReconcileConfirmedResponse,
  buildReconcileFailedResponse,
  buildReconcilePendingResponse,
  classifyCheckoutSessionReconcileState,
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

test('checkout session reconcile state keeps paid confirmed and unpaid or expired failed', () => {
  assert.equal(classifyCheckoutSessionReconcileState('paid', 'complete'), 'confirmed');
  assert.equal(classifyCheckoutSessionReconcileState('paid', 'expired'), 'confirmed');
  assert.equal(classifyCheckoutSessionReconcileState('unpaid', 'open'), 'failed');
  assert.equal(classifyCheckoutSessionReconcileState(null, 'expired'), 'failed');
  assert.equal(classifyCheckoutSessionReconcileState('no_payment_required', 'complete'), 'pending');
  assert.equal(classifyCheckoutSessionReconcileState(null, 'open'), 'pending');
});

test('failed response helper fixes request and ownership error mapping', () => {
  assert.deepEqual(buildReconcileFailedResponse('invalid_request'), {
    body: {
      success: false,
      state: 'failed',
      reason: 'invalid_request',
      error: 'session_id is required',
    },
    status: 400,
  });

  assert.deepEqual(buildReconcileFailedResponse('unauthorized'), {
    body: {
      success: false,
      state: 'failed',
      reason: 'unauthorized',
      error: '\u30ed\u30b0\u30a4\u30f3\u304c\u5fc5\u8981\u3067\u3059',
    },
    status: 401,
  });

  assert.deepEqual(buildReconcileFailedResponse('unknown_session'), {
    body: {
      success: false,
      state: 'failed',
      reason: 'unknown_session',
      error: 'unknown session id',
    },
    status: 404,
  });

  assert.deepEqual(buildReconcileFailedResponse('forbidden_session'), {
    body: {
      success: false,
      state: 'failed',
      reason: 'forbidden_session',
      error: 'forbidden session id',
    },
    status: 403,
  });
});

test('failed response helper fixes metadata mismatch and internal error mapping', () => {
  assert.deepEqual(buildReconcileFailedResponse('metadata_user_mismatch'), {
    body: {
      success: false,
      state: 'failed',
      reason: 'metadata_user_mismatch',
      error: 'metadata user mismatch',
    },
    status: 409,
  });

  assert.deepEqual(buildReconcileFailedResponse('metadata_plan_id_mismatch'), {
    body: {
      success: false,
      state: 'failed',
      reason: 'metadata_plan_id_mismatch',
      error: 'metadata plan_id mismatch',
    },
    status: 409,
  });

  assert.deepEqual(buildReconcileFailedResponse('reconcile_internal_error', {
    error: 'database unavailable',
  }), {
    body: {
      success: false,
      state: 'failed',
      reason: 'reconcile_internal_error',
      error: 'database unavailable',
    },
    status: 500,
  });
});

test('failed response helper preserves stored and checkout failure shapes', () => {
  assert.deepEqual(buildReconcileFailedResponse('payment_failed', {
    paymentStatus: 'failed',
    failureCode: 'card_declined',
    failureMessage: 'Card declined',
  }), {
    body: {
      success: true,
      state: 'failed',
      reason: 'payment_failed',
      paymentStatus: 'failed',
      failureCode: 'card_declined',
      failureMessage: 'Card declined',
    },
  });

  assert.deepEqual(buildReconcileFailedResponse('payment_failed', {
    paymentStatus: 'unpaid',
  }), {
    body: {
      success: true,
      state: 'failed',
      reason: 'payment_failed',
      paymentStatus: 'unpaid',
    },
  });

  assert.deepEqual(buildReconcileFailedResponse('session_cancelled'), {
    body: {
      success: true,
      state: 'failed',
      reason: 'session_cancelled',
      paymentStatus: 'cancelled',
    },
  });

  assert.deepEqual(buildReconcileFailedResponse('session_cancelled', {
    paymentStatus: 'paid',
  }), {
    body: {
      success: true,
      state: 'failed',
      reason: 'session_cancelled',
      paymentStatus: 'paid',
    },
  });
});

test('pending response helper preserves retryable reconcile shapes', () => {
  assert.deepEqual(buildReconcilePendingResponse('stripe_session_fetch_failed', null), {
    body: {
      success: true,
      state: 'pending',
      reason: 'stripe_session_fetch_failed',
      paymentStatus: null,
    },
  });

  assert.deepEqual(buildReconcilePendingResponse('payment_not_captured', 'no_payment_required'), {
    body: {
      success: true,
      state: 'pending',
      reason: 'payment_not_captured',
      paymentStatus: 'no_payment_required',
    },
  });

  assert.deepEqual(buildReconcilePendingResponse('customer_not_ready', 'paid'), {
    body: {
      success: true,
      state: 'pending',
      reason: 'customer_not_ready',
      paymentStatus: 'paid',
    },
  });

  assert.deepEqual(buildReconcilePendingResponse('activation_in_progress', 'paid'), {
    body: {
      success: true,
      state: 'pending',
      reason: 'activation_in_progress',
      paymentStatus: 'paid',
    },
  });
});

test('confirmed response helper preserves existing and reconcile success shapes', () => {
  assert.deepEqual(buildReconcileConfirmedResponse('already_active'), {
    body: {
      success: true,
      state: 'confirmed',
      reason: 'already_active',
      source: 'existing',
    },
  });

  assert.deepEqual(buildReconcileConfirmedResponse('payment_confirmed', 'paid'), {
    body: {
      success: true,
      state: 'confirmed',
      reason: 'payment_confirmed',
      paymentStatus: 'paid',
      source: 'reconcile',
    },
  });
});

test('activation error response helper maps known activation errors to reconcile reasons', () => {
  const activationErrors = {
    MISSING_CUSTOMER_ID: 'Missing customer id from Stripe session',
    ACTIVATION_IN_PROGRESS: 'Activation in progress',
    SESSION_CANCELLED: 'Session cancelled',
  };

  assert.deepEqual(buildReconcileActivationErrorResponse(
    activationErrors.MISSING_CUSTOMER_ID,
    'paid',
    activationErrors
  ), {
    body: {
      success: true,
      state: 'pending',
      reason: 'customer_not_ready',
      paymentStatus: 'paid',
    },
  });

  assert.deepEqual(buildReconcileActivationErrorResponse(
    activationErrors.ACTIVATION_IN_PROGRESS,
    'paid',
    activationErrors
  ), {
    body: {
      success: true,
      state: 'pending',
      reason: 'activation_in_progress',
      paymentStatus: 'paid',
    },
  });

  assert.deepEqual(buildReconcileActivationErrorResponse(
    activationErrors.SESSION_CANCELLED,
    'paid',
    activationErrors
  ), {
    body: {
      success: true,
      state: 'failed',
      reason: 'session_cancelled',
      paymentStatus: 'paid',
    },
  });

  assert.equal(buildReconcileActivationErrorResponse(
    'Cannot resolve Stripe subscription ID',
    'paid',
    activationErrors
  ), null);
});
