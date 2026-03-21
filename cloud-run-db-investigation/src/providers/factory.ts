import { HeuristicProvider } from './heuristic.js';
import { KimiProvider } from './kimi.js';
import type { RiskAssessmentProvider } from './types.js';

export function resolveProviderFromEnv(env: NodeJS.ProcessEnv): RiskAssessmentProvider {
  const configured = (env.INVESTIGATION_PROVIDER || 'heuristic').trim().toLowerCase();

  if (configured === 'kimi') {
    const endpoint = env.KIMI_ENDPOINT?.trim();
    const apiKey = env.KIMI_API_KEY?.trim();
    const model = env.KIMI_MODEL?.trim() || 'kimi-default';
    if (!endpoint || !apiKey) {
      throw new Error('KIMI provider selected but KIMI_ENDPOINT or KIMI_API_KEY is missing');
    }
    return new KimiProvider({ endpoint, apiKey, model });
  }

  return new HeuristicProvider();
}
