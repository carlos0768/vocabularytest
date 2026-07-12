import type { NormalizedUsage } from './types.js';

interface OpenAIUsageLike {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  prompt_tokens_details?: { cached_tokens?: number };
  completion_tokens_details?: { reasoning_tokens?: number };
}

export function normalizeOpenAIUsage(
  usage: OpenAIUsageLike | null | undefined,
  model: string,
  imageInputPresent: boolean,
): NormalizedUsage {
  if (!usage) {
    return {
      provider: 'openai',
      model,
      imageInputPresent,
      usageAvailable: false,
      usageSource: 'missing',
    };
  }

  return {
    provider: 'openai',
    model,
    inputTokens: usage.prompt_tokens,
    outputTokens: usage.completion_tokens,
    totalTokens: usage.total_tokens,
    cachedInputTokens: usage.prompt_tokens_details?.cached_tokens,
    thinkingTokens: usage.completion_tokens_details?.reasoning_tokens,
    imageInputPresent,
    usageAvailable: true,
    usageSource: 'provider_response',
  };
}

interface GeminiUsageMetadataLike {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  totalTokenCount?: number;
  cachedContentTokenCount?: number;
  thoughtsTokenCount?: number;
}

export function normalizeGeminiUsage(
  usageMetadata: GeminiUsageMetadataLike | null | undefined,
  model: string,
  imageInputPresent: boolean,
): NormalizedUsage {
  if (!usageMetadata) {
    return {
      provider: 'gemini',
      model,
      imageInputPresent,
      usageAvailable: false,
      usageSource: 'missing',
    };
  }

  return {
    provider: 'gemini',
    model,
    inputTokens: usageMetadata.promptTokenCount,
    outputTokens: usageMetadata.candidatesTokenCount,
    totalTokens: usageMetadata.totalTokenCount,
    cachedInputTokens: usageMetadata.cachedContentTokenCount,
    thinkingTokens: usageMetadata.thoughtsTokenCount,
    imageInputPresent,
    usageAvailable: true,
    usageSource: 'provider_response',
  };
}
