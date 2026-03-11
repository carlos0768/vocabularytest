import type { Subscription } from '@/types';

type DisplayableSubscription = Pick<
  Subscription,
  'proSource' | 'testProExpiresAt' | 'currentPeriodEnd' | 'cancelAtPeriodEnd'
>;

export type SubscriptionDisplayDate = {
  label: '次回更新' | '解約予定日' | '有効期限';
  isoDate: string;
};

export function getSubscriptionDisplayDate(
  subscription: DisplayableSubscription | null | undefined
): SubscriptionDisplayDate | null {
  if (!subscription) {
    return null;
  }

  if (subscription.proSource === 'test') {
    if (!subscription.testProExpiresAt) {
      return null;
    }

    return {
      label: '有効期限',
      isoDate: subscription.testProExpiresAt,
    };
  }

  if (
    (subscription.proSource === 'billing' || subscription.proSource === 'appstore') &&
    subscription.currentPeriodEnd
  ) {
    return {
      label: subscription.cancelAtPeriodEnd ? '解約予定日' : '次回更新',
      isoDate: subscription.currentPeriodEnd,
    };
  }

  return null;
}
