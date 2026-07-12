import type { LevelTestState } from './engine';

// 診断の途中経過を sessionStorage に保存して中断再開できるようにする。
// メインクイズ(quiz-state.ts)と同じ30分TTL。

// v2: LevelTestState に wrongStreak が追加された(古いスナップショットは捨てる)
export const LEVEL_TEST_SESSION_KEY = 'level_test_state_v2';
export const LEVEL_TEST_SESSION_TTL_MS = 30 * 60 * 1000;

export type LevelTestSessionSnapshot = {
  state: LevelTestState;
  usedKeys: string[];
  // 表示中の問題(回答前にリロードされても同じ問題を復元する)
  currentQuestion: { levelIndex: number; wordIndex: number } | null;
  savedAt: number;
};

export function isLevelTestSessionExpired(savedAt: number, now: number = Date.now()): boolean {
  if (!Number.isFinite(savedAt)) return true;
  return now - savedAt > LEVEL_TEST_SESSION_TTL_MS;
}

export function saveLevelTestSession(snapshot: Omit<LevelTestSessionSnapshot, 'savedAt'>): void {
  if (typeof window === 'undefined') return;
  try {
    const payload: LevelTestSessionSnapshot = { ...snapshot, savedAt: Date.now() };
    window.sessionStorage.setItem(LEVEL_TEST_SESSION_KEY, JSON.stringify(payload));
  } catch {
    // ストレージ不可(プライベートモード等)は無視して続行
  }
}

export function loadLevelTestSession(): LevelTestSessionSnapshot | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(LEVEL_TEST_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LevelTestSessionSnapshot;
    if (!parsed || typeof parsed !== 'object') return null;
    if (isLevelTestSessionExpired(parsed.savedAt)) {
      clearLevelTestSession();
      return null;
    }
    if (!parsed.state || !Array.isArray(parsed.usedKeys)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearLevelTestSession(): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(LEVEL_TEST_SESSION_KEY);
  } catch {
    // 無視
  }
}
