import { Firestore, Timestamp } from '@google-cloud/firestore';
import type { CostCalculationMode } from './pricing/types.js';

export interface GatewayCapConfig {
  costDailyCapYen: number;
  /** 0 disables this secondary safety cap. */
  usageMissingCallsDailyCap: number;
}

export interface GatewayFirestoreGuardConfig {
  enabled: boolean;
  failClosed: boolean;
  projectId?: string;
  stateDocPath: string;
}

export type GatewayBlockReason =
  | 'budget_guard_disabled'
  | 'global_daily_cost_cap_reached'
  | 'usage_missing_fallback_cap_reached'
  | 'budget_guard_error';

export interface GatewayEligibility {
  allowed: boolean;
  reason?: GatewayBlockReason;
  disabledReason?: string;
  calls: number;
  yen: number;
  costDailyCapYen: number;
}

export interface CommitRequestCostInput {
  requestId: string;
  provider: 'openai' | 'gemini';
  modelUsed: string;
  estimatedCostUsd: number;
  estimatedCostJpy: number;
  pricingVersion: string;
  costCalculationMode: CostCalculationMode;
  usageAvailable: boolean;
}

export interface GatewayDailyTotals {
  calls: number;
  yen: number;
  estimatedCostUsdTotal: number;
  usageMissingCalls: number;
  fallbackPricedCalls: number;
}

export interface GatewayBudgetGuard {
  readonly store: 'disabled' | 'firestore';
  /** Checks caps/disabled state and atomically reserves a call slot. Does not add cost. */
  checkEligibility(now?: number): Promise<GatewayEligibility>;
  /** Adds the actual estimated cost for a completed request. */
  commitRequestCost(input: CommitRequestCostInput, now?: number): Promise<GatewayDailyTotals>;
  /** Best-effort observability for a failed request. Never adds cost (D3: zero cost + failure log). */
  recordFailure(requestId: string, now?: number): Promise<void>;
}

const DEFAULT_STATE_DOC_PATH = 'ops/aiGatewayGuard';
const FALLBACK_COST_MODES = new Set<CostCalculationMode>(['flat_fallback', 'usage_priced_with_fallback_parts']);

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

function parseNonNegativeNumber(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === '') {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : fallback;
}

function utcDayKey(timestampMs: number): string {
  return new Date(timestampMs).toISOString().slice(0, 10);
}

function readNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0;
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export function loadGatewayCapConfigFromEnv(env: NodeJS.ProcessEnv): GatewayCapConfig {
  return {
    costDailyCapYen: parseNonNegativeNumber(env.GATEWAY_COST_DAILY_CAP_YEN, 900),
    usageMissingCallsDailyCap: parseNonNegativeNumber(env.GATEWAY_USAGE_MISSING_CALLS_DAILY_CAP, 0),
  };
}

export function loadGatewayFirestoreGuardConfigFromEnv(env: NodeJS.ProcessEnv): GatewayFirestoreGuardConfig {
  return {
    enabled: parseBoolean(env.GATEWAY_FIRESTORE_GUARD_ENABLED, false),
    failClosed: parseBoolean(env.GATEWAY_FIRESTORE_GUARD_FAIL_CLOSED, true),
    projectId: env.GCP_PROJECT_ID?.trim() || undefined,
    stateDocPath: env.GATEWAY_GUARD_STATE_DOC?.trim() || DEFAULT_STATE_DOC_PATH,
  };
}

/**
 * Pure decision function used both by the transactional Firestore guard and
 * by unit tests. Reserves the next call slot on success; never touches yen.
 */
export function evaluateGatewayEligibility(
  stateData: Record<string, unknown> | undefined,
  dayData: Record<string, unknown> | undefined,
  capConfig: GatewayCapConfig,
): GatewayEligibility {
  const calls = readNumber(dayData?.calls);
  const yen = readNumber(dayData?.yen);
  const usageMissingCalls = readNumber(dayData?.usageMissingCalls);

  if (stateData?.disabled === true) {
    return {
      allowed: false,
      reason: 'budget_guard_disabled',
      disabledReason: readString(stateData.disabledReason),
      calls,
      yen,
      costDailyCapYen: capConfig.costDailyCapYen,
    };
  }

  if (yen >= capConfig.costDailyCapYen) {
    return {
      allowed: false,
      reason: 'global_daily_cost_cap_reached',
      calls,
      yen,
      costDailyCapYen: capConfig.costDailyCapYen,
    };
  }

  if (capConfig.usageMissingCallsDailyCap > 0 && usageMissingCalls >= capConfig.usageMissingCallsDailyCap) {
    return {
      allowed: false,
      reason: 'usage_missing_fallback_cap_reached',
      calls,
      yen,
      costDailyCapYen: capConfig.costDailyCapYen,
    };
  }

  return {
    allowed: true,
    calls: calls + 1,
    yen,
    costDailyCapYen: capConfig.costDailyCapYen,
  };
}

class DisabledGatewayBudgetGuard implements GatewayBudgetGuard {
  readonly store = 'disabled' as const;

  constructor(private readonly capConfig: GatewayCapConfig) {}

  async checkEligibility(): Promise<GatewayEligibility> {
    return {
      allowed: true,
      calls: 0,
      yen: 0,
      costDailyCapYen: this.capConfig.costDailyCapYen,
    };
  }

