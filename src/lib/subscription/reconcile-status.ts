export type ReconcilePaymentState = 'confirmed' | 'failed' | 'pending';
export type ReconcilePaymentStatusValue = string | null;

export type ReconcilePendingReason =
  | 'stripe_session_fetch_failed'
  | 'payment_not_captured'
  | 'customer_not_ready'
  | 'activation_in_progress';

export type ReconcileFailedReason =
  | 'invalid_request'
  | 'unauthorized'
  | 'unknown_session'
  | 'forbidden_session'
  | 'payment_failed'
  | 'session_cancelled'
  | 'metadata_user_mismatch'
  | 'metadata_plan_id_mismatch'
  | 'reconcile_internal_error';

export type ReconcileConfirmedReason = 'already_active' | 'payment_confirmed';

export type ReconcileResponseBody = Record<string, unknown> & {
  success: boolean;
  state: ReconcilePaymentState;
  reason: ReconcilePendingReason | ReconcileFailedReason | ReconcileConfirmedReason;
};

export type ReconcileResponseDescriptor = {
  body: ReconcileResponseBody;
  status?: number;
};

type ReconcileFailedResponseOptions = {
  paymentStatus?: ReconcilePaymentStatusValue;
  failureCode?: string | null;
  failureMessage?: string | null;
  error?: string;
};

export type ReconcileActivationErrorMessages = {
  MISSING_CUSTOMER_ID: string;
  ACTIVATION_IN_PROGRESS: string;
  SESSION_CANCELLED: string;
};

const CAPTURED_STATUSES = new Set([
  'complete', 'paid', 'succeeded',
  // Legacy KOMOJU statuses kept for backward-compatible reconciliation
  'captured', 'completed',
]);

const FAILED_STATUSES = new Set([
  'failed', 'expired', 'cancelled', 'canceled',
  // Legacy KOMOJU statuses
  'declined', 'rejected',
]);

function normalizeStatus(status: string | null | undefined): string | null {
  if (!status) return null;
  const normalized = status.trim().toLowerCase();
  return normalized !== '' ? normalized : null;
}

export function isCapturedStatus(status: string | null | undefined): boolean {
  const normalized = normalizeStatus(status);
  return normalized ? CAPTURED_STATUSES.has(normalized) : false;
}

export function isFailedStatus(status: string | null | undefined): boolean {
  const normalized = normalizeStatus(status);
  return normalized ? FAILED_STATUSES.has(normalized) : false;
}

export function classifyPaymentStatus(status: string | null | undefined): ReconcilePaymentState {
  if (isCapturedStatus(status)) return 'confirmed';
  if (isFailedStatus(status)) return 'failed';
  return 'pending';
}

export function classifyCheckoutSessionReconcileState(
  paymentStatus: string | null | undefined,
  checkoutStatus: string | null | undefined
): ReconcilePaymentState {
  const normalizedPaymentStatus = normalizeStatus(paymentStatus);
  if (normalizedPaymentStatus === 'paid') return 'confirmed';

  const normalizedCheckoutStatus = normalizeStatus(checkoutStatus);
  if (normalizedPaymentStatus === 'unpaid' || normalizedCheckoutStatus === 'expired') {
    return 'failed';
  }

  return 'pending';
}

function reconcileResponse(
  body: ReconcileResponseBody,
  status?: number
): ReconcileResponseDescriptor {
  return status === undefined ? { body } : { body, status };
}

export function buildReconcilePendingResponse(
  reason: ReconcilePendingReason,
  paymentStatus: ReconcilePaymentStatusValue
): ReconcileResponseDescriptor {
  return reconcileResponse({
    success: true,
    state: 'pending',
    reason,
    paymentStatus,
  });
}

export function buildReconcileConfirmedResponse(
  reason: ReconcileConfirmedReason,
  paymentStatus?: ReconcilePaymentStatusValue
): ReconcileResponseDescriptor {
  if (reason === 'already_active') {
    return reconcileResponse({
      success: true,
      state: 'confirmed',
      reason,
      source: 'existing',
    });
  }

  return reconcileResponse({
    success: true,
    state: 'confirmed',
    reason,
    paymentStatus: paymentStatus ?? null,
    source: 'reconcile',
  });
}

export function buildReconcileFailedResponse(
  reason: ReconcileFailedReason,
  options: ReconcileFailedResponseOptions = {}
): ReconcileResponseDescriptor {
  switch (reason) {
    case 'invalid_request':
      return reconcileResponse(
        {
          success: false,
          state: 'failed',
          reason,
          error: 'session_id is required',
        },
        400
      );
    case 'unauthorized':
      return reconcileResponse(
        {
          success: false,
          state: 'failed',
          reason,
          error: '\u30ed\u30b0\u30a4\u30f3\u304c\u5fc5\u8981\u3067\u3059',
        },
        401
      );
    case 'unknown_session':
      return reconcileResponse(
        {
          success: false,
          state: 'failed',
          reason,
          error: 'unknown session id',
        },
        404
      );
    case 'forbidden_session':
      return reconcileResponse(
        {
          success: false,
          state: 'failed',
          reason,
          error: 'forbidden session id',
        },
        403
      );
    case 'metadata_user_mismatch':
      return reconcileResponse(
        {
          success: false,
          state: 'failed',
          reason,
          error: 'metadata user mismatch',
        },
        409
      );
    case 'metadata_plan_id_mismatch':
      return reconcileResponse(
        {
          success: false,
          state: 'failed',
          reason,
          error: 'metadata plan_id mismatch',
        },
        409
      );
    case 'payment_failed':
      if ('failureCode' in options || 'failureMessage' in options) {
        return reconcileResponse({
          success: true,
          state: 'failed',
          reason,
          paymentStatus: options.paymentStatus ?? 'failed',
          failureCode: options.failureCode ?? null,
          failureMessage: options.failureMessage ?? null,
        });
      }

      return reconcileResponse({
        success: true,
        state: 'failed',
        reason,
        paymentStatus: options.paymentStatus ?? null,
      });
    case 'session_cancelled':
      return reconcileResponse({
        success: true,
        state: 'failed',
        reason,
        paymentStatus: options.paymentStatus ?? 'cancelled',
      });
    case 'reconcile_internal_error':
      return reconcileResponse(
        {
          success: false,
          state: 'failed',
          reason,
          error: options.error ?? 'reconcile failed',
        },
        500
      );
  }
}

export function buildReconcileActivationErrorResponse(
  errorMessage: string,
  paymentStatus: ReconcilePaymentStatusValue,
  activationErrors: ReconcileActivationErrorMessages
): ReconcileResponseDescriptor | null {
  if (errorMessage === activationErrors.MISSING_CUSTOMER_ID) {
    return buildReconcilePendingResponse('customer_not_ready', paymentStatus);
  }

  if (errorMessage === activationErrors.ACTIVATION_IN_PROGRESS) {
    return buildReconcilePendingResponse('activation_in_progress', paymentStatus);
  }

  if (errorMessage === activationErrors.SESSION_CANCELLED) {
    return buildReconcileFailedResponse('session_cancelled', { paymentStatus });
  }

  return null;
}
