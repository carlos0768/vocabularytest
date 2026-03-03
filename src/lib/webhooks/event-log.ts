import { createHash } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

export type WebhookClaim = {
  shouldProcess: boolean;
};

type ClaimWebhookEventParams = {
  eventId: string;
  eventType: string;
  payloadHash: string;
  staleAfterSeconds?: number;
};

type MarkWebhookEventParams = {
  eventId: string;
  eventType: string;
  payloadHash: string;
};

type MarkWebhookEventFailedParams = MarkWebhookEventParams & {
  lastError: string;
};

export function hashPayload(payload: string): string {
  return createHash('sha256').update(payload).digest('hex');
}

export async function claimWebhookEvent(
  supabaseAdmin: SupabaseClient,
  params: ClaimWebhookEventParams
): Promise<WebhookClaim> {
  const { eventId, eventType, payloadHash, staleAfterSeconds = 300 } = params;
  const { data, error } = await supabaseAdmin.rpc('claim_webhook_event', {
    p_id: eventId,
    p_type: eventType,
    p_payload_hash: payloadHash,
    p_stale_after_seconds: staleAfterSeconds,
  });

  if (error) {
    throw error;
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    throw new Error('Failed to claim webhook event');
  }

  return {
    shouldProcess: Boolean((row as Record<string, unknown>).should_process),
  };
}

export async function markWebhookEventProcessed(
  supabaseAdmin: SupabaseClient,
  params: MarkWebhookEventParams
) {
  const { eventId, eventType, payloadHash } = params;
  const nowIso = new Date().toISOString();
  const { error } = await supabaseAdmin
    .from('webhook_events')
    .update({
      type: eventType,
      payload_hash: payloadHash,
      status: 'processed',
      processed_at: nowIso,
      last_error: null,
      updated_at: nowIso,
    })
    .eq('id', eventId);

  if (error) {
    throw error;
  }
}

export async function markWebhookEventFailed(
  supabaseAdmin: SupabaseClient,
  params: MarkWebhookEventFailedParams
) {
  const { eventId, eventType, payloadHash, lastError } = params;
  const { error } = await supabaseAdmin
    .from('webhook_events')
    .update({
      type: eventType,
      payload_hash: payloadHash,
      status: 'failed',
      last_error: lastError,
      updated_at: new Date().toISOString(),
    })
    .eq('id', eventId);

  if (error) {
    console.error('Failed to mark webhook as failed:', error);
  }
}
