import { classifyGeminiError } from './classifier.js';
import { FallbackCounters } from './counters.js';
import { RollingCircuitBreaker } from './breaker.js';
import { SlackFallbackNotifier } from './notifier.js';
import type {
  BreakerState,
  ClassifiedGeminiError,
  ExecuteGeminiWithFallbackInput,
  ExecuteGeminiWithFallbackResult,
  FallbackConfig,
  FallbackContext,
  FallbackRunnerDeps,
} from './types.js';

interface RetryPlan {
  maxRetries: number;
  backoffsMs: number[];
}

const DEFAULT_RETRY_BACKOFFS = [200, 500, 1200] as const;
const TIMEOUT_RETRY_BACKOFF = 300;

const DEFAULT_CONFIG: FallbackConfig = {
  fallbackOpenAIModel: 'gpt-4o',
  fallbackCallsDailyCap: 1000,
  fallbackCostDailyCapYen: 3000,
  fallbackEstimatedYenPerCall: 3,
  breakerOpenMs: 300_000,
  breakerWindowMs: 60_000,
  breakerHalfOpenProbeCount: 3,
  fallbackRateWindowMs: 10 * 60 * 1000,
  fallbackRateWarnThreshold: 0.2,
  appEnv: 'prod',
};

function parseNumber(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeAppEnv(value: string | undefined): 'prod' | 'stg' {
  return value === 'stg' ? 'stg' : 'prod';
}

function nowMs(): number {
  return Date.now();
}

function withJitter(baseMs: number, ratio: number): number {
  const jitter = (Math.random() * 2 - 1) * ratio;
  const value = baseMs * (1 + jitter);
  return Math.max(0, Math.round(value));
}

async function sleep(ms: number): Promise<void> {
  if (ms <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function retryPlanFor(error: ClassifiedGeminiError): RetryPlan {
  if (error.kind === '429') {
    return {
      maxRetries: error.label === 'QUOTA_EXHAUSTED' ? 0 : 2,
      backoffsMs: [...DEFAULT_RETRY_BACKOFFS],
    };
  }

  if (error.kind === 'UPSTREAM_5XX') {
    return {
      maxRetries: 2,
      backoffsMs: [...DEFAULT_RETRY_BACKOFFS],
    };
  }

  if (error.kind === 'TIMEOUT') {
    return {
      maxRetries: 1,
      backoffsMs: [TIMEOUT_RETRY_BACKOFF],
    };
  }

  return {
    maxRetries: 0,
    backoffsMs: [],
  };
}

export function loadFallbackConfigFromEnv(env: NodeJS.ProcessEnv): FallbackConfig {
  return {
    fallbackOpenAIModel: env.FALLBACK_OPENAI_MODEL?.trim() || DEFAULT_CONFIG.fallbackOpenAIModel,
    fallbackCallsDailyCap: parseNumber(env.FALLBACK_CALLS_DAILY_CAP, DEFAULT_CONFIG.fallbackCallsDailyCap),
    fallbackCostDailyCapYen: parseNumber(env.FALLBACK_COST_DAILY_CAP_YEN, DEFAULT_CONFIG.fallbackCostDailyCapYen),
    fallbackEstimatedYenPerCall: parseNumber(env.FALLBACK_ESTIMATED_YEN_PER_CALL, DEFAULT_CONFIG.fallbackEstimatedYenPerCall),
    breakerOpenMs: parseNumber(env.FALLBACK_BREAKER_OPEN_MS, DEFAULT_CONFIG.breakerOpenMs),
    breakerWindowMs: DEFAULT_CONFIG.breakerWindowMs,
    breakerHalfOpenProbeCount: DEFAULT_CONFIG.breakerHalfOpenProbeCount,
    fallbackRateWindowMs: DEFAULT_CONFIG.fallbackRateWindowMs,
    fallbackRateWarnThreshold: DEFAULT_CONFIG.fallbackRateWarnThreshold,
    slackWebhookUrl: env.FALLBACK_SLACK_WEBHOOK_URL?.trim() || undefined,
    appEnv: normalizeAppEnv(env.APP_ENV),
  };
}

export class GeminiFallbackRunner {
  private readonly config: FallbackConfig;
  private readonly breaker: RollingCircuitBreaker;
  private readonly counters: FallbackCounters;
  private readonly notifier: SlackFallbackNotifier;

  constructor(config: FallbackConfig) {
    this.config = config;
    this.breaker = new RollingCircuitBreaker({
      windowMs: config.breakerWindowMs,
      openMs: config.breakerOpenMs,
      halfOpenProbeCount: config.breakerHalfOpenProbeCount,
    });
    this.counters = new FallbackCounters({
      callsDailyCap: config.fallbackCallsDailyCap,
      costDailyCapYen: config.fallbackCostDailyCapYen,
      estimatedYenPerCall: config.fallbackEstimatedYenPerCall,
      fallbackRateWindowMs: config.fallbackRateWindowMs,
    });
    this.notifier = new SlackFallbackNotifier(config.slackWebhookUrl);
  }

  getConfig(): FallbackConfig {
    return this.config;
  }

  async execute(
    input: ExecuteGeminiWithFallbackInput,
    deps: FallbackRunnerDeps,
  ): Promise<ExecuteGeminiWithFallbackResult> {
    this.counters.recordRequest(nowMs());

    const state = this.breaker.getState(nowMs());
    if (state === 'OPEN') {
      return this.fallbackOpenAIOrFail(input.ctx, deps, 'BREAKER_OPEN', undefined, input.modelOverride);
    }

    let retryPlan: RetryPlan | null = null;
    let retriesDone = 0;

    while (true) {
      try {
        const geminiResult = await deps.runGemini();
        this.breaker.recordSuccess(nowMs());
        return {
          provider: 'gemini',
          content: geminiResult.content,
          modelUsed: geminiResult.modelUsed,
          usage: geminiResult.usage,
        };
      } catch (error) {
        const classified = classifyGeminiError(error);
        const observed = this.breaker.recordFailure(classified, nowMs());

        if (observed.transitionedToOpen) {
          await this.notifyBreakerOpened(input.ctx, observed.openReason ?? classified.reasonForSlack);
        }

        if (classified.kind === '429' && classified.label === 'QUOTA_EXHAUSTED') {
          await this.notifyQuotaExhausted(input.ctx, classified.message);
          const forced = this.breaker.forceOpen('QUOTA_EXHAUSTED', nowMs());
          if (forced.transitionedToOpen) {
            await this.notifyBreakerOpened(input.ctx, 'QUOTA_EXHAUSTED');
          }
          return this.fallbackOpenAIOrFail(
            input.ctx,
            deps,
            'QUOTA_EXHAUSTED',
            classified.message,
            input.modelOverride,
          );
        }

        if (classified.kind === 'AUTH_OR_PERMISSION') {
          await this.notifyAuthPermission(input.ctx, classified.message);
          throw new Error('Gemini auth/permission error');
        }

        if (classified.kind === 'INVALID_INPUT' || classified.kind === 'POLICY_BLOCK') {
          throw new Error(classified.message || 'Gemini rejected the request');
        }

        if (!retryPlan) {
          retryPlan = retryPlanFor(classified);
        }

        if (retryPlan.maxRetries > retriesDone) {
          const waitMs = retryPlan.backoffsMs[retriesDone] ?? retryPlan.backoffsMs[retryPlan.backoffsMs.length - 1] ?? 0;
          retriesDone += 1;
          await sleep(withJitter(waitMs, 0.3));
          continue;
        }

        if (!classified.shouldFallback) {
          throw new Error(classified.message || 'Gemini call failed');
        }

        return this.fallbackOpenAIOrFail(
          input.ctx,
          deps,
          classified.reasonForSlack,
          classified.message,
          input.modelOverride,
        );
      }
    }
  }

  private async fallbackOpenAIOrFail(
    ctx: FallbackContext,
    deps: FallbackRunnerDeps,
    reason: string,
    sampleError: string | undefined,
    modelOverride?: string,
  ): Promise<ExecuteGeminiWithFallbackResult> {
    const now = nowMs();

    if (!this.counters.canFallback(now)) {
      const shouldNotify = this.counters.markCapNotified(now);
      if (shouldNotify) {
        await this.notifyCapReached(ctx, reason, sampleError);
      }
      throw new Error('Fallback disabled: cap reached');
    }

    const summary = this.counters.recordFallback(now);

    try {
      const openaiResult = await deps.runOpenAI(modelOverride || this.config.fallbackOpenAIModel);

      const rateWindow = this.counters.getFallbackRateWindow(nowMs());
      if (
        rateWindow.totalRequests > 0 &&
        rateWindow.fallbackRate >= this.config.fallbackRateWarnThreshold
      ) {
        await this.notifyFallbackRateHigh(ctx, reason, sampleError, rateWindow);
      }

      return {
        provider: 'openai',
        content: openaiResult.content,
        modelUsed: openaiResult.modelUsed,
        usage: openaiResult.usage,
        fallbackReason: reason,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[fallback] OpenAI fallback failed:', {
        reason,
        sampleError,
        fallbackTodayCalls: summary.calls,
        fallbackTodayYen: summary.yen,
        message,
      });
      throw new Error('OpenAI fallback failed');
    }
  }

  private buildNotificationPayload(
    ctx: FallbackContext,
    reason: string,
    sampleError?: string,
    extra?: Record<string, unknown>,
  ) {
    const snapshot = this.breaker.snapshot(nowMs());
    const summary = this.counters.getTodaySummary(nowMs());

    return {
      env: ctx.env,
      feature: ctx.feature,
      request_id: ctx.requestId,
      from: 'gemini' as const,
      to: 'openai' as const,
      reason,
      breaker_state: snapshot.state as BreakerState,
      fallback_today_calls: summary.calls,
      fallback_today_yen: summary.yen,
      window_stats: snapshot.windowStats,
      sample_error: sampleError,
      extra,
    };
  }

  private async notifyQuotaExhausted(ctx: FallbackContext, sampleError?: string): Promise<void> {
    await this.notifier.notify(
      'QUOTA_EXHAUSTED',
      'CRITICAL',
      this.buildNotificationPayload(ctx, 'QUOTA_EXHAUSTED', sampleError),
    );
  }

  private async notifyBreakerOpened(ctx: FallbackContext, reason: string): Promise<void> {
    await this.notifier.notify(
      'BREAKER_OPEN',
      'WARNING',
      this.buildNotificationPayload(ctx, reason),
    );
  }

  private async notifyCapReached(
    ctx: FallbackContext,
    reason: string,
    sampleError?: string,
  ): Promise<void> {
    await this.notifier.notify(
      'FALLBACK_CAP_REACHED',
      'CRITICAL',
      this.buildNotificationPayload(ctx, reason, sampleError),
    );
  }

  private async notifyFallbackRateHigh(
    ctx: FallbackContext,
    reason: string,
    sampleError: string | undefined,
    rateWindow: { totalRequests: number; fallbackCount: number; fallbackRate: number },
  ): Promise<void> {
    await this.notifier.notify(
      'FALLBACK_RATE_HIGH',
      'WARNING',
      this.buildNotificationPayload(ctx, reason, sampleError, {
        fallback_rate_10m: rateWindow.fallbackRate,
        fallback_count_10m: rateWindow.fallbackCount,
        total_requests_10m: rateWindow.totalRequests,
      }),
    );
  }

  private async notifyAuthPermission(ctx: FallbackContext, sampleError?: string): Promise<void> {
    await this.notifier.notify(
      'AUTH_OR_PERMISSION',
      'CRITICAL',
      this.buildNotificationPayload(ctx, 'AUTH_OR_PERMISSION', sampleError),
    );
  }
}
