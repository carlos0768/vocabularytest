/**
 * API Cost Scan Context
 *
 * スキャン1回（/api/extract の1リクエスト、または scan_jobs の1ジョブ）に
 * 含まれる複数のAI呼び出しを、同じ scan_id で api_cost_events に紐づけるための
 * AsyncLocalStorage コンテキスト。
 *
 * ルートハンドラで runWithApiCostScanContext() でラップすると、
 * その中で発生した recordApiCostEvent() が自動的に scan_id / user_id を付与する。
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

export interface ApiCostScanContext {
  scanId: string;
  source: string;
  userId?: string | null;
  modes?: string[];
}

const storage = new AsyncLocalStorage<ApiCostScanContext>();

export function runWithApiCostScanContext<T>(
  context: Omit<ApiCostScanContext, 'scanId'> & { scanId?: string },
  fn: () => Promise<T>
): Promise<T> {
  return storage.run(
    {
      ...context,
      scanId: context.scanId ?? randomUUID(),
    },
    fn
  );
}

/**
 * 実行中のスキャンコンテキストに後から判明した情報（userId, modes）を追記する。
 * コンテキスト外で呼ばれた場合は何もしない。
 */
export function updateApiCostScanContext(
  patch: Partial<Pick<ApiCostScanContext, 'userId' | 'modes'>>
): void {
  const store = storage.getStore();
  if (!store) return;
  if (patch.userId !== undefined) store.userId = patch.userId;
  if (patch.modes !== undefined) store.modes = patch.modes;
}

export function getApiCostScanContext(): ApiCostScanContext | undefined {
  return storage.getStore();
}

/**
 * recorder が api_cost_events 行に反映するためのフィールドを返す。
 */
export function getScanContextEventFields(): {
  userId: string | null;
  metadata: Record<string, unknown>;
} | null {
  const store = storage.getStore();
  if (!store) return null;
  return {
    userId: store.userId ?? null,
    metadata: {
      scan_id: store.scanId,
      scan_source: store.source,
      ...(store.modes && store.modes.length > 0 ? { scan_modes: store.modes } : {}),
    },
  };
}
