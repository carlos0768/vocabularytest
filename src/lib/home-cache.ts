/**
 * Home Page Global Cache
 *
 * ホーム画面のプロジェクト・単語データを一元管理するキャッシュ。
 * useWordCount, prefetchStats はここから読み取ることで重複フェッチを排除する。
 * sessionStorage にも永続化し、フルリロード後も即時表示を実現する。
 */

import type { Project, Word } from '@/types';

// ---------- In-memory cache ----------

let projectsCache: Project[] = [];
let projectWordsCache: Record<string, Word[]> = {};
let allFavoritesCache: Word[] = [];
let favoriteCountsCache: Record<string, number> = {};
let totalWordsCache = 0;
let hasLoaded = false;
let loadedUserId: string | null = null;

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
export function getCachedAllFavorites(): Word[] { return allFavoritesCache; }
export function getCachedFavoriteCounts(): Record<string, number> { return favoriteCountsCache; }
export function getCachedTotalWords(): number { return totalWordsCache; }
export function getHasLoaded(): boolean { return hasLoaded; }
export function getLoadedUserId(): string | null { return loadedUserId; }

// ---------- Setters ----------

export interface HomeCacheData {
  projects: Project[];
  projectWords: Record<string, Word[]>;
  allFavorites: Word[];
  favoriteCounts: Record<string, number>;
  totalWords: number;
  userId: string;
}

export function setHomeCache(data: HomeCacheData) {
  projectsCache = data.projects;
  projectWordsCache = data.projectWords;
  allFavoritesCache = data.allFavorites;
  favoriteCountsCache = data.favoriteCounts;
  totalWordsCache = data.totalWords;
  hasLoaded = true;
  loadedUserId = data.userId;

  // Persist lightweight snapshot to sessionStorage
  persistToSessionStorage(data);

  notifyListeners();
}

export function updateProjectWordsCache(projectId: string, words: Word[]) {
  projectWordsCache[projectId] = words;
}

export function invalidateHomeCache() {
  hasLoaded = false;
  // Also clear sessionStorage to ensure fresh data is fetched
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // ignore
  }
}

export function clearHomeCache() {
  projectsCache = [];
  projectWordsCache = {};
  allFavoritesCache = [];
  favoriteCountsCache = {};
  totalWordsCache = 0;
  hasLoaded = false;
  loadedUserId = null;
}

// ---------- sessionStorage persistence (Strategy 5) ----------

const SESSION_KEY = 'merken_home_snapshot';

interface HomeSnapshot {
  projects: Project[];
  totalWords: number;
  favoriteCounts: Record<string, number>;
  userId: string;
  timestamp: number;
}

function persistToSessionStorage(data: HomeCacheData) {
  try {
    const snapshot: HomeSnapshot = {
      projects: data.projects,
      totalWords: data.totalWords,
      favoriteCounts: data.favoriteCounts,
      userId: data.userId,
      timestamp: Date.now(),
    };
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(snapshot));
  } catch {
    // sessionStorage full or unavailable - ignore
  }
}

/**
 * sessionStorageから軽量スナップショットを復元する。
 * フルリロード直後でもスピナーなしで表示できる。
 * 5分以内のキャッシュのみ有効。
 */
export function restoreFromSessionStorage(currentUserId: string): HomeCacheData | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;

    const snapshot: HomeSnapshot = JSON.parse(raw);

    // 別ユーザーのキャッシュは無効
    if (snapshot.userId !== currentUserId) return null;

    // 5分以上古いキャッシュは無効
    if (Date.now() - snapshot.timestamp > 5 * 60 * 1000) return null;

    return {
      projects: snapshot.projects,
      projectWords: {}, // 単語データはsessionStorageに保存しない（サイズ対策）
      allFavorites: [],
      favoriteCounts: snapshot.favoriteCounts,
      totalWords: snapshot.totalWords,
      userId: snapshot.userId,
    };
  } catch {
    return null;
  }
}
