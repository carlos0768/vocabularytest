import type { WordStatus } from '@/types';

/**
 * Debounce word-status writes so rapid NotionCheckbox taps collapse into
 * a single DB write per word. Cycling back to the originally-persisted
 * status within the debounce window skips the write entirely.
 *
 * See docs issues/comments around #79: the 3-tier checkbox can emit several
 * status mutations per user interaction, and each write hits Supabase for
 * Pro users. Batching them reduces DB budget pressure without changing the
 * optimistic UX.
 */

type StatusWriter = (
  finalStatus: WordStatus,
  originalStatus: WordStatus
) => Promise<void>;

interface PendingStatusWrite {
  timer: ReturnType<typeof setTimeout>;
  /** Status held in the DB at the moment the first debounce started. */
  originalStatus: WordStatus;
  /** Most recent status the user navigated to. */
  latestStatus: WordStatus;
  writer: StatusWriter;
}

const pending = new Map<string, PendingStatusWrite>();

export const DEFAULT_STATUS_WRITE_DEBOUNCE_MS = 1200;

export interface ScheduleStatusWriteParams {
  wordId: string;
  /**
   * The word's currently-persisted status. Only read on the first call
   * before a debounce flushes; subsequent calls reuse the tracked value
   * so the original (pre-tap) status survives intermediate optimistic
   * state.
   */
  currentStatus: WordStatus;
  newStatus: WordStatus;
  writer: StatusWriter;
  debounceMs?: number;
}

export function scheduleWordStatusWrite({
  wordId,
  currentStatus,
  newStatus,
  writer,
  debounceMs = DEFAULT_STATUS_WRITE_DEBOUNCE_MS,
}: ScheduleStatusWriteParams): void {
  const existing = pending.get(wordId);
  if (existing) {
    clearTimeout(existing.timer);
    existing.latestStatus = newStatus;
    existing.writer = writer;
    existing.timer = setTimeout(() => {
      void flushWordStatusWrite(wordId);
    }, debounceMs);
    return;
  }

  pending.set(wordId, {
    timer: setTimeout(() => {
      void flushWordStatusWrite(wordId);
    }, debounceMs),
    originalStatus: currentStatus,
    latestStatus: newStatus,
    writer,
  });
}

export async function flushWordStatusWrite(wordId: string): Promise<void> {
  const entry = pending.get(wordId);
  if (!entry) return;
  pending.delete(wordId);
  clearTimeout(entry.timer);
  if (entry.latestStatus === entry.originalStatus) {
    return;
  }
  await entry.writer(entry.latestStatus, entry.originalStatus);
}

export function flushAllPendingStatusWrites(): void {
  const ids = Array.from(pending.keys());
  for (const id of ids) {
    void flushWordStatusWrite(id);
  }
}

/** Test-only: reset any in-flight debounces. */
export function __resetPendingStatusWritesForTests(): void {
  for (const entry of pending.values()) {
    clearTimeout(entry.timer);
  }
  pending.clear();
}

/** Test-only: inspect whether a word currently has a pending write. */
export function __hasPendingStatusWriteForTests(wordId: string): boolean {
  return pending.has(wordId);
}
