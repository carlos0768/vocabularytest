export interface GatewayLimiterConfig {
  costDailyCapYen: number;
  estimatedYenPerCall: number;
}

export interface GatewayLimiterSummary {
  calls: number;
  yen: number;
  costDailyCapYen: number;
}

const DEFAULT_CONFIG: GatewayLimiterConfig = {
  costDailyCapYen: 900,
  estimatedYenPerCall: 3,
};

function utcDayKey(timestampMs: number): string {
  return new Date(timestampMs).toISOString().slice(0, 10);
}

function parseNonNegativeNumber(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === '') {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : fallback;
}

export function loadGatewayLimiterConfigFromEnv(env: NodeJS.ProcessEnv): GatewayLimiterConfig {
  return {
    costDailyCapYen: parseNonNegativeNumber(env.GATEWAY_COST_DAILY_CAP_YEN, DEFAULT_CONFIG.costDailyCapYen),
    estimatedYenPerCall: parseNonNegativeNumber(env.GATEWAY_ESTIMATED_YEN_PER_CALL, DEFAULT_CONFIG.estimatedYenPerCall),
  };
}

export class DailyGatewayLimiter {
  private readonly config: GatewayLimiterConfig;
  private dayKey: string;
  private calls = 0;
  private yen = 0;

  constructor(config: Partial<GatewayLimiterConfig> = {}) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
    };
    this.dayKey = utcDayKey(Date.now());
  }

  canStart(now: number = Date.now()): boolean {
    this.ensureDay(now);
    return this.yen < this.config.costDailyCapYen;
  }

  recordStart(now: number = Date.now()): GatewayLimiterSummary {
    this.ensureDay(now);
    this.calls += 1;
    this.yen += this.config.estimatedYenPerCall;
    return this.getTodaySummary(now);
  }

  getTodaySummary(now: number = Date.now()): GatewayLimiterSummary {
    this.ensureDay(now);
    return {
      calls: this.calls,
      yen: this.yen,
      costDailyCapYen: this.config.costDailyCapYen,
    };
  }

  private ensureDay(now: number): void {
    const key = utcDayKey(now);
    if (this.dayKey === key) {
      return;
    }

    this.dayKey = key;
    this.calls = 0;
    this.yen = 0;
  }
}
