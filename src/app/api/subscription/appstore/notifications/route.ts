import { NextRequest, NextResponse } from 'next/server';
import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js';
import { getAppStoreConfig } from '@/lib/appstore/config';
import {
  type NormalizedAppStoreNotification,
  AppStoreNotificationInputError,
  AppStoreNotificationSignatureError,
  verifyAndNormalizeAppStoreNotification,
} from '@/lib/appstore/notifications';
import {
  claimWebhookEvent,
  hashPayload,
  markWebhookEventFailed,
  markWebhookEventProcessed,
} from '@/lib/webhooks/event-log';

type SubscriptionLookupRow = {
  user_id: string;
  current_period_end: string | null;
};

type SubscriptionTransition = {
  status: 'active' | 'cancelled';
  cancelAtPeriodEnd: boolean;
  cancelRequestedAt: string | null;
};

type ProcessOutcome = 'updated' | 'ignored_test' | 'ignored_product' | 'ignored_notification';

class RetryableNotificationProcessingError extends Error {}

const IMMEDIATE_CANCEL_NOTIFICATION_TYPES = new Set<string>([
  'EXPIRED',
  'GRACE_PERIOD_EXPIRED',
  'REVOKE',
  'REFUND',
]);

const POSITIVE_NOTIFICATION_TYPES = new Set<string>([
  'SUBSCRIBED',
  'DID_RENEW',
  'OFFER_REDEEMED',
  'RENEWAL_EXTENDED',
  'RENEWAL_EXTENSION',
  'REFUND_REVERSED',
  'PRICE_INCREASE',
  'DID_CHANGE_RENEWAL_PREF',
]);

function getSupabaseAdmin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Supabase environment variables not configured');
  }
  return createSupabaseClient(url, key);
}

function normalizeEventTypeSegment(value: string | null | undefined): string {
  const trimmed = value?.trim();
  if (!trimmed) return 'unknown';
  return trimmed.replace(/\s+/g, '_');
}

function toWebhookEventType(notificationType: string, subtype: string | null): string {
  const type = normalizeEventTypeSegment(notificationType);
  const normalizedSubtype = normalizeEventTypeSegment(subtype);
  if (!subtype) {
    return `appstore.${type}`;
  }
  return `appstore.${type}.${normalizedSubtype}`;
}

function isFutureIsoTimestamp(value: string | null, now: Date): boolean {
  if (!value) return false;
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) return false;
  return timestamp > now.getTime();
}

function hasActiveEntitlement(
  notification: NormalizedAppStoreNotification,
  currentPeriodEnd: string | null,
  now: Date
): boolean {
  return (
    isFutureIsoTimestamp(notification.expiresAt ?? currentPeriodEnd, now) ||
    isFutureIsoTimestamp(notification.gracePeriodExpiresAt, now)
  );
}

function resolveSubscriptionTransition(
  notification: NormalizedAppStoreNotification,
  currentPeriodEnd: string | null,
  now: Date
): SubscriptionTransition | null {
  const notificationType = notification.notificationType;
  const subtype = notification.subtype;
  const activeEntitlement = hasActiveEntitlement(notification, currentPeriodEnd, now);

  if (notificationType === 'TEST') {
    return null;
  }

  if (IMMEDIATE_CANCEL_NOTIFICATION_TYPES.has(notificationType)) {
    return {
      status: 'cancelled',
      cancelAtPeriodEnd: false,
      cancelRequestedAt: null,
    };
  }

  if (notificationType === 'DID_FAIL_TO_RENEW') {
    return {
      status: activeEntitlement ? 'active' : 'cancelled',
      cancelAtPeriodEnd: false,
      cancelRequestedAt: null,
    };
  }

  if (notificationType === 'DID_CHANGE_RENEWAL_STATUS') {
    if (subtype === 'AUTO_RENEW_DISABLED') {
      return {
        status: 'active',
        cancelAtPeriodEnd: true,
        cancelRequestedAt: now.toISOString(),
      };
    }

    if (subtype === 'AUTO_RENEW_ENABLED') {
      return {
        status: activeEntitlement ? 'active' : 'cancelled',
        cancelAtPeriodEnd: false,
        cancelRequestedAt: null,
      };
    }

    return {
      status: activeEntitlement ? 'active' : 'cancelled',
      cancelAtPeriodEnd: false,
      cancelRequestedAt: null,
    };
  }

  if (POSITIVE_NOTIFICATION_TYPES.has(notificationType)) {
    return {
      status: activeEntitlement ? 'active' : 'cancelled',
      cancelAtPeriodEnd: false,
      cancelRequestedAt: null,
    };
  }

  return null;
}

