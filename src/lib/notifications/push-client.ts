export type PushSubscriptionSetupResult =
  | 'enabled'
  | 'unsupported'
  | 'missing-vapid-key'
  | 'invalid-vapid-key'
  | 'permission-default'
  | 'permission-denied'
  | 'service-worker-unavailable'
  | 'push-service-error'
  | 'subscription-save-failed'
  | 'error';

function normalizeVapidPublicKey(value: string): string {
  const trimmed = value.trim();
  const quote = trimmed[0];
  if ((quote === '"' || quote === "'") && trimmed.endsWith(quote)) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function decodeVapidPublicKey(value: string): ArrayBuffer | null {
  const publicKey = normalizeVapidPublicKey(value);
  if (!publicKey || publicKey === 'your-vapid-public-key') {
    return null;
  }

  if (!/^[A-Za-z0-9+/_-]+=*$/.test(publicKey)) {
    return null;
  }

  const normalized = publicKey.replace(/-/g, '+').replace(/_/g, '/');
  const padding = '='.repeat((4 - (normalized.length % 4)) % 4);

  let raw = '';
  try {
    raw = atob(normalized + padding);
  } catch {
    return null;
  }

  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) {
    bytes[i] = raw.charCodeAt(i);
  }

  // Web Push VAPID keys are uncompressed P-256 public keys.
  if (bytes.length !== 65 || bytes[0] !== 0x04) {
    return null;
  }

  return bytes.buffer;
}

function bufferSourceToUint8Array(value: BufferSource): Uint8Array {
  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value);
  }

  return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
}

function bufferSourcesEqual(first: BufferSource, second: BufferSource): boolean {
  const firstBytes = bufferSourceToUint8Array(first);
  const secondBytes = bufferSourceToUint8Array(second);
  if (firstBytes.length !== secondBytes.length) {
    return false;
  }

  for (let index = 0; index < firstBytes.length; index += 1) {
    if (firstBytes[index] !== secondBytes[index]) {
      return false;
    }
  }

  return true;
}

function subscriptionUsesApplicationServerKey(
  subscription: PushSubscription,
  applicationServerKey: BufferSource,
): boolean {
  const existingKey = subscription.options.applicationServerKey;
  if (!existingKey) {
    return true;
  }

  return bufferSourcesEqual(existingKey, applicationServerKey);
}

function isWebPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'Notification' in window &&
    'serviceWorker' in navigator &&
    'PushManager' in window
  );
}

async function getServiceWorkerRegistration(timeoutMs = 8000): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) {
    return null;
  }

  try {
    const existing = await navigator.serviceWorker.getRegistration('/');
    if (existing?.active) {
      return existing;
    }

    if (!existing) {
      await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    }

    const timedReady = await Promise.race<ServiceWorkerRegistration | null>([
      navigator.serviceWorker.ready,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
    ]);
    return timedReady?.active ? timedReady : null;
  } catch (error) {
    console.warn('Web push service worker registration unavailable:', error);
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
  applicationServerKey: ArrayBuffer,
): Promise<PushSubscription> {
  return registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey,
  });
}

function getSubscriptionFailureResult(error: unknown): PushSubscriptionSetupResult {
  if (error instanceof DOMException) {
    if (error.name === 'AbortError') {
      return 'push-service-error';
    }

    if (error.name === 'NotAllowedError') {
      return 'permission-denied';
    }

    if (
      error.name === 'InvalidAccessError' ||
      error.name === 'InvalidStateError' ||
      error.name === 'NotSupportedError'
    ) {
      return 'invalid-vapid-key';
    }
  }

  if (error instanceof TypeError) {
    const message = error.message.toLowerCase();
    if (message.includes('applicationserverkey') || message.includes('application server key')) {
      return 'invalid-vapid-key';
    }
  }

  return 'error';
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

  const applicationServerKey = decodeVapidPublicKey(vapidPublicKey);
  if (!applicationServerKey) {
    return 'invalid-vapid-key';
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
      return 'service-worker-unavailable';
    }

    let subscription = await registration.pushManager.getSubscription();
    if (subscription && !subscriptionUsesApplicationServerKey(subscription, applicationServerKey)) {
      await subscription.unsubscribe();
      subscription = null;
    }

    if (!subscription) {
      subscription = await subscribeWithVapidKey(registration, applicationServerKey);
    }

    let saved = await saveSubscription(accessToken, subscription);
    if (saved) {
      return 'enabled';
    }

    // Rare case: stale/invalid subscription object. Recreate once and retry.
    await subscription.unsubscribe();
    subscription = await subscribeWithVapidKey(registration, applicationServerKey);
    saved = await saveSubscription(accessToken, subscription);

    return saved ? 'enabled' : 'subscription-save-failed';
  } catch (error) {
    const result = getSubscriptionFailureResult(error);
    if (result === 'push-service-error' && error instanceof DOMException) {
      console.warn('Web push subscription aborted by browser/push service:', error.message);
    } else if (result === 'invalid-vapid-key') {
      console.warn('Web push subscription failed because the VAPID public key is invalid:', error);
    } else {
      console.error('Failed to ensure web push subscription:', error);
    }
    return result;
  }
}
