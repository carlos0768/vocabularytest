/**
 * Fires the once-per-round RPCs that keep a battle moving: the timeout resolve
 * and, after the reveal pause, the advance to the next question.
 *
 * This deliberately lives outside React. Both calls are terminal in the sense
 * that nothing else re-sends them -- once a round is resolved the countdown is
 * over and neither player can act, so an advance that never goes out leaves the
 * battle stuck on that question forever. Holding the reveal pause in a
 * `setTimeout` inside an effect made exactly that happen: the room is re-fetched
 * on every realtime event and every reconcile tick, each parse hands back new
 * object identities, and the resulting effect cleanup cleared the pending
 * advance long before the pause was up.
 *
 * Keeping the timer in a scheduler that only the caller can cancel means renders
 * cannot touch it. Requests are idempotent per round, and a call that fails to
 * land is retried because nothing downstream would ever notice it was lost.
 */

export type RoundActionTimers = {
  setTimeout: (handler: () => void, timeoutMs: number) => unknown;
  clearTimeout: (handle: unknown) => void;
};

export type RoundActionSchedulerOptions = {
  /** Pause before the first attempt. 0 sends immediately. */
  delayMs: number;
  /** Delay between attempts when a call fails to land. */
  retryMs: number;
  /** Extra attempts after the first one. */
  maxRetries: number;
  /** Sends the call. Resolve `true` when it landed, `false` to retry. */
  send: (round: number) => Promise<boolean>;
  /** Called once the round is done being pushed, landed or not. */
  onSettled: (round: number) => void;
  timers?: RoundActionTimers;
};

export type RoundActionScheduler = {
  /**
   * Ask for `round` to be pushed once the delay elapses. Repeat calls for a
   * round already requested are ignored, so this is safe to call on every render.
   */
  request: (round: number) => void;
  /** Drop any pending work. The scheduler is dead afterwards. */
  cancel: () => void;
};

const defaultTimers: RoundActionTimers = {
  setTimeout: (handler, timeoutMs) => setTimeout(handler, timeoutMs),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export function createRoundActionScheduler(
  options: RoundActionSchedulerOptions,
): RoundActionScheduler {
  const { delayMs, retryMs, maxRetries, send, onSettled, timers = defaultTimers } = options;

  let requestedRound: number | null = null;
  let handle: unknown = null;
  let cancelled = false;

  const clearPending = () => {
    if (handle !== null) {
      timers.clearTimeout(handle);
      handle = null;
    }
  };

  /** True while `round` is still the round this scheduler is working on. */
  const isCurrent = (round: number) => !cancelled && requestedRound === round;

  const attempt = (round: number, retriesLeft: number) => {
    void send(round).then((landed) => {
      if (!isCurrent(round)) return;

      if (!landed && retriesLeft > 0) {
        handle = timers.setTimeout(() => {
          handle = null;
          attempt(round, retriesLeft - 1);
        }, retryMs);
        return;
      }

      onSettled(round);
    });
  };

  return {
    request(round) {
      if (cancelled || requestedRound === round) return;

      // A newer round supersedes whatever the previous one still had pending.
      clearPending();
      requestedRound = round;
      handle = timers.setTimeout(() => {
        handle = null;
        attempt(round, maxRetries);
      }, delayMs);
    },

    cancel() {
      cancelled = true;
      clearPending();
    },
  };
}
