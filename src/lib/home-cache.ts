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

  // Persist lightweight snapshot to browser storage (session + local)
  persistSnapshot(data);

  notifyListeners();
}

export function updateProjectWordsCache(projectId: string, words: Word[]) {
  projectWordsCache[projectId] = words;
}

export function invalidateHomeCache() {
  hasLoaded = false;
  clearPersistedSnapshot();
}

export function clearHomeCache() {
  projectsCache = [];
  projectWordsCache = {};
  allFavoritesCache = [];
  favoriteCountsCache = {};
  totalWordsCache = 0;
  hasLoaded = false;
  loadedUserId = null;

  // Clear persisted snapshot to avoid restoring another account's cache
  clearPersistedSnapshot();

  notifyListeners();
}

// ---------- Storage persistence ----------

const SESSION_KEY = 'merken_home_snapshot_session';
const LOCAL_KEY = 'merken_home_snapshot_local';
const SESSION_TTL_MS = 5 * 60 * 1000;
const LOCAL_TTL_MS = 24 * 60 * 60 * 1000;

interface HomeSnapshot {
  projects: Project[];
  totalWords: number;
  favoriteCounts: Record<string, number>;
  userId: string;
  timestamp: number;
}

function buildSnapshot(data: HomeCacheData): HomeSnapshot {
  return {
    projects: data.projects,
    totalWords: data.totalWords,
    favoriteCounts: data.favoriteCounts,
    userId: data.userId,
    timestamp: Date.now(),
  };
}

function persistSnapshot(data: HomeCacheData) {
  const snapshot = buildSnapshot(data);
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(snapshot));
  } catch {
    // sessionStorage full or unavailable - ignore
  }
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(snapshot));
  } catch {
    // localStorage full or unavailable - ignore
  }
}

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

function parseSnapshot(raw: string): HomeSnapshot | null {
  try {
    return JSON.parse(raw) as HomeSnapshot;
  } catch {
    return null;
  }
}

function restoreSnapshot(
  storage: Storage,
  key: string,
  currentUserId: string,
  ttlMs: number
): HomeSnapshot | null {
  const raw = storage.getItem(key);
  if (!raw) return null;

  const snapshot = parseSnapshot(raw);
  if (!snapshot) {
    storage.removeItem(key);
    return null;
  }

  // 別ユーザーのキャッシュは無効
  if (snapshot.userId !== currentUserId) {
    storage.removeItem(key);
    return null;
  }

  // 古すぎるキャッシュは無効
  if (Date.now() - snapshot.timestamp > ttlMs) {
    storage.removeItem(key);
    return null;
  }

  return snapshot;
}

/**
 * sessionStorage -> localStorage の順で軽量スナップショットを復元する。
 * sessionStorage は短期キャッシュ、localStorage は再オープン時フォールバックとして使う。
 */
export function restoreFromSessionStorage(currentUserId: string): HomeCacheData | null {
  if (typeof window === 'undefined') return null;

  try {
    const sessionSnapshot = restoreSnapshot(sessionStorage, SESSION_KEY, currentUserId, SESSION_TTL_MS);
    const localSnapshot = sessionSnapshot
      ? null
      : restoreSnapshot(localStorage, LOCAL_KEY, currentUserId, LOCAL_TTL_MS);
    const snapshot = sessionSnapshot ?? localSnapshot;
    if (!snapshot) return null;

    // localStorage から復元した場合は sessionStorage を温め直す
    if (!sessionSnapshot) {
      try {
        sessionStorage.setItem(SESSION_KEY, JSON.stringify(snapshot));
      } catch {
        // ignore
      }
    }

    return {
      projects: snapshot.projects,
      projectWords: {}, // 単語データは永続保存しない（サイズ対策）
      allFavorites: [],
      favoriteCounts: snapshot.favoriteCounts,
      totalWords: snapshot.totalWords,
      userId: snapshot.userId,
    };
  } catch {
    return null;
  }
}
