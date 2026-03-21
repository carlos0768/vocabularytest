import { HeuristicProvider } from './heuristic.js';
import { OpenAiCompatibleProvider } from './openai-compatible.js';
import type { RiskAssessmentProvider } from './types.js';

export function resolveProviderFromEnv(env: NodeJS.ProcessEnv): RiskAssessmentProvider {
  const configured = (env.INVESTIGATION_PROVIDER || 'heuristic').trim().toLowerCase();

  // Support both 'openai-compatible' (new) and 'kimi' (legacy) for backward compatibility
  if (configured === 'openai-compatible' || configured === 'kimi') {
    const endpoint = env.OPENAI_COMPATIBLE_ENDPOINT?.trim() || env.KIMI_ENDPOINT?.trim();
    const apiKey = env.OPENAI_COMPATIBLE_API_KEY?.trim() || env.KIMI_API_KEY?.trim();
    const model = env.OPENAI_COMPATIBLE_MODEL?.trim() || env.KIMI_MODEL?.trim() || 'gpt-4o';
    if (!endpoint || !apiKey) {
      throw new Error('OpenAI-compatible provider selected but endpoint or API key is missing. Set OPENAI_COMPATIBLE_ENDPOINT/OPENAI_COMPATIBLE_API_KEY (or KIMI_ENDPOINT/KIMI_API_KEY for legacy)');
    }
    return new OpenAiCompatibleProvider({ endpoint, apiKey, model });
  }

  return new HeuristicProvider();
}
