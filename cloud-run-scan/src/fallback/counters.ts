import type { DailyFallbackSummary, FallbackRateWindow } from './types.js';

interface CounterConfig {
  callsDailyCap: number;
  costDailyCapYen: number;
  estimatedYenPerCall: number;
  fallbackRateWindowMs: number;
}

const DEFAULT_COUNTER_CONFIG: CounterConfig = {
  callsDailyCap: 1000,
  costDailyCapYen: 3000,
  estimatedYenPerCall: 3,
  fallbackRateWindowMs: 10 * 60 * 1000,
};

function utcDayKey(timestampMs: number): string {
  return new Date(timestampMs).toISOString().slice(0, 10);
}

export class FallbackCounters {
  private readonly config: CounterConfig;
  private dayKey: string;
  private fallbackCalls = 0;
  private fallbackYen = 0;
  private capNotifiedForDay = false;
  private requestTimestamps: number[] = [];
  private fallbackTimestamps: number[] = [];

  constructor(config: Partial<CounterConfig> = {}) {
    this.config = {
      ...DEFAULT_COUNTER_CONFIG,
      ...config,
    };
    this.dayKey = utcDayKey(Date.now());
  }

  recordRequest(now: number = Date.now()): void {
    this.ensureDay(now);
    this.requestTimestamps.push(now);
    this.pruneRateWindow(now);
  }

  canFallback(now: number = Date.now()): boolean {
    this.ensureDay(now);
    return !this.isCapReached();
  }

  recordFallback(now: number = Date.now()): DailyFallbackSummary {
    this.ensureDay(now);
    this.fallbackCalls += 1;
    this.fallbackYen += this.config.estimatedYenPerCall;
    this.fallbackTimestamps.push(now);
    this.pruneRateWindow(now);
    return this.getTodaySummary(now);
  }

  getTodaySummary(now: number = Date.now()): DailyFallbackSummary {
    this.ensureDay(now);
    return {
      calls: this.fallbackCalls,
      yen: this.fallbackYen,
    };
  }

  getFallbackRateWindow(now: number = Date.now()): FallbackRateWindow {
    this.ensureDay(now);
    this.pruneRateWindow(now);

    const totalRequests = this.requestTimestamps.length;
    const fallbackCount = this.fallbackTimestamps.length;

    return {
      totalRequests,
      fallbackCount,
      fallbackRate: totalRequests > 0 ? fallbackCount / totalRequests : 0,
    };
  }

  markCapNotified(now: number = Date.now()): boolean {
    this.ensureDay(now);
    if (this.capNotifiedForDay) {
      return false;
    }

    this.capNotifiedForDay = true;
    return true;
  }

  private ensureDay(now: number) {
    const key = utcDayKey(now);
    if (this.dayKey === key) {
      return;
    }

    this.dayKey = key;
    this.fallbackCalls = 0;
    this.fallbackYen = 0;
    this.capNotifiedForDay = false;
    this.requestTimestamps = [];
    this.fallbackTimestamps = [];
  }

  private isCapReached(): boolean {
    if (this.fallbackCalls >= this.config.callsDailyCap) {
      return true;
    }

    return this.fallbackYen >= this.config.costDailyCapYen;
  }

  private pruneRateWindow(now: number) {
    const cutoff = now - this.config.fallbackRateWindowMs;

    while (this.requestTimestamps.length > 0 && this.requestTimestamps[0] < cutoff) {
      this.requestTimestamps.shift();
    }

    while (this.fallbackTimestamps.length > 0 && this.fallbackTimestamps[0] < cutoff) {
      this.fallbackTimestamps.shift();
    }
  }
}