function isAllowedAppStoreProductId(productId: string | null, allowedProductIds: string[]): boolean {
  return Boolean(productId && allowedProductIds.includes(productId));
}

function buildSubscriptionUpdatePayload(
  notification: NormalizedAppStoreNotification,
  currentPeriodEnd: string | null,
  now: Date
): Record<string, unknown> | null {
  const transition = resolveSubscriptionTransition(notification, currentPeriodEnd, now);
  if (!transition) return null;

  const nowIso = now.toISOString();
  const updatePayload: Record<string, unknown> = {
    plan: 'pro',
    pro_source: 'appstore',
    status: transition.status,
    test_pro_expires_at: null,
    cancel_at_period_end: transition.cancelAtPeriodEnd,
    cancel_requested_at: transition.cancelRequestedAt,
    appstore_last_verified_at: nowIso,
    updated_at: nowIso,
  };

  if (notification.latestTransactionId) {
    updatePayload.appstore_latest_transaction_id = notification.latestTransactionId;
  }

  if (notification.productId) {
    updatePayload.appstore_product_id = notification.productId;
  }

  if (notification.environment) {
    updatePayload.appstore_environment = notification.environment;
  }

  if (notification.expiresAt) {
    updatePayload.current_period_end = notification.expiresAt;
  }

  return updatePayload;
}

function normalizeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message.slice(0, 2000);
  }
  return String(error).slice(0, 2000);
}

async function findSubscriptionByOriginalTransactionId(
  supabaseAdmin: SupabaseClient,
  originalTransactionId: string
): Promise<SubscriptionLookupRow | null> {
  const { data, error } = await supabaseAdmin
    .from('subscriptions')
    .select('user_id, current_period_end')
    .eq('appstore_original_transaction_id', originalTransactionId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data as SubscriptionLookupRow | null) ?? null;
}

async function updateSubscriptionByOriginalTransactionId(
  supabaseAdmin: SupabaseClient,
  originalTransactionId: string,
  updatePayload: Record<string, unknown>
): Promise<void> {
  const { error } = await supabaseAdmin
    .from('subscriptions')
    .update(updatePayload)
    .eq('appstore_original_transaction_id', originalTransactionId);

  if (error) {
    throw error;
  }
}

type NotificationRouteDeps = {
  createSupabaseAdmin: () => SupabaseClient;
  getAllowedProductIds: () => string[];
  verifyAndNormalizeNotification: (
    signedPayload: string
  ) => Promise<NormalizedAppStoreNotification>;
  hashPayloadFn: (payload: string) => string;
  claimWebhookEventFn: typeof claimWebhookEvent;
  markWebhookEventProcessedFn: typeof markWebhookEventProcessed;
  markWebhookEventFailedFn: typeof markWebhookEventFailed;
  findSubscriptionByOriginalTransactionIdFn: typeof findSubscriptionByOriginalTransactionId;
  updateSubscriptionByOriginalTransactionIdFn: typeof updateSubscriptionByOriginalTransactionId;
  now: () => Date;
};

const defaultDeps: NotificationRouteDeps = {
  createSupabaseAdmin: getSupabaseAdmin,
  getAllowedProductIds: () => getAppStoreConfig().allowedProductIds,
  verifyAndNormalizeNotification: verifyAndNormalizeAppStoreNotification,
  hashPayloadFn: hashPayload,
  claimWebhookEventFn: claimWebhookEvent,
  markWebhookEventProcessedFn: markWebhookEventProcessed,
  markWebhookEventFailedFn: markWebhookEventFailed,
  findSubscriptionByOriginalTransactionIdFn: findSubscriptionByOriginalTransactionId,
  updateSubscriptionByOriginalTransactionIdFn: updateSubscriptionByOriginalTransactionId,
  now: () => new Date(),
};

