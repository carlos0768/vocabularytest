'use client';

/**
 * グループ概要 (/api/shared-projects/groups/[groupId]) のクライアントキャッシュ。
 *
 * 概要・本棚・設定の3ページが同一エンドポイントを毎回 no-store で再取得して
 * いたため、グループ内のページ遷移のたびに重い集計ペイロードを待っていた。
 * ここで stale-while-revalidate（キャッシュ即時表示 → 背景で再検証）に統一する。
 */

import type {
  SharedProjectCard,
  StudyGroupLeaderboardEntry,
  StudyGroupMember,
  StudyGroupMissedWord,
  StudyGroupSummary,
} from '@/lib/shared-projects/types';

export type GroupOverviewPayload = {
  group: StudyGroupSummary;
  projects: SharedProjectCard[];
  members: StudyGroupMember[];
  leaderboard: StudyGroupLeaderboardEntry[];
  missedWords: StudyGroupMissedWord[];
  missedWordsTotalCount: number;
  viewerUserId?: string;
};

type OverviewApiResponse = Partial<GroupOverviewPayload> & {
  success?: boolean;
  error?: string;
};

const TTL_MS = 30_000;

const cache = new Map<string, { payload: GroupOverviewPayload; fetchedAt: number }>();
const inflight = new Map<string, Promise<GroupOverviewPayload>>();

// ホーム等が既に持っている StudyGroupSummary の軽量シード。フルの概要
// ペイロードが届く前にグループページのヘッダーを即描画するために使う。
const summarySeed = new Map<string, StudyGroupSummary>();

/** 遷移元（ホームのカード等）でタップ時に呼び、ヘッダー即描画の種を渡す。 */
export function seedGroupSummary(group: StudyGroupSummary): void {
  summarySeed.set(group.id, group);
}

/** フルキャッシュ優先で、無ければシード済みサマリーを返す。 */
export function getSeededGroupSummary(groupId: string): StudyGroupSummary | null {
  return cache.get(groupId)?.payload.group ?? summarySeed.get(groupId) ?? null;
}

/**
 * 概要のフェッチを先行開始する（fire-and-forget）。ルートチャンクの
 * ロードとAPI往復を並走させ、グループページへの遷移を体感短縮する。
 */
export function prefetchGroupOverview(groupId: string): void {
  if (cache.has(groupId)) return;
  void revalidate(groupId).catch(() => {
    // 先読み失敗は無視。ページ側の本フェッチが改めてエラー処理する。
  });
}

async function fetchGroupOverview(groupId: string): Promise<GroupOverviewPayload> {
  const response = await fetch(
    `/api/shared-projects/groups/${encodeURIComponent(groupId)}`,
    { cache: 'no-store' },
  );
  const payload = await response.json().catch(() => null) as OverviewApiResponse | null;
  if (!response.ok || !payload?.success || !payload.group) {
    throw new Error(payload?.error || 'group_overview_failed');
  }
  return {
    group: payload.group,
    projects: payload.projects ?? [],
    members: payload.members ?? [],
    leaderboard: payload.leaderboard ?? [],
    missedWords: payload.missedWords ?? [],
    missedWordsTotalCount: payload.missedWordsTotalCount ?? payload.missedWords?.length ?? 0,
    viewerUserId: payload.viewerUserId,
  };
}

function revalidate(groupId: string): Promise<GroupOverviewPayload> {
  const existing = inflight.get(groupId);
  if (existing) return existing;

  const promise = fetchGroupOverview(groupId)
    .then((payload) => {
      cache.set(groupId, { payload, fetchedAt: Date.now() });
      return payload;
    })
    .finally(() => {
      inflight.delete(groupId);
    });
  inflight.set(groupId, promise);
  return promise;
}

export function getCachedGroupOverview(groupId: string): GroupOverviewPayload | null {
  return cache.get(groupId)?.payload ?? null;
}

/**
 * stale-while-revalidate ローダー。
 * - キャッシュがあれば即座に onData(payload, {fromCache:true}) を呼ぶ
 * - TTL 超過（または force）なら背景で再取得し、成功時に再度 onData を呼ぶ
 * - キャッシュゼロで取得も失敗した場合のみ reject する
 */
export async function loadGroupOverview(
  groupId: string,
  onData: (payload: GroupOverviewPayload, meta: { fromCache: boolean }) => void,
  options: { force?: boolean } = {},
): Promise<void> {
  const entry = cache.get(groupId);

  if (entry) {
    onData(entry.payload, { fromCache: true });
    const stale = options.force || Date.now() - entry.fetchedAt > TTL_MS;
    if (!stale) return;
    try {
      const fresh = await revalidate(groupId);
      onData(fresh, { fromCache: false });
    } catch (error) {
      // 背景再検証の失敗は既存表示を維持して黙って続行
      console.warn('[group-overview-cache] background revalidation failed:', error);
    }
    return;
  }

  const payload = await revalidate(groupId);
  onData(payload, { fromCache: false });
}

/** グループ設定の変更後などに呼んで、次回アクセスで必ず再取得させる。 */
export function invalidateGroupOverview(groupId: string): void {
  cache.delete(groupId);
}

/** 設定 PATCH 成功時にキャッシュ済みの group を部分更新する。 */
export function updateCachedGroupOverview(
  groupId: string,
  updater: (payload: GroupOverviewPayload) => GroupOverviewPayload,
): void {
  const entry = cache.get(groupId);
  if (!entry) return;
  cache.set(groupId, { payload: updater(entry.payload), fetchedAt: entry.fetchedAt });
}
