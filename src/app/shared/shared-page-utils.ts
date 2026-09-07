import type { SharedDiscoverPayload, SharedProjectCard, SharedProjectMetricsMap } from '@/lib/shared-projects/types';

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

export type SharedPageTab = 'all' | 'users' | 'projects' | 'official' | 'grammar' | 'groups';

const SHARED_PAGE_TABS: readonly SharedPageTab[] = ['all', 'users', 'projects', 'official', 'grammar', 'groups'];

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
