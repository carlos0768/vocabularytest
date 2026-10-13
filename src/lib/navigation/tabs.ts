/**
 * アプリ共通のナビタブ定義。ボトムナビ (phone)・タブレットのサイドバー・
 * デスクトップのヘッダーの 3 つが同じ並びで読む。ここ以外にタブを定義しない。
 *
 * Pro: ホーム / 目標 / 作成(+) / 共有 / アカウント
 * Free / ゲスト: ホーム / 共有 / 作成(+) / リール / アカウント
 * (単語一覧 /words はナビから外した。語法問題集はホームのセクションから開く)
 */

export type NavTabKey = 'home' | 'goal' | 'create' | 'shared' | 'reels' | 'account';

export type NavTab = {
  key: NavTabKey;
  label: string;
  /** 遷移先。無いのは中央の「作成」だけ */
  href?: string;
  /** 前方一致でアクティブ扱いにするパス (`/` は完全一致) */
  matchPaths?: string[];
  /** 完全一致でだけアクティブ扱いにするパス (例: /profile は自分のプロフィールだけ) */
  exactPaths?: string[];
  /** 中央の「＋」ボタン */
  primary?: boolean;
  /** 24x24 viewBox の stroke ベース SVG パス */
  iconPath: string;
  /** アクティブ時に塗りつぶす */
  fillWhenActive?: boolean;
};

export const NAV_ICON_PATHS = {
  home: 'M3 10l9-7 9 7V20a1 1 0 01-1 1h-5v-7h-6v7H4a1 1 0 01-1-1V10z',
  goal: 'M5 21V4 M5 4h13l-3 4.5 3 4.5H5',
  shared:
    'M3.5 12a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0 -5 0 M15.5 6a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0 -5 0 M15.5 18a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0 -5 0 M8 11l8-4M8 13l8 4',
  account: 'M8 8a4 4 0 1 0 8 0a4 4 0 1 0 -8 0 M4 21a8 8 0 0116 0',
  reels: 'M4 3h16v18H4z M4 8h16 M10.5 12.2l4 2.3-4 2.3v-4.6z',
  create: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18z M12 8v8M8 12h8',
} as const;

const HOME_TAB: NavTab = { key: 'home', label: 'ホーム', href: '/', matchPaths: ['/'], iconPath: NAV_ICON_PATHS.home, fillWhenActive: true };
const GOAL_TAB: NavTab = { key: 'goal', label: '目標', href: '/goal', matchPaths: ['/goal'], iconPath: NAV_ICON_PATHS.goal, fillWhenActive: true };
const CREATE_TAB: NavTab = { key: 'create', label: '作成', primary: true, iconPath: NAV_ICON_PATHS.create };
const SHARED_TAB: NavTab = {
  key: 'shared',
  label: '共有',
  href: '/shared',
  matchPaths: ['/shared', '/groups', '/share'],
  iconPath: NAV_ICON_PATHS.shared,
  fillWhenActive: true,
};
const REELS_TAB: NavTab = { key: 'reels', label: 'リール', href: '/reels', matchPaths: ['/reels'], iconPath: NAV_ICON_PATHS.reels };
const ACCOUNT_TAB: NavTab = {
  key: 'account',
  label: 'アカウント',
  href: '/profile',
  matchPaths: ['/settings', '/subscription', '/stats', '/favorites', '/coins', '/follows'],
  exactPaths: ['/profile'],
  iconPath: NAV_ICON_PATHS.account,
  fillWhenActive: true,
};

export const PRO_NAV_TABS: readonly NavTab[] = [HOME_TAB, GOAL_TAB, CREATE_TAB, SHARED_TAB, ACCOUNT_TAB];
export const FREE_NAV_TABS: readonly NavTab[] = [HOME_TAB, SHARED_TAB, CREATE_TAB, REELS_TAB, ACCOUNT_TAB];

export function getNavTabs(isPro: boolean): readonly NavTab[] {
  return isPro ? PRO_NAV_TABS : FREE_NAV_TABS;
}

export function isNavTabActive(tab: NavTab, pathname: string): boolean {
  if (!tab.href) return false;
  if (tab.exactPaths?.some((path) => pathname === path)) return true;
  if (!tab.matchPaths) return false;
  return tab.matchPaths.some((path) =>
    path === '/' ? pathname === '/' : pathname === path || pathname.startsWith(path + '/'),
  );
}
