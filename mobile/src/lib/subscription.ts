import type { Subscription } from '../types';

type ProSource = Subscription['proSource'] | null | undefined;

function resolveProSource(source: ProSource): Subscription['proSource'] | null {
  if (
    source === 'none'
    || source === 'billing'
    || source === 'test'
    || source === 'appstore'
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
  subscription?: Subscription | null,
  now: Date = new Date()
): boolean {
  if (!subscription) return false;
  if (subscription.status !== 'active' || subscription.plan !== 'pro') {
    return false;
  }

  const source = resolveProSource(subscription.proSource);

  if (source === 'test') {
    return !hasSubscriptionPeriodEnded(subscription.testProExpiresAt, now);
  }

  if (source === 'billing' || source === 'appstore') {
    return !hasSubscriptionPeriodEnded(subscription.currentPeriodEnd, now);
  }

  if (source === 'none') {
    return false;
  }

  return !hasSubscriptionPeriodEnded(subscription.currentPeriodEnd, now);
}

export function getEffectiveSubscriptionStatus(
  status?: Subscription['status'] | null,
  plan?: Subscription['plan'] | null,
  proSource?: Subscription['proSource'] | null,
  testProExpiresAt?: string | null,
  currentPeriodEnd?: string | null,
  now: Date = new Date()
): Subscription['status'] {
  if (status === 'active' && plan === 'pro') {
    const source = resolveProSource(proSource);

    if (source === 'test') {
      if (hasSubscriptionPeriodEnded(testProExpiresAt, now)) {
        return 'cancelled';
      }
    } else if (source === 'billing' || source === 'appstore') {
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
    status === 'free'
    || status === 'active'
    || status === 'cancelled'
    || status === 'past_due'
  ) {
    return status;
  }

  return 'free';
}

export function wasProUser(subscription?: Subscription | null): boolean {
  if (!subscription) return false;
  return subscription.plan === 'pro' && !isActiveProSubscription(subscription);
}
