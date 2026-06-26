import type { SupabaseClient } from '@supabase/supabase-js';
import webpush from 'web-push';
import { getStudyReminderPeriod } from '@/lib/notifications/study-reminders';
import {
  buildStudyReminderQuizUrl,
  formatStudyReminderBody,
  pickStudyReminderWords,
  type StudyReminderWordPick,
} from '@/lib/notifications/study-reminder-words';

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

type FollowPushParams = {
  userId: string;
  followId: string;
  followerAccountId: string;
  followerUsername: string | null;
  status: 'active' | 'pending';
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

function createStudyReminderPayload(
  params: StudyReminderPushParams,
  wordPicks: StudyReminderWordPick[],
): string {
  const period = getStudyReminderPeriod(params.reminderTime);

  return JSON.stringify({
    title: 'MERKEN: 学習リマインダー',
    body: formatStudyReminderBody(period.label, wordPicks),
    tag: `study-reminder-${params.localDateKey}-${params.reminderTime}`,
    data: {
      url: buildStudyReminderQuizUrl(wordPicks.map((pick) => pick.id)),
      kind: 'study-reminder',
      reminderTime: params.reminderTime,
      localDateKey: params.localDateKey,
      timeZone: params.timeZone,
    },
  });
}

function createFollowPayload(params: FollowPushParams): string {
  const actor = params.followerUsername?.trim() || `@${params.followerAccountId}`;
  const isPending = params.status === 'pending';

  return JSON.stringify({
    title: isPending ? 'MERKEN: フォローリクエスト' : 'MERKEN: 新しいフォロワー',
    body: isPending
      ? `${actor}さんからフォローリクエストが届きました`
      : `${actor}さんにフォローされました`,
    tag: `follow-${params.followId}`,
    data: {
      url: '/',
      kind: 'follow',
      followId: params.followId,
      status: params.status,
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

type GroupProjectAddedPushParams = {
  recipientUserIds: string[];
  groupId: string;
  groupName: string;
  projectTitle: string;
  actorName?: string | null;
};

function createGroupProjectAddedPayload(params: GroupProjectAddedPushParams): string {
  const actor = params.actorName ? `${params.actorName}さんが` : '';
  return JSON.stringify({
    title: `MERKEN: ${params.groupName}`,
    body: `${actor}「${params.projectTitle}」を追加しました！`,
    tag: `group-project-${params.groupId}`,
    data: {
      url: `/groups/${params.groupId}`,
      kind: 'group-project-added',
      groupId: params.groupId,
    },
  });
}

export async function sendGroupProjectAddedPushNotifications(
  supabaseAdmin: SupabaseClient,
  params: GroupProjectAddedPushParams,
): Promise<void> {
  const recipients = Array.from(new Set(params.recipientUserIds.filter(Boolean)));
  if (recipients.length === 0) return;

  const payload = createGroupProjectAddedPayload(params);
  await Promise.all(
    recipients.map((userId) =>
      sendPushPayloadToUser(supabaseAdmin, userId, payload, {
        ttl: 86400,
        urgency: 'low',
      }),
    ),
  );
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
  let wordPicks: StudyReminderWordPick[] = [];
  try {
    wordPicks = await pickStudyReminderWords(supabaseAdmin, params.userId);
  } catch (error) {
    console.error('[study-reminders] failed to pick reminder words:', error);
  }
  const payload = createStudyReminderPayload(params, wordPicks);
  return sendPushPayloadToUser(supabaseAdmin, params.userId, payload, {
    ttl: 900,
    urgency: 'normal',
  });
}

export async function sendFollowPushNotification(
  supabaseAdmin: SupabaseClient,
  params: FollowPushParams,
): Promise<PushDeliveryResult> {
  const payload = createFollowPayload(params);
  return sendPushPayloadToUser(supabaseAdmin, params.userId, payload, {
    ttl: 3600,
    urgency: 'normal',
  });
}
