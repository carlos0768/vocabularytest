import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { calculateEstimatedApiCost } from './pricing';

type EventStatus = 'succeeded' | 'failed';

export type ApiCostEventInput = {
  provider: string;
  model: string;
  operation: string;
  endpoint?: string | null;
  userId?: string | null;
  status?: EventStatus;
  inputTokens?: number | null;
  outputTokens?: number | null;
  thinkingTokens?: number | null;
  totalTokens?: number | null;
  estimatedCostUsd?: number | null;
  estimatedCostJpy?: number | null;
  metadata?: Record<string, unknown>;
};

let adminClient: SupabaseClient | null = null;

function getAdminClient(): SupabaseClient | null {
  if (adminClient) return adminClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;

  adminClient = createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return adminClient;
}

function sanitizeTokenCount(value: number | null | undefined): number | null {
  if (typeof value !== 'number') return null;
  if (!Number.isFinite(value)) return null;
  const rounded = Math.round(value);
  if (rounded < 0) return null;
  return rounded;
}

function normalizeMetadata(metadata?: Record<string, unknown>): Record<string, unknown> {
  if (!metadata) return {};
  return metadata;
}

function normalizeText(value: string | null | undefined, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

function summarizeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message.slice(0, 400);
  }
  return String(error).slice(0, 400);
}

export async function recordApiCostEvent(input: ApiCostEventInput): Promise<void> {
  try {
    const client = getAdminClient();
    if (!client) return;

    const provider = normalizeText(input.provider, 'unknown');
    const model = normalizeText(input.model, 'unknown');
    const operation = normalizeText(input.operation, 'unspecified');
    const endpoint = input.endpoint?.trim() ? input.endpoint.trim() : null;
    const status: EventStatus = input.status ?? 'succeeded';

    const inputTokens = sanitizeTokenCount(input.inputTokens);
    const outputTokens = sanitizeTokenCount(input.outputTokens);
    const thinkingTokens = sanitizeTokenCount(input.thinkingTokens);
    const totalTokens = sanitizeTokenCount(
      input.totalTokens ?? (
        inputTokens !== null || outputTokens !== null
          ? (inputTokens ?? 0) + (outputTokens ?? 0)
          : null
      )
    );

    const estimated = calculateEstimatedApiCost({
      provider,
      model,
      inputTokens,
      outputTokens,
      thinkingTokens,
      totalTokens,
    });

    const estimatedCostUsd =
      typeof input.estimatedCostUsd === 'number' && Number.isFinite(input.estimatedCostUsd)
        ? input.estimatedCostUsd
        : estimated.estimatedCostUsd;
    const estimatedCostJpy =
      typeof input.estimatedCostJpy === 'number' && Number.isFinite(input.estimatedCostJpy)
        ? input.estimatedCostJpy
        : estimated.estimatedCostJpy;

    const metadata = normalizeMetadata({
      ...input.metadata,
      pricing_found: estimated.pricingFound,
      ...(thinkingTokens !== null ? { thinking_tokens: thinkingTokens } : {}),
    });

    const { error } = await client.from('api_cost_events').insert({
      user_id: input.userId ?? null,
      provider,
      model,
      operation,
      endpoint,
      status,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      total_tokens: totalTokens,
      estimated_cost_usd: estimatedCostUsd,
      estimated_cost_jpy: estimatedCostJpy,
      metadata,
    });

    if (error) {
      console.error('[ApiCost] failed to insert api_cost_events row:', error.message);
    }
  } catch (error) {
    console.error('[ApiCost] recorder unexpected error:', summarizeError(error));
  }
}
