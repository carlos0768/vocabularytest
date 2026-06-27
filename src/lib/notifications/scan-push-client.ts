'use client';

import { ensureWebPushSubscription } from '@/lib/notifications/push-client';

export async function ensureBackgroundScanPushSubscription(
  accessToken: string,
  logContext: string,
): Promise<void> {
  try {
    const result = await ensureWebPushSubscription({
      accessToken,
      requestPermission: true,
    });

    if (result !== 'enabled') {
      console.warn(`${logContext} web push subscription was not enabled:`, result);
    }
  } catch (error) {
    console.warn(`${logContext} web push subscription setup failed:`, error);
  }
}
