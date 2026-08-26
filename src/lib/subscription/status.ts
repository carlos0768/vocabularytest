import type { SubscriptionStatus } from '@/types';

type SubscriptionShape = {
  status?: string | null;
  plan?: string | null;
  proSource?: 'none' | 'billing' | 'test' | 'appstore' | 'paypay' | string | null;
  testProExpiresAt?: string | null;
  currentPeriodEnd?: string | null;
};

// Sources whose entitlement is bounded by current_period_end. Keep in sync with
// the is_active_pro() SQL function — RLS gates every Pro write through it.
const PERIOD_BASED_PRO_SOURCES = new Set(['billing', 'appstore', 'paypay']);

function resolveProSource(
  source?: string | null
): 'none' | 'billing' | 'test' | 'appstore' | 'paypay' | null {
  if (
    source === 'none' ||
    source === 'billing' ||
    source === 'test' ||
    source === 'appstore' ||
    source === 'paypay'
  ) {
    return source;
  }
  return null;
}

export function hasSubscriptionPeriodEnded(
  currentPeriodEnd?: string | null,
  now: Date = new Date()
): boolean {
  if (!currentPeriodEnd) return false;
  const periodEnd = new Date(currentPeriodEnd);
  if (Number.isNaN(periodEnd.getTime())) return false;
  return periodEnd.getTime() <= now.getTime();
}

export function isActiveProSubscription(
  subscription?: SubscriptionShape | null,
  now: Date = new Date()
): boolean {
  if (!subscription) return false;
  if (subscription.status !== 'active' || subscription.plan !== 'pro') {
    return false;
  }

  const source = resolveProSource(subscription.proSource);

  if (source === 'test') {
    return !hasSubscriptionPeriodEnded(subscription.testProExpiresAt ?? null, now);
  }

  if (source !== null && PERIOD_BASED_PRO_SOURCES.has(source)) {
    return !hasSubscriptionPeriodEnded(subscription.currentPeriodEnd ?? null, now);
  }

  if (source === 'none') {
    return false;
  }

  // Backward compatibility for legacy rows that predate pro_source.
  return !hasSubscriptionPeriodEnded(subscription.currentPeriodEnd ?? null, now);
}

export function getEffectiveSubscriptionStatus(
  status?: string | null,
  plan?: string | null,
  proSource?: string | null,
  testProExpiresAt?: string | null,
  currentPeriodEnd?: string | null,
  now: Date = new Date()
): SubscriptionStatus {
  if (status === 'active' && plan === 'pro') {
    const source = resolveProSource(proSource);
    if (source === 'test') {
      if (hasSubscriptionPeriodEnded(testProExpiresAt, now)) {
        return 'cancelled';
      }
    } else if (source !== null && PERIOD_BASED_PRO_SOURCES.has(source)) {
      if (hasSubscriptionPeriodEnded(currentPeriodEnd, now)) {
        return 'cancelled';
      }
    } else if (source === 'none') {
      return 'cancelled';
    } else if (hasSubscriptionPeriodEnded(currentPeriodEnd, now)) {
      return 'cancelled';
    }
  }

  if (
    status === 'free' ||
    status === 'active' ||
    status === 'cancelled' ||
    status === 'past_due'
  ) {
    return status;
  }

  return 'free';
}

/**
 * Detect whether a user was previously a Pro subscriber whose subscription
 * has since expired or been cancelled. These users still have data in
 * Supabase that should remain accessible in read-only mode.
 */
export function wasProUser(
  subscription?: SubscriptionShape | null,
): boolean {
  if (!subscription) return false;
  // The subscription record has plan='pro' but the user is no longer active.
  // This covers: period expired, cancelled, past_due, test expired, etc.
  return subscription.plan === 'pro' && !isActiveProSubscription(subscription);
}
