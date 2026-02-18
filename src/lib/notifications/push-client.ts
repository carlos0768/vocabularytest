export type PushSubscriptionSetupResult =
  | 'enabled'
  | 'unsupported'
  | 'missing-vapid-key'
  | 'permission-default'
  | 'permission-denied'
  | 'error';

function base64UrlToArrayBuffer(value: string): ArrayBuffer {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padding = '='.repeat((4 - (normalized.length % 4)) % 4);
  const base64 = normalized + padding;
  const raw = atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) {
    bytes[i] = raw.charCodeAt(i);
  }
  return bytes.buffer;
}

function isWebPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'Notification' in window &&
    'serviceWorker' in navigator &&
    'PushManager' in window
  );
}

async function getServiceWorkerRegistration(timeoutMs = 4000): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) {
    return null;
  }

  const existing = await navigator.serviceWorker.getRegistration();
  if (existing) {
    return existing;
  }

  try {
    const timedReady = await Promise.race<ServiceWorkerRegistration | null>([
      navigator.serviceWorker.ready,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
    ]);
    return timedReady;
  } catch {
    return null;
  }
}

async function saveSubscription(
  accessToken: string,
  subscription: PushSubscription,
): Promise<boolean> {
  const json = subscription.toJSON();
  const endpoint = subscription.endpoint;
  const p256dh = json.keys?.p256dh;
  const auth = json.keys?.auth;

  if (!endpoint || !p256dh || !auth) {
    return false;
  }

  const response = await fetch('/api/notifications/push-subscription', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      endpoint,
      keys: { p256dh, auth },
      userAgent: navigator.userAgent,
    }),
  });

  return response.ok;
}

async function subscribeWithVapidKey(
  registration: ServiceWorkerRegistration,
  vapidPublicKey: string,
): Promise<PushSubscription> {
  return registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: base64UrlToArrayBuffer(vapidPublicKey),
  });
}

export async function ensureWebPushSubscription(options: {
  accessToken: string;
  requestPermission?: boolean;
}): Promise<PushSubscriptionSetupResult> {
  const { accessToken, requestPermission = false } = options;

  if (!isWebPushSupported()) {
    return 'unsupported';
  }

  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!vapidPublicKey) {
    return 'missing-vapid-key';
  }

  let permission: NotificationPermission = Notification.permission;
  if (permission === 'default' && requestPermission) {
    try {
      permission = await Notification.requestPermission();
    } catch (error) {
      // Some browsers/extensions can abort permission flow unexpectedly.
      console.warn('Web push permission request aborted:', error);
      return 'permission-default';
    }
  }

  if (permission === 'default') {
    return 'permission-default';
  }

  if (permission === 'denied') {
    return 'permission-denied';
  }

  try {
    const registration = await getServiceWorkerRegistration();
    if (!registration) {
      return 'unsupported';
    }

    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await subscribeWithVapidKey(registration, vapidPublicKey);
    }

    let saved = await saveSubscription(accessToken, subscription);
    if (saved) {
      return 'enabled';
    }

    // Rare case: stale/invalid subscription object. Recreate once and retry.
    await subscription.unsubscribe();
    subscription = await subscribeWithVapidKey(registration, vapidPublicKey);
    saved = await saveSubscription(accessToken, subscription);

    return saved ? 'enabled' : 'error';
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      console.warn('Web push subscription aborted by browser/push service:', error.message);
    } else {
      console.error('Failed to ensure web push subscription:', error);
    }
    return 'error';
  }
}
