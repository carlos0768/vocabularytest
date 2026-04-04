export type ReconcilePaymentState = 'confirmed' | 'failed' | 'pending';

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