  async commitRequestCost(): Promise<GatewayDailyTotals> {
    return { calls: 0, yen: 0, estimatedCostUsdTotal: 0, usageMissingCalls: 0, fallbackPricedCalls: 0 };
  }

  async recordFailure(): Promise<void> {
    // No shared state to update when the guard is disabled.
  }
}

class FirestoreGatewayBudgetGuard implements GatewayBudgetGuard {
  readonly store = 'firestore' as const;
  private readonly firestore: Firestore;

  constructor(
    private readonly config: GatewayFirestoreGuardConfig,
    private readonly capConfig: GatewayCapConfig,
  ) {
    this.firestore = new Firestore({
      projectId: config.projectId,
      preferRest: true,
    });
  }

  private dayRef(now: number) {
    const stateRef = this.firestore.doc(this.config.stateDocPath);
    const dayKey = utcDayKey(now);
    return { stateRef, dayKey, dayRef: stateRef.collection('daily').doc(dayKey) };
  }

  async checkEligibility(now: number = Date.now()): Promise<GatewayEligibility> {
    const { stateRef, dayKey, dayRef } = this.dayRef(now);
    const timestamp = Timestamp.fromMillis(now);

    try {
      return await this.firestore.runTransaction(async (transaction) => {
        const [stateSnap, daySnap] = await Promise.all([
          transaction.get(stateRef),
          transaction.get(dayRef),
        ]);

        const decision = evaluateGatewayEligibility(
          stateSnap.exists ? stateSnap.data() : undefined,
          daySnap.exists ? daySnap.data() : undefined,
          this.capConfig,
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
            costDailyCapYen: this.capConfig.costDailyCapYen,
            updatedAt: timestamp,
            ...(daySnap.exists ? {} : { createdAt: timestamp }),
          },
          { merge: true },
        );

        return decision;
      });
    } catch (error) {
      console.error('[gateway-budget-guard-error]', { requestPhase: 'checkEligibility', error });
      if (!this.config.failClosed) {
        return {
          allowed: true,
          calls: 0,
          yen: 0,
          costDailyCapYen: this.capConfig.costDailyCapYen,
        };
      }

      return {
        allowed: false,
        reason: 'budget_guard_error',
        calls: 0,
        yen: 0,
        costDailyCapYen: this.capConfig.costDailyCapYen,
      };
    }
  }

  async commitRequestCost(input: CommitRequestCostInput, now: number = Date.now()): Promise<GatewayDailyTotals> {
    const { dayKey, dayRef } = this.dayRef(now);
    const timestamp = Timestamp.fromMillis(now);
    const isFallbackPriced = FALLBACK_COST_MODES.has(input.costCalculationMode);

    try {
      return await this.firestore.runTransaction(async (transaction) => {
        const daySnap = await transaction.get(dayRef);
        const data = daySnap.exists ? daySnap.data() : undefined;

        const totals: GatewayDailyTotals = {
          calls: readNumber(data?.calls),
          yen: readNumber(data?.yen) + input.estimatedCostJpy,
          estimatedCostUsdTotal: readNumber(data?.estimatedCostUsdTotal) + input.estimatedCostUsd,
          usageMissingCalls: readNumber(data?.usageMissingCalls) + (input.usageAvailable ? 0 : 1),
          fallbackPricedCalls: readNumber(data?.fallbackPricedCalls) + (isFallbackPriced ? 1 : 0),
        };

        transaction.set(
          dayRef,
          {
            dayKey,
            calls: totals.calls,
            yen: totals.yen,
            estimatedCostUsdTotal: totals.estimatedCostUsdTotal,
            usageMissingCalls: totals.usageMissingCalls,
            fallbackPricedCalls: totals.fallbackPricedCalls,
            costDailyCapYen: this.capConfig.costDailyCapYen,
            pricingVersion: input.pricingVersion,
            lastRequestId: input.requestId,
            lastModelUsed: input.modelUsed,
            updatedAt: timestamp,
            ...(daySnap.exists ? {} : { createdAt: timestamp }),
          },
          { merge: true },
        );

        return totals;
      });
    } catch (error) {
      console.error('[gateway-budget-guard-error]', { requestPhase: 'commitRequestCost', requestId: input.requestId, error });
      return { calls: 0, yen: 0, estimatedCostUsdTotal: 0, usageMissingCalls: 0, fallbackPricedCalls: 0 };
    }
  }

  async recordFailure(requestId: string, now: number = Date.now()): Promise<void> {
    const { dayKey, dayRef } = this.dayRef(now);
    const timestamp = Timestamp.fromMillis(now);

    try {
      await dayRef.set(
        {
          dayKey,
          lastFailedRequestId: requestId,
          updatedAt: timestamp,
        },
        { merge: true },
      );
    } catch (error) {
      console.error('[gateway-budget-guard-error]', { requestPhase: 'recordFailure', requestId, error });
    }
  }
}

export function createGatewayBudgetGuard(
  config: GatewayFirestoreGuardConfig,
  capConfig: GatewayCapConfig,
): GatewayBudgetGuard {
  if (!config.enabled) {
    return new DisabledGatewayBudgetGuard(capConfig);
  }

  return new FirestoreGatewayBudgetGuard(config, capConfig);
}
