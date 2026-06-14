import { Firestore, Timestamp } from '@google-cloud/firestore';
import type { GatewayLimiterConfig, GatewayLimiterSummary } from './gateway-limiter.js';

export interface GatewayFirestoreGuardConfig {
  enabled: boolean;
  failClosed: boolean;
  projectId?: string;
  stateDocPath: string;
}

export interface GatewayGuardReservation extends GatewayLimiterSummary {
  allowed: boolean;
  reason?: 'budget-guard-disabled' | 'global-daily-cap-reached' | 'budget-guard-error';
  disabledReason?: string;
}

export interface GatewayBudgetGuard {
  readonly store: 'disabled' | 'firestore';
  reserveStart(now?: number): Promise<GatewayGuardReservation>;
}

const DEFAULT_STATE_DOC_PATH = 'ops/aiGatewayGuard';

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value.trim() === '') {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === 'true' || normalized === '1' || normalized === 'yes') {
    return true;
  }
  if (normalized === 'false' || normalized === '0' || normalized === 'no') {
    return false;
  }
  return fallback;
}

function utcDayKey(timestampMs: number): string {
  return new Date(timestampMs).toISOString().slice(0, 10);
}

function readNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export function loadGatewayFirestoreGuardConfigFromEnv(env: NodeJS.ProcessEnv): GatewayFirestoreGuardConfig {
  return {
    enabled: parseBoolean(env.GATEWAY_FIRESTORE_GUARD_ENABLED, false),
    failClosed: parseBoolean(env.GATEWAY_FIRESTORE_GUARD_FAIL_CLOSED, true),
    projectId: env.GCP_PROJECT_ID?.trim() || undefined,
    stateDocPath: env.GATEWAY_GUARD_STATE_DOC?.trim() || DEFAULT_STATE_DOC_PATH,
  };
}

export function evaluateGatewayGuardState(
  stateData: Record<string, unknown> | undefined,
  dayData: Record<string, unknown> | undefined,
  limiterConfig: GatewayLimiterConfig,
): GatewayGuardReservation {
  const calls = readNumber(dayData?.calls);
  const yen = readNumber(dayData?.yen);

  if (stateData?.disabled === true) {
    return {
      allowed: false,
      reason: 'budget-guard-disabled',
      disabledReason: readString(stateData.disabledReason),
      calls,
      yen,
      callsDailyCap: limiterConfig.callsDailyCap,
      costDailyCapYen: limiterConfig.costDailyCapYen,
    };
  }

  if (calls >= limiterConfig.callsDailyCap || yen >= limiterConfig.costDailyCapYen) {
    return {
      allowed: false,
      reason: 'global-daily-cap-reached',
      calls,
      yen,
      callsDailyCap: limiterConfig.callsDailyCap,
      costDailyCapYen: limiterConfig.costDailyCapYen,
    };
  }

  return {
    allowed: true,
    calls: calls + 1,
    yen: yen + limiterConfig.estimatedYenPerCall,
    callsDailyCap: limiterConfig.callsDailyCap,
    costDailyCapYen: limiterConfig.costDailyCapYen,
  };
}

class DisabledGatewayBudgetGuard implements GatewayBudgetGuard {
  readonly store = 'disabled' as const;

  constructor(private readonly limiterConfig: GatewayLimiterConfig) {}

  async reserveStart(): Promise<GatewayGuardReservation> {
    return {
      allowed: true,
      calls: 0,
      yen: 0,
      callsDailyCap: this.limiterConfig.callsDailyCap,
      costDailyCapYen: this.limiterConfig.costDailyCapYen,
    };
  }
}

class FirestoreGatewayBudgetGuard implements GatewayBudgetGuard {
  readonly store = 'firestore' as const;
  private readonly firestore: Firestore;

  constructor(
    private readonly config: GatewayFirestoreGuardConfig,
    private readonly limiterConfig: GatewayLimiterConfig,
  ) {
    this.firestore = new Firestore({
      projectId: config.projectId,
      preferRest: true,
    });
  }

  async reserveStart(now: number = Date.now()): Promise<GatewayGuardReservation> {
    const stateRef = this.firestore.doc(this.config.stateDocPath);
    const dayKey = utcDayKey(now);
    const dayRef = stateRef.collection('daily').doc(dayKey);
    const timestamp = Timestamp.fromMillis(now);

    try {
      return await this.firestore.runTransaction(async (transaction) => {
        const [stateSnap, daySnap] = await Promise.all([
          transaction.get(stateRef),
          transaction.get(dayRef),
        ]);

        const decision = evaluateGatewayGuardState(
          stateSnap.exists ? stateSnap.data() : undefined,
          daySnap.exists ? daySnap.data() : undefined,
          this.limiterConfig,
        );

        if (!decision.allowed) {
          return decision;
        }

        transaction.set(
          dayRef,
          {
            dayKey,
            calls: decision.calls,
            yen: decision.yen,
            callsDailyCap: this.limiterConfig.callsDailyCap,
            costDailyCapYen: this.limiterConfig.costDailyCapYen,
            estimatedYenPerCall: this.limiterConfig.estimatedYenPerCall,
            updatedAt: timestamp,
            ...(daySnap.exists ? {} : { createdAt: timestamp }),
          },
          { merge: true },
        );

        return decision;
      });
    } catch (error) {
      console.error('[gateway-budget-guard-error]', error);
      if (!this.config.failClosed) {
        return {
          allowed: true,
          calls: 0,
          yen: 0,
          callsDailyCap: this.limiterConfig.callsDailyCap,
          costDailyCapYen: this.limiterConfig.costDailyCapYen,
        };
      }

      return {
        allowed: false,
        reason: 'budget-guard-error',
        calls: 0,
        yen: 0,
        callsDailyCap: this.limiterConfig.callsDailyCap,
        costDailyCapYen: this.limiterConfig.costDailyCapYen,
      };
    }
  }
}

export function createGatewayBudgetGuard(
  config: GatewayFirestoreGuardConfig,
  limiterConfig: GatewayLimiterConfig,
): GatewayBudgetGuard {
  if (!config.enabled) {
    return new DisabledGatewayBudgetGuard(limiterConfig);
  }

  return new FirestoreGatewayBudgetGuard(config, limiterConfig);
}
