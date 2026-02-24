import type { SupabaseClient } from '@supabase/supabase-js';

// Dynamic import to avoid build-time errors when env vars are missing
let apnsClientInstance: InstanceType<typeof import('apns2').ApnsClient> | null = null;
let apnsConfigured = false;

type DeviceTokenRow = {
  device_token: string;
};

type ScanJobApnsParams = {
  userId: string;
  jobId: string;
  projectId: string | null;
  projectTitle: string;
  status: 'completed' | 'failed' | 'warning';
  wordCount?: number;
};

async function getApnsClient(): Promise<InstanceType<typeof import('apns2').ApnsClient> | null> {
  if (apnsClientInstance) return apnsClientInstance;
  if (apnsConfigured) return null; // Already tried and failed

  apnsConfigured = true;

  const teamId = process.env.APNS_TEAM_ID?.trim();
  const keyId = process.env.APNS_KEY_ID?.trim();
  const signingKey = process.env.APNS_SIGNING_KEY?.trim();
  const isProduction = process.env.APNS_ENVIRONMENT?.trim() === 'production';

  if (!teamId || !keyId || !signingKey) {
    console.warn('[APNs] Missing APNS_TEAM_ID, APNS_KEY_ID, or APNS_SIGNING_KEY. iOS push disabled.');
    return null;
  }

  // The signing key may be stored as a single-line string with literal \n
  // Convert to actual newlines for the JWT signer
  const formattedKey = signingKey.replace(/\\n/g, '\n');

  try {
    const { ApnsClient, Host } = await import('apns2');

    apnsClientInstance = new ApnsClient({
      team: teamId,
      keyId: keyId,
      signingKey: formattedKey,
      defaultTopic: process.env.APNS_BUNDLE_ID?.trim() || 'com.merken.iosnative',
      host: isProduction ? Host.production : Host.development,
    });

    console.log(`[APNs] Client configured (${isProduction ? 'production' : 'sandbox'})`);
    return apnsClientInstance;
  } catch (error) {
    console.error('[APNs] Failed to initialize client:', error);
    return null;
  }
}

function buildNotificationContent(params: ScanJobApnsParams): {
  title: string;
  body: string;
  data: Record<string, unknown>;
} {
  const title = params.status === 'failed'
    ? 'スキャン失敗'
    : params.status === 'warning'
    ? '文法抽出なし'
    : 'スキャン完了';

  const body = params.status === 'failed'
    ? `「${params.projectTitle}」のスキャンに失敗しました`
    : params.status === 'warning'
    ? `「${params.projectTitle}」では文法抽出が見つかりませんでした`
    : `「${params.projectTitle}」に${params.wordCount ?? 0}語追加されました`;

  return {
    title,
    body,
    data: {
      url: params.projectId ? `/project/${params.projectId}` : '/',
      projectId: params.projectId,
      jobId: params.jobId,
      status: params.status,
    },
  };
}

async function removeInvalidToken(supabaseAdmin: SupabaseClient, deviceToken: string) {
  await supabaseAdmin
    .from('ios_device_tokens')
    .delete()
    .eq('device_token', deviceToken);
}

export async function sendScanJobApnsNotifications(
  supabaseAdmin: SupabaseClient,
  params: ScanJobApnsParams,
): Promise<void> {
  const client = await getApnsClient();
  if (!client) return;

  const { data: tokens, error } = await supabaseAdmin
    .from('ios_device_tokens')
    .select('device_token')
    .eq('user_id', params.userId);

  if (error) {
    console.error('[APNs] Failed to fetch device tokens:', error);
    return;
  }

  const rows = (tokens ?? []) as DeviceTokenRow[];
  if (rows.length === 0) return;

  const content = buildNotificationContent(params);

  // Dynamic import to get the Notification class
  const { Notification } = await import('apns2');

  await Promise.all(
    rows.map(async (row) => {
      const notification = new Notification(row.device_token, {
        alert: {
          title: content.title,
          body: content.body,
        },
        sound: 'default',
        data: content.data,
        collapseId: `scan-${params.jobId}`,
      });

      try {
        await client.send(notification);
      } catch (error: unknown) {
        // Check for invalid token errors (BadDeviceToken, Unregistered, etc.)
        const reason = (error as { reason?: string })?.reason;
        if (reason === 'BadDeviceToken' || reason === 'Unregistered' || reason === 'ExpiredToken') {
          console.warn(`[APNs] Removing invalid token (${reason}): ${row.device_token.slice(0, 8)}...`);
          await removeInvalidToken(supabaseAdmin, row.device_token);
          return;
        }
        console.error('[APNs] Failed to send notification:', error);
      }
    })
  );
}
