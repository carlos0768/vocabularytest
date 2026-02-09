export type ReconcilePaymentState = 'confirmed' | 'failed' | 'pending';

const CAPTURED_STATUSES = new Set(['captured', 'completed', 'complete', 'paid']);
const FAILED_STATUSES = new Set([
  'failed',
  'declined',
  'expired',
  'cancelled',
  'canceled',
  'rejected',
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
