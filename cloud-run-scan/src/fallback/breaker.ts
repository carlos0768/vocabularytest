import type {
  BreakerObservation,
  BreakerState,
  ClassifiedGeminiError,
  WindowStats,
} from './types.js';

interface BreakerEvent {
  ts: number;
  eligibleError: boolean;
  is429: boolean;
  is5xx: boolean;
}

interface BreakerConfig {
  windowMs: number;
  openMs: number;
  halfOpenProbeCount: number;
}

const DEFAULT_BREAKER_CONFIG: BreakerConfig = {
  windowMs: 60_000,
  openMs: 300_000,
  halfOpenProbeCount: 3,
};

function emptyWindowStats(): WindowStats {
  return {
    totalRequests: 0,
    eligibleErrors: 0,
    count429: 0,
    count5xx: 0,
    errorRate: 0,
  };
}

export class RollingCircuitBreaker {
  private config: BreakerConfig;
  private state: BreakerState = 'CLOSED';
  private openUntil = 0;
  private halfOpenSuccesses = 0;
  private events: BreakerEvent[] = [];

  constructor(config: Partial<BreakerConfig> = {}) {
    this.config = {
      ...DEFAULT_BREAKER_CONFIG,
      ...config,
    };
  }

  getState(now: number = Date.now()): BreakerState {
    this.pruneWindow(now);

    if (this.state === 'OPEN' && now >= this.openUntil) {
      this.state = 'HALF_OPEN';
      this.halfOpenSuccesses = 0;
    }

    return this.state;
  }

  snapshot(now: number = Date.now()): { state: BreakerState; windowStats: WindowStats } {
    return {
      state: this.getState(now),
      windowStats: this.getWindowStats(now),
    };
  }

  recordSuccess(now: number = Date.now()): BreakerObservation {
    const state = this.getState(now);
    this.events.push({
      ts: now,
      eligibleError: false,
      is429: false,
      is5xx: false,
    });

    let transitionedToClosed = false;
    if (state === 'HALF_OPEN') {
      this.halfOpenSuccesses += 1;
      if (this.halfOpenSuccesses >= this.config.halfOpenProbeCount) {
        this.state = 'CLOSED';
        this.halfOpenSuccesses = 0;
        transitionedToClosed = true;
      }
    }

    return {
      state: this.getState(now),
      transitionedToOpen: false,
      transitionedToClosed,
      windowStats: this.getWindowStats(now),
    };
  }

  recordFailure(error: ClassifiedGeminiError, now: number = Date.now()): BreakerObservation {
    const state = this.getState(now);
    const is429 = error.kind === '429';
    const is5xx = error.kind === 'UPSTREAM_5XX';

    this.events.push({
      ts: now,
      eligibleError: error.eligibleForBreaker,
      is429,
      is5xx,
    });

    if (state === 'HALF_OPEN' && this.shouldReOpenOnHalfOpenFailure(error)) {
      return this.open('HALF_OPEN_FAILURE', now);
    }

    if (state === 'CLOSED' && error.eligibleForBreaker) {
      const stats = this.getWindowStats(now);

      if (stats.count429 >= 10) {
        return this.open('THRESHOLD_429', now);
      }

      if (stats.count5xx >= 6) {
        return this.open('THRESHOLD_5XX', now);
      }

      if (stats.totalRequests >= 20 && stats.errorRate >= 0.3) {
        return this.open('THRESHOLD_ERROR_RATE', now);
      }
    }

    return {
      state: this.getState(now),
      transitionedToOpen: false,
      transitionedToClosed: false,
      windowStats: this.getWindowStats(now),
    };
  }

  forceOpen(reason: string, now: number = Date.now()): BreakerObservation {
    return this.open(reason, now);
  }

  private open(reason: string, now: number): BreakerObservation {
    const prevState = this.getState(now);
    this.state = 'OPEN';
    this.openUntil = now + this.config.openMs;
    this.halfOpenSuccesses = 0;

    return {
      state: this.state,
      transitionedToOpen: prevState !== 'OPEN',
      transitionedToClosed: false,
      openReason: reason,
      windowStats: this.getWindowStats(now),
    };
  }

  private shouldReOpenOnHalfOpenFailure(error: ClassifiedGeminiError): boolean {
    return error.kind === '429' || error.kind === 'UPSTREAM_5XX' || error.kind === 'TIMEOUT';
  }

  private getWindowStats(now: number): WindowStats {
    this.pruneWindow(now);

    const totalRequests = this.events.length;
    if (totalRequests === 0) {
      return emptyWindowStats();
    }

    let eligibleErrors = 0;
    let count429 = 0;
    let count5xx = 0;

    for (const event of this.events) {
      if (event.eligibleError) eligibleErrors += 1;
      if (event.is429) count429 += 1;
      if (event.is5xx) count5xx += 1;
    }

    return {
      totalRequests,
      eligibleErrors,
      count429,
      count5xx,
      errorRate: totalRequests > 0 ? eligibleErrors / totalRequests : 0,
    };
  }

  private pruneWindow(now: number) {
    const cutoff = now - this.config.windowMs;
    while (this.events.length > 0 && this.events[0].ts < cutoff) {
      this.events.shift();
    }
  }
}
