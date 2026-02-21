import type { ClassifiedGeminiError, RateLimitLabel } from './types.js';

const QUOTA_KEYWORDS = [
  'quota exceeded',
  'quota limit exceeded',
  'insufficient quota',
  'plan and billing',
  'billing',
  'daily limit',
  'quota exceeded for metric',
  'generate_content_free_tier_requests',
] as const;

const RATE_LIMIT_KEYWORDS = [
  'rate limit',
  'too many requests',
  'per minute',
] as const;

const OVERLOADED_KEYWORDS = [
  'please try again later',
  'resource exhausted',
] as const;

function normalizeMessage(message: string): string {
  return message.toLowerCase().replace(/\s+/g, ' ').trim();
}

function includesAny(message: string, keywords: readonly string[]): boolean {
  return keywords.some((keyword) => message.includes(keyword));
}

function findRateLimitExceededReason(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some(findRateLimitExceededReason);
  }

  if (!value || typeof value !== 'object') {
    return false;
  }

  for (const [key, nested] of Object.entries(value)) {
    if (key === 'reason' && nested === 'rateLimitExceeded') {
      return true;
    }
    if (findRateLimitExceededReason(nested)) {
      return true;
    }
  }

  return false;
}

function extractStatusCode(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') {
    return undefined;
  }

  const status = (error as { status?: unknown }).status;
  if (typeof status === 'number') {
    return status;
  }

  const statusCode = (error as { statusCode?: unknown }).statusCode;
  if (typeof statusCode === 'number') {
    return statusCode;
  }

  const code = (error as { code?: unknown }).code;
  if (typeof code === 'number') {
    return code;
  }

  return undefined;
}

function extractMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  if (error && typeof error === 'object') {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string') {
      return message;
    }
  }

  return String(error);
}

export function classify429Label(error: unknown, normalizedMessage?: string): RateLimitLabel {
  const message = normalizedMessage ?? normalizeMessage(extractMessage(error));

  if (findRateLimitExceededReason(error)) {
    return 'RATE_LIMIT_BURST';
  }

  if (includesAny(message, QUOTA_KEYWORDS)) {
    return 'QUOTA_EXHAUSTED';
  }

  if (includesAny(message, RATE_LIMIT_KEYWORDS)) {
    return 'RATE_LIMIT_BURST';
  }

  if (includesAny(message, OVERLOADED_KEYWORDS)) {
    return 'OVERLOADED';
  }

  return 'UNKNOWN';
}

export function classifyGeminiError(error: unknown): ClassifiedGeminiError {
  const statusCode = extractStatusCode(error);
  const message = extractMessage(error);
  const normalized = normalizeMessage(message);

  const looksLike429 =
    statusCode === 429 ||
    normalized.includes(' 429') ||
    normalized.startsWith('429') ||
    normalized.includes('too many requests') ||
    normalized.includes('resource exhausted');

  if (looksLike429) {
    const label = classify429Label(error, normalized);
    return {
      kind: '429',
      label,
      statusCode,
      message,
      reasonForSlack: label,
      eligibleForBreaker: true,
      shouldFallback: true,
      retriable: label !== 'QUOTA_EXHAUSTED',
    };
  }

  const looksLike5xx =
    statusCode === 502 ||
    statusCode === 503 ||
    normalized.includes(' 502') ||
    normalized.includes(' 503') ||
    normalized.includes('bad gateway') ||
    normalized.includes('service unavailable');

  if (looksLike5xx) {
    return {
      kind: 'UPSTREAM_5XX',
      statusCode,
      message,
      reasonForSlack: 'UPSTREAM_5XX',
      eligibleForBreaker: true,
      shouldFallback: true,
      retriable: true,
    };
  }

  const isTimeoutOrNetwork =
    normalized.includes('timeout') ||
    normalized.includes('timed out') ||
    normalized.includes('etimedout') ||
    normalized.includes('econnreset') ||
    normalized.includes('econnrefused') ||
    normalized.includes('enotfound') ||
    normalized.includes('fetch failed') ||
    normalized.includes('socket hang up') ||
    normalized.includes('network');

  if (isTimeoutOrNetwork) {
    return {
      kind: 'TIMEOUT',
      statusCode,
      message,
      reasonForSlack: 'TIMEOUT',
      eligibleForBreaker: true,
      shouldFallback: true,
      retriable: true,
    };
  }

  const isEmptyContent =
    normalized.includes('gemini returned empty content') ||
    normalized.includes('returned empty content');

  if (isEmptyContent) {
    return {
      kind: 'UPSTREAM_5XX',
      statusCode,
      message,
      reasonForSlack: 'EMPTY_CONTENT',
      eligibleForBreaker: true,
      shouldFallback: true,
      retriable: true,
    };
  }
  if (statusCode === 400 || statusCode === 404) {
    return {
      kind: 'INVALID_INPUT',
      statusCode,
      message,
      reasonForSlack: 'INVALID_INPUT',
      eligibleForBreaker: false,
      shouldFallback: false,
      retriable: false,
    };
  }

  if (
    (statusCode === 401 || statusCode === 403) &&
    includesAny(normalized, QUOTA_KEYWORDS)
  ) {
    return {
      kind: '429',
      label: 'QUOTA_EXHAUSTED',
      statusCode,
      message,
      reasonForSlack: 'QUOTA_EXHAUSTED',
      eligibleForBreaker: true,
      shouldFallback: true,
      retriable: false,
    };
  }

  if (statusCode === 401 || statusCode === 403) {
    return {
      kind: 'AUTH_OR_PERMISSION',
      statusCode,
      message,
      reasonForSlack: 'AUTH_OR_PERMISSION',
      eligibleForBreaker: false,
      shouldFallback: false,
      retriable: false,
    };
  }

  const policyBlocked =
    normalized.includes('policy') ||
    normalized.includes('safety') ||
    normalized.includes('blocked');

  if (policyBlocked) {
    return {
      kind: 'POLICY_BLOCK',
      statusCode,
      message,
      reasonForSlack: 'POLICY_BLOCK',
      eligibleForBreaker: false,
      shouldFallback: false,
      retriable: false,
    };
  }

  return {
    kind: 'UNKNOWN',
    statusCode,
    message,
    reasonForSlack: 'UNKNOWN',
    eligibleForBreaker: false,
    shouldFallback: false,
    retriable: false,
  };
}
