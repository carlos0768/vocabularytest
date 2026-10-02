import type { FollowSearchResult } from '@/lib/follows/types';
import type {
  SharedDiscoverPayload,
  SharedProjectCard,
  SharedProjectMetricsMap,
  SharedUserSummary,
} from '@/lib/shared-projects/types';

export function mergeUniqueProjectCards(
  existing: SharedProjectCard[],
  incoming: SharedProjectCard[],
): SharedProjectCard[] {
  if (incoming.length === 0) return existing;

  const merged = [...existing];
  const seen = new Set(existing.map((item) => item.project.id));

  for (const item of incoming) {
    if (seen.has(item.project.id)) continue;
    seen.add(item.project.id);
    merged.push(item);
  }

  return merged;
}

export function mergeMetricsIntoCards(
  cards: SharedProjectCard[],
  metrics: SharedProjectMetricsMap,
): SharedProjectCard[] {
  let changed = false;

  const nextCards = cards.map((card) => {
    const metric = metrics[card.project.id];
    if (!metric) {
      return card;
    }

    if (
      card.wordCount === metric.wordCount
      && card.collaboratorCount === metric.collaboratorCount
      && card.likeCount === metric.likeCount
    ) {
      return card;
    }

    changed = true;
    return {
      ...card,
      wordCount: metric.wordCount,
      collaboratorCount: metric.collaboratorCount,
      likeCount: metric.likeCount,
    };
  });

  return changed ? nextCards : cards;
}

/**
 * 無限スクロールで取得した次ページを現在の一覧に追記する。ユーザー・単語帳
 * とも既出の項目は落とし、nextCursor はページ側の値で置き換える。
 */
export function appendDiscoverPage(
  current: SharedDiscoverPayload,
  page: SharedDiscoverPayload,
): SharedDiscoverPayload {
  const seenUsers = new Set(current.users.map((user) => user.userId));
  return {
    ...current,
    users: [...current.users, ...page.users.filter((user) => !seenUsers.has(user.userId))],
    projects: mergeUniqueProjectCards(current.projects, page.projects),
    nextCursor: page.nextCursor,
  };
}

/**
 * 検索窓のユーザー結果に、ユーザー検索 (`/api/follows/search`) のヒットを合流させる。
 *
 * `/api/shared-projects/discover` のユーザーは「共有単語帳を公開している人」から
 * 拾うだけなので、単語帳を公開していない人や、表示名・ハンドルでしか一致しない人は
 * 出てこない。ユーザータブで検索すれば出るのに検索窓では出ない、の原因がこれ。
 * 名前で直接一致したプロフィールを先頭に置き（共有の集計があれば引き継ぐ）、
 * 残りの discover 側のユーザーをその後ろに並べる。
 */
export function mergeProfileSearchUsers(
  discoverUsers: SharedUserSummary[],
  profileResults: FollowSearchResult[],
): SharedUserSummary[] {
  if (profileResults.length === 0) return discoverUsers;

  const discoverById = new Map(discoverUsers.map((user) => [user.userId, user]));
  const merged: SharedUserSummary[] = [];
  const seen = new Set<string>();

  for (const result of profileResults) {
    if (seen.has(result.userId)) continue;
    seen.add(result.userId);
    const stats = discoverById.get(result.userId);
    merged.push({
      userId: result.userId,
      username: result.username ?? stats?.username ?? null,
      accountId: result.accountId || stats?.accountId || null,
      projectCount: stats?.projectCount ?? 0,
      wordCount: stats?.wordCount ?? 0,
      likeCount: stats?.likeCount ?? 0,
    });
  }

  for (const user of discoverUsers) {
    if (seen.has(user.userId)) continue;
    seen.add(user.userId);
    merged.push(user);
  }

  return merged;
}

export function removeProjectFromDiscover(
  payload: SharedDiscoverPayload,
  projectId: string,
): SharedDiscoverPayload {
  const projects = payload.projects.filter((card) => card.project.id !== projectId);
  return projects.length === payload.projects.length ? payload : { ...payload, projects };
}

export function collectMetricProjectIds(
  ...groups: SharedProjectCard[][]
): string[] {
  const projectIds = new Set<string>();

  for (const group of groups) {
    for (const card of group) {
      if (card.wordCount !== undefined && card.collaboratorCount !== undefined) {
        continue;
      }

      projectIds.add(card.project.id);
    }
  }

  return Array.from(projectIds);
}

/**
 * 共有ページのタブ（カテゴリ）を URL に残すためのヘルパー。
 *
 * タブが React の state だけに乗っていた頃は、グループ検索から開いたグループ
 * ページから戻ると `/shared` が既定の 'all'（共有単語帳のトップ）で描き直され、
 * 「グループ検索まで戻れない」状態になっていた。タブを `?tab=` に写しておけば
 * 戻ったときに同じタブを復元できる。
 */
export const SHARED_TAB_PARAM = 'tab';

export type SharedPageTab = 'all' | 'users' | 'projects' | 'official' | 'groups';

const SHARED_PAGE_TABS: readonly SharedPageTab[] = ['all', 'users', 'projects', 'official', 'groups'];

/** `?tab=` を読む。未知の値や欠落は 'all'（従来どおりのトップ）に倒す。 */
export function parseSharedPageTab(search: string | null | undefined): SharedPageTab {
  if (!search) return 'all';
  const value = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search).get(SHARED_TAB_PARAM);
  return SHARED_PAGE_TABS.includes(value as SharedPageTab) ? (value as SharedPageTab) : 'all';
}

/**
 * 現在の URL のクエリにタブだけを差し替えたものを返す（他のクエリは保つ）。
 * 'all' は既定なので付けない＝ `/shared` のままにする。
 */
export function buildSharedPageSearch(search: string | null | undefined, tab: SharedPageTab): string {
  const params = new URLSearchParams(
    !search ? '' : search.startsWith('?') ? search.slice(1) : search,
  );
  if (tab === 'all') params.delete(SHARED_TAB_PARAM);
  else params.set(SHARED_TAB_PARAM, tab);
  const query = params.toString();
  return query ? `?${query}` : '';
}
