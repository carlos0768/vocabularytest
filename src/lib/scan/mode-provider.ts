import { AI_CONFIG, type AIProvider } from '@/lib/ai/config';
import { isCloudRunConfigured } from '@/lib/ai/providers';

// Extraction modes (aligned with iOS: no highlighted / wrong-answer scan)
// - 'all': Extract all words
// - 'circled': Extract hand-circled words only
// - 'eiken': Extract words filtered by EIKEN level
// - 'idiom': Extract idioms and phrases only
export type ExtractMode = 'all' | 'circled' | 'eiken' | 'idiom';

export type ProviderApiKeys = {
  gemini?: string;
  openai?: string;
};

export function getProvidersForMode(mode: ExtractMode): AIProvider[] {
  switch (mode) {
    case 'idiom':
      return [AI_CONFIG.extraction.idioms.provider];
    case 'eiken':
      return [AI_CONFIG.extraction.eiken.provider];
    case 'circled':
      return [AI_CONFIG.extraction.circled.provider];
    case 'all':
    default:
      return [AI_CONFIG.extraction.words.provider];
  }
}

export function getMissingProviderKey(
  mode: ExtractMode,
  apiKeys: ProviderApiKeys,
): AIProvider | null {
  if (isCloudRunConfigured()) return null;

  const requiredProviders = new Set(getProvidersForMode(mode));
  for (const provider of requiredProviders) {
    if (!apiKeys[provider]) {
      return provider;
    }
  }

  return null;
}
