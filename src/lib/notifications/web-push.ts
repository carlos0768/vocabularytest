import type { SupabaseClient } from '@supabase/supabase-js';
import webpush from 'web-push';

type ScanJobPushStatus = 'completed' | 'failed';

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
  const title = params.status === 'failed' ? 'MERKEN: スキャン失敗' : 'MERKEN: スキャン完了';
  const body = params.status === 'failed'
    ? `「${params.projectTitle}」のスキャンに失敗しました`
    : `「${params.projectTitle}」に${params.wordCount ?? 0}語追加されました`;

  return JSON.stringify({
    title,
    body,
    tag: `scan-job-${params.projectId ?? params.jobId}`,
    data: {
      url: params.projectId ? `/project/${params.projectId}` : '/',
      projectId: params.projectId,
      jobId: params.jobId,
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

export async function sendScanJobPushNotifications(
  supabaseAdmin: SupabaseClient,
  params: ScanJobPushParams,
): Promise<void> {
  if (!configureWebPush()) {
    return;
  }

  const { data: subscriptions, error } = await supabaseAdmin
    .from('web_push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('user_id', params.userId);

  if (error) {
    console.error('Failed to fetch web push subscriptions:', error);
    return;
  }

  const rows = (subscriptions ?? []) as SubscriptionRow[];
  if (rows.length === 0) {
    return;
  }

  const payload = createPayload(params);

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
          TTL: 3600,
          urgency: 'normal',
        });
      } catch (error) {
        const statusCode = getWebPushErrorStatusCode(error);
        if (statusCode === 404 || statusCode === 410) {
          await removeInvalidSubscription(supabaseAdmin, row.endpoint);
          return;
        }
        console.error('Failed to send web push notification:', error);
      }
    })
  );
}
