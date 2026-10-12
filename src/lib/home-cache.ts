/**
 * Home Page Global Cache
 *
 * ホーム画面の単語帳・単語データを一元管理するキャッシュ。
 * useWordCount, prefetchStats はここから読み取ることで重複フェッチを排除する。
 * sessionStorage + localStorage に軽量スナップショットを永続化し、
 * フルリロード/再オープン後も即時表示を実現する。
 */

import type { Project, Word } from '@/types';

// ---------- In-memory cache ----------

let projectsCache: Project[] = [];
let projectWordsCache: Record<string, Word[]> = {};
let totalWordsCache = 0;
let hasLoaded = false;
// ---------- Listeners (pub/sub) ----------

type CacheListener = () => void;
const listeners = new Set<CacheListener>();

export function subscribeCacheUpdate(fn: CacheListener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notifyListeners() {
  listeners.forEach(fn => fn());
}

// ---------- Getters ----------

export function getCachedProjects(): Project[] { return projectsCache; }
export function getCachedProjectWords(): Record<string, Word[]> { return projectWordsCache; }

export function getCachedTotalWords(): number { return totalWordsCache; }
export function getHasLoaded(): boolean { return hasLoaded; }

// ---------- Setters ----------

export interface HomeCacheData {
  projects: Project[];
  projectWords: Record<string, Word[]>;
  allFavorites: Word[];
  favoriteCounts: Record<string, number>;
  totalWords: number;
  userId: string;
}

export function updateProjectWordsCache(projectId: string, words: Word[]) {
  projectWordsCache[projectId] = words;
}

export function invalidateHomeCache() {
  hasLoaded = false;
  // 単語帳・単語が変わったので、次にホーム/一覧を開いたときは Supabase を読み直す。
  resetRemoteWordbooksRefresh();
  clearPersistedSnapshot();
}

export function clearHomeCache() {
  projectsCache = [];
  projectWordsCache = {};
  totalWordsCache = 0;
  hasLoaded = false;
  homeViewSnapshot = null;
  resetRemoteWordbooksRefresh();

  // Clear persisted snapshot to avoid restoring another account's cache
  clearPersistedSnapshot();

  notifyListeners();
}

// ---------- Remote wordbook refresh throttle ----------
//
// ホームと単語帳一覧は「IndexedDB を先に描画 → Supabase から全単語帳・全単語を
// 取り直して上書き」という流れで、以前は開くたびに後半を必ず走らせていた。
// タブを往復するだけで全データの再ダウンロード + IndexedDB の全件書き換えが
// 起きていたので、直近の再取得から一定時間はローカルの内容だけで済ませる。
// 単語帳や単語を書き換えた側は invalidateHomeCache() を呼ぶので、その直後の
// 表示は必ず再取得される。

export const REMOTE_WORDBOOKS_REFRESH_INTERVAL_MS = 60 * 1000;

let lastRemoteWordbooksRefresh: { userId: string; at: number } | null = null;

export function shouldRefreshRemoteWordbooks(userId: string, now: number = Date.now()): boolean {
  if (!lastRemoteWordbooksRefresh || lastRemoteWordbooksRefresh.userId !== userId) return true;
  return now - lastRemoteWordbooksRefresh.at >= REMOTE_WORDBOOKS_REFRESH_INTERVAL_MS;
}

export function markRemoteWordbooksRefreshed(userId: string, now: number = Date.now()): void {
  lastRemoteWordbooksRefresh = { userId, at: now };
}

export function resetRemoteWordbooksRefresh(): void {
  lastRemoteWordbooksRefresh = null;
}

// ---------- Home view snapshot ----------
//
// ホーム画面が最後に描画した内容（統計つき単語帳一覧）をメモリに残し、次にホームへ
// 戻ったとき最初のレンダーからそのまま出す。以前は毎回スケルトンから始まり、
// IndexedDB の読み込みが終わるまで何も出なかった。データはマウント直後に
// IndexedDB から読み直して上書きされるので、古い内容が残るのは数十 ms だけ。

let homeViewSnapshot: { userId: string; data: unknown } | null = null;

export function getHomeViewSnapshot<T>(userId: string): T | null {
  if (!homeViewSnapshot || homeViewSnapshot.userId !== userId) return null;
  return homeViewSnapshot.data as T;
}

export function setHomeViewSnapshot<T>(userId: string, data: T): void {
  homeViewSnapshot = { userId, data };
}

// ---------- Storage persistence ----------

const SESSION_KEY = 'merken_home_snapshot_session';
const LOCAL_KEY = 'merken_home_snapshot_local';

function clearPersistedSnapshot() {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // ignore
  }
  try {
    localStorage.removeItem(LOCAL_KEY);
  } catch {
    // ignore
  }
}
