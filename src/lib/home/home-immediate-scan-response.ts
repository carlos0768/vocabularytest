import type { HomeImmediateScanResultInput } from '@/lib/home/home-immediate-scan-results';
import type { LexiconEntry } from '@/types';

export type HomeImmediateScanExtractResponse =
  | { ok: true; result: HomeImmediateScanResultInput }
  | { ok: false; error: string };

export interface HomeImmediateScanResponseLike {
  ok: boolean;
  json(): Promise<unknown>;
}

export async function readHomeImmediateScanExtractResponse(
  response: HomeImmediateScanResponseLike,
  params: { imageIndex: number },
): Promise<HomeImmediateScanExtractResponse> {
  const body = await response.json().catch(() => ({}));
  return parseHomeImmediateScanExtractResponse({
    responseOk: response.ok,
    body,
    imageIndex: params.imageIndex,
  });
}

export function parseHomeImmediateScanExtractResponse(params: {
  responseOk: boolean;
  body: unknown;
  imageIndex: number;
}): HomeImmediateScanExtractResponse {
  const record = asRecord(params.body);

  if (!params.responseOk || !record.success) {
    return {
      ok: false,
      error: typeof record.error === 'string'
        ? record.error
        : `画像 ${params.imageIndex + 1} の抽出に失敗しました`,
    };
  }

  return {
    ok: true,
    result: {
      words: Array.isArray(record.words) ? record.words : undefined,
      sourceLabels: Array.isArray(record.sourceLabels) ? record.sourceLabels : undefined,
      lexiconEntries: Array.isArray(record.lexiconEntries)
        ? record.lexiconEntries as LexiconEntry[]
        : undefined,
    },
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : {};
}
