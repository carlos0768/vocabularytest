import type { SubscriptionStatus } from '@/types';

type SubscriptionShape = {
  status?: string | null;
  plan?: string | null;
  proSource?: 'none' | 'billing' | 'test' | string | null;
  testProExpiresAt?: string | null;
  currentPeriodEnd?: string | null;
};

function resolveProSource(source?: string | null): 'none' | 'billing' | 'test' | null {
  if (source === 'none' || source === 'billing' || source === 'test') {
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

  if (source === 'billing') {
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
    } else if (source === 'billing') {
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
