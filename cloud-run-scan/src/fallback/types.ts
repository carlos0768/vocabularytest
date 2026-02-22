export type BreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';
export type AppEnv = 'prod' | 'stg';

export type RateLimitLabel = 'QUOTA_EXHAUSTED' | 'RATE_LIMIT_BURST' | 'OVERLOADED' | 'UNKNOWN';

export type GeminiFailureKind =
  | '429'
  | 'UPSTREAM_5XX'
  | 'TIMEOUT'
  | 'INVALID_INPUT'
  | 'AUTH_OR_PERMISSION'
  | 'POLICY_BLOCK'
  | 'UNKNOWN';

export interface ClassifiedGeminiError {
  kind: GeminiFailureKind;
  label?: RateLimitLabel;
  statusCode?: number;
  message: string;
  reasonForSlack: string;
  eligibleForBreaker: boolean;
  shouldFallback: boolean;
  retriable: boolean;
}

export interface WindowStats {
  totalRequests: number;
  eligibleErrors: number;
  count429: number;
  count5xx: number;
  errorRate: number;
}

export interface BreakerObservation {
  state: BreakerState;
  transitionedToOpen: boolean;
  transitionedToClosed: boolean;
  openReason?: string;
  windowStats: WindowStats;
}

export interface DailyFallbackSummary {
  calls: number;
  yen: number;
}

export interface FallbackRateWindow {
  totalRequests: number;
  fallbackCount: number;
  fallbackRate: number;
}

export interface FallbackContext {
  env: AppEnv;
  feature: string;
  requestId: string;
}

export type FallbackSeverity = 'WARNING' | 'CRITICAL';

export type FallbackSlackEvent =
  | 'QUOTA_EXHAUSTED'
  | 'BREAKER_OPEN'
  | 'FALLBACK_CAP_REACHED'
  | 'FALLBACK_RATE_HIGH'
  | 'AUTH_OR_PERMISSION';

export interface FallbackNotificationPayload {
  env: AppEnv;
  feature: string;
  request_id: string;
  from: 'gemini';
  to: 'openai';
  reason: string;
  breaker_state: BreakerState;
  fallback_today_calls: number;
  fallback_today_yen: number;
  window_stats?: WindowStats;
  sample_error?: string;
  extra?: Record<string, unknown>;
}

export interface FallbackConfig {
  fallbackOpenAIModel: string;
  fallbackCallsDailyCap: number;
  fallbackCostDailyCapYen: number;
  fallbackEstimatedYenPerCall: number;
  breakerOpenMs: number;
  breakerWindowMs: number;
  breakerHalfOpenProbeCount: number;
  fallbackRateWindowMs: number;
  fallbackRateWarnThreshold: number;
  slackWebhookUrl?: string;
  appEnv: AppEnv;
}

export interface ProviderUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

export interface ProviderGenerateResult {
  content: string;
  modelUsed: string;
  usage?: ProviderUsage;
}

export interface FallbackRunnerDeps {
  runGemini: () => Promise<ProviderGenerateResult>;
  runOpenAI: (model: string) => Promise<ProviderGenerateResult>;
}

export interface ExecuteGeminiWithFallbackInput {
  ctx: FallbackContext;
  modelOverride?: string;
}

export interface ExecuteGeminiWithFallbackResult {
  provider: 'gemini' | 'openai';
  content: string;
  modelUsed: string;
  usage?: ProviderUsage;
  fallbackReason?: string;
}
