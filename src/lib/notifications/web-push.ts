import type { SupabaseClient } from '@supabase/supabase-js';
import webpush from 'web-push';
import { getStudyReminderPeriod } from '@/lib/notifications/study-reminders';

type ScanJobPushStatus = 'completed' | 'failed' | 'warning';

type ScanJobPushParams = {
  userId: string;
  jobId: string;
  projectId: string | null;
  projectTitle: string;
  status: ScanJobPushStatus;
  wordCount?: number;
};

type SubscriptionRow = {
  endpoint: string;
  p256dh: string;
  auth: string;
};

type PushDeliveryResult = {
  sent: number;
  removed: number;
  failed: number;
};

type StudyReminderPushParams = {
  userId: string;
  reminderTime: string;
  localDateKey: string;
  timeZone: string;
};

let configuredSignature: string | null = null;

function configureWebPush(): boolean {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  const subject = process.env.VAPID_SUBJECT?.trim() || 'mailto:support@merken.jp';

  if (!publicKey || !privateKey) {
    return false;
  }

  const signature = `${publicKey}:${privateKey}:${subject}`;
  if (configuredSignature === signature) {
    return true;
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);
  configuredSignature = signature;
  return true;
}

function createPayload(params: ScanJobPushParams): string {
  const title = params.status === 'failed'
    ? 'MERKEN: スキャン失敗'
    : params.status === 'warning'
    ? 'MERKEN: 文法抽出なし'
    : 'MERKEN: スキャン完了';
  const body = params.status === 'failed'
    ? `「${params.projectTitle}」のスキャンに失敗しました`
    : params.status === 'warning'
    ? `「${params.projectTitle}」では文法抽出が見つからなかったため、通常抽出に切り替えました`
    : `「${params.projectTitle}」に${params.wordCount ?? 0}語追加されました`;
  const tag = params.status === 'warning'
    ? `scan-job-warning-${params.jobId}`
    : `scan-job-${params.projectId ?? params.jobId}`;

  return JSON.stringify({
    title,
    body,
    tag,
    data: {
      url: params.projectId ? `/project/${params.projectId}` : '/',
      projectId: params.projectId,
      jobId: params.jobId,
      status: params.status,
    },
  });
}

function createStudyReminderPayload(params: StudyReminderPushParams): string {
  const period = getStudyReminderPeriod(params.reminderTime);

  return JSON.stringify({
    title: 'MERKEN: 学習リマインダー',
    body: `${period.label}の単語復習の時間です。今日の学習を始めましょう。`,
    tag: `study-reminder-${params.localDateKey}-${params.reminderTime}`,
    data: {
      url: '/',
      kind: 'study-reminder',
      reminderTime: params.reminderTime,
      localDateKey: params.localDateKey,
      timeZone: params.timeZone,
    },
  });
}

function getWebPushErrorStatusCode(error: unknown): number | null {
  if (!error || typeof error !== 'object' || !("statusCode" in error)) {
    return null;
  }
  const statusCode = (error as { statusCode?: unknown }).statusCode;
  if (typeof statusCode === 'number') {
    return statusCode;
  }
  return null;
}

async function removeInvalidSubscription(supabaseAdmin: SupabaseClient, endpoint: string) {
  await supabaseAdmin
    .from('web_push_subscriptions')
    .delete()
    .eq('endpoint', endpoint);
}

async function sendPushPayloadToUser(
  supabaseAdmin: SupabaseClient,
  userId: string,
  payload: string,
  options: {
    ttl: number;
    urgency?: 'very-low' | 'low' | 'normal' | 'high';
  },
): Promise<PushDeliveryResult> {
  if (!configureWebPush()) {
    return { sent: 0, removed: 0, failed: 0 };
  }

  const { data: subscriptions, error } = await supabaseAdmin
    .from('web_push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('user_id', userId);

  if (error) {
    console.error('Failed to fetch web push subscriptions:', error);
    return { sent: 0, removed: 0, failed: 0 };
  }

  const rows = (subscriptions ?? []) as SubscriptionRow[];
  if (rows.length === 0) {
    return { sent: 0, removed: 0, failed: 0 };
  }

  const result: PushDeliveryResult = { sent: 0, removed: 0, failed: 0 };

  await Promise.all(
    rows.map(async (row) => {
      const subscription: webpush.PushSubscription = {
        endpoint: row.endpoint,
        expirationTime: null,
        keys: {
          p256dh: row.p256dh,
          auth: row.auth,
        },
      };

      try {
        await webpush.sendNotification(subscription, payload, {
          TTL: options.ttl,
          urgency: options.urgency ?? 'normal',
        });
        result.sent += 1;
      } catch (error) {
        const statusCode = getWebPushErrorStatusCode(error);
        if (statusCode === 404 || statusCode === 410) {
          await removeInvalidSubscription(supabaseAdmin, row.endpoint);
          result.removed += 1;
          return;
        }
        result.failed += 1;
        console.error('Failed to send web push notification:', error);
      }
    })
  );

  return result;
}

export async function sendScanJobPushNotifications(
  supabaseAdmin: SupabaseClient,
  params: ScanJobPushParams,
): Promise<void> {
  const payload = createPayload(params);
  await sendPushPayloadToUser(supabaseAdmin, params.userId, payload, {
    ttl: 3600,
    urgency: 'normal',
  });
}

export async function sendStudyReminderPushNotifications(
  supabaseAdmin: SupabaseClient,
  params: StudyReminderPushParams,
): Promise<PushDeliveryResult> {
  const payload = createStudyReminderPayload(params);
  return sendPushPayloadToUser(supabaseAdmin, params.userId, payload, {
    ttl: 900,
    urgency: 'normal',
  });
}