async function processNotification(
  supabaseAdmin: SupabaseClient,
  notification: NormalizedAppStoreNotification,
  allowedProductIds: string[],
  deps: NotificationRouteDeps
): Promise<ProcessOutcome> {
  if (notification.notificationType === 'TEST') {
    return 'ignored_test';
  }

  if (!isAllowedAppStoreProductId(notification.productId, allowedProductIds)) {
    return 'ignored_product';
  }

  const originalTransactionId = notification.originalTransactionId;
  if (!originalTransactionId) {
    throw new RetryableNotificationProcessingError(
      'originalTransactionId is required to resolve subscription'
    );
  }

  const subscription = await deps.findSubscriptionByOriginalTransactionIdFn(
    supabaseAdmin,
    originalTransactionId
  );
  if (!subscription) {
    throw new RetryableNotificationProcessingError(
      `Subscription not found for originalTransactionId=${originalTransactionId}`
    );
  }

  const updatePayload = buildSubscriptionUpdatePayload(
    notification,
    subscription.current_period_end,
    deps.now()
  );
  if (!updatePayload) {
    return 'ignored_notification';
  }

  await deps.updateSubscriptionByOriginalTransactionIdFn(
    supabaseAdmin,
    originalTransactionId,
    updatePayload
  );

  return 'updated';
}

export async function handleAppStoreNotificationRequest(
  request: Request,
  deps: NotificationRouteDeps = defaultDeps
): Promise<NextResponse> {
  try {
    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid JSON body' },
        { status: 400 }
      );
    }

    const signedPayload =
      typeof payload === 'object' && payload && 'signedPayload' in payload
        ? (payload as { signedPayload?: unknown }).signedPayload
        : null;

    if (typeof signedPayload !== 'string' || !signedPayload.trim()) {
      return NextResponse.json(
        { success: false, error: 'signedPayload is required' },
        { status: 400 }
      );
    }

    const normalized = await deps.verifyAndNormalizeNotification(signedPayload);
    const eventType = toWebhookEventType(normalized.notificationType, normalized.subtype);
    const eventId = `appstore:${normalized.notificationUUID}`;
    const payloadHash = deps.hashPayloadFn(signedPayload);
    const supabaseAdmin = deps.createSupabaseAdmin();

    const claim = await deps.claimWebhookEventFn(supabaseAdmin, {
      eventId,
      eventType,
      payloadHash,
    });
    if (!claim.shouldProcess) {
      return NextResponse.json({ success: true, duplicate: true });
    }

    try {
      const outcome = await processNotification(
        supabaseAdmin,
        normalized,
        deps.getAllowedProductIds(),
        deps
      );
      await deps.markWebhookEventProcessedFn(supabaseAdmin, {
        eventId,
        eventType,
        payloadHash,
      });

      return NextResponse.json({
        success: true,
        outcome,
      });
    } catch (processingError) {
      await deps.markWebhookEventFailedFn(supabaseAdmin, {
        eventId,
        eventType,
        payloadHash,
        lastError: normalizeErrorMessage(processingError),
      });

      console.error('[appstore.notifications] processing failed', processingError);
      return NextResponse.json(
        { success: false, error: 'Webhook processing failed' },
        { status: 500 }
      );
    }
  } catch (error) {
    if (error instanceof AppStoreNotificationInputError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 400 }
      );
    }

    if (error instanceof AppStoreNotificationSignatureError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 401 }
      );
    }

    console.error('[appstore.notifications] unexpected error', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  return handleAppStoreNotificationRequest(request);
}

export const __internal = {
  buildSubscriptionUpdatePayload,
  hasActiveEntitlement,
  isAllowedAppStoreProductId,
  processNotification,
  resolveSubscriptionTransition,
  toWebhookEventType,
};
