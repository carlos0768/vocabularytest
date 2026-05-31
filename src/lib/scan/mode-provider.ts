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

export const EXTRACT_MODES = ['all', 'circled', 'eiken', 'idiom'] as const;

const EXTRACT_MODE_SET = new Set<string>(EXTRACT_MODES);

export function isExtractMode(value: unknown): value is ExtractMode {
  return typeof value === 'string' && EXTRACT_MODE_SET.has(value);
}

function parseModeString(value: string): unknown[] {
  const trimmed = value.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      return [trimmed];
    }
  }
  return trimmed.split(',').map((item) => item.trim()).filter(Boolean);
}

export function normalizeExtractModes(
  value: unknown,
  fallback: ExtractMode[] = ['all'],
): ExtractMode[] {
  const rawValues = Array.isArray(value)
    ? value.flatMap((item) => (typeof item === 'string' ? parseModeString(item) : [item]))
    : typeof value === 'string'
      ? parseModeString(value)
      : value == null
        ? []
        : [value];

  const normalized: ExtractMode[] = [];
  for (const candidate of rawValues) {
    if (!isExtractMode(candidate)) continue;
    if (!normalized.includes(candidate)) {
      normalized.push(candidate);
    }
  }

  return normalized.length > 0 ? normalized : fallback;
}

export function getPrimaryExtractMode(modes: Iterable<ExtractMode>): ExtractMode {
  for (const mode of modes) {
    return mode;
  }
  return 'all';
}

export function requiresProForModes(modes: Iterable<ExtractMode>): boolean {
  for (const mode of modes) {
    if (mode !== 'all') return true;
  }
  return false;
}

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

export function getProvidersForModes(modes: Iterable<ExtractMode>): AIProvider[] {
  const normalized = normalizeExtractModes(Array.from(modes));
  if (normalized.length > 1) {
    return [AI_CONFIG.extraction.words.provider];
  }

  return getProvidersForMode(normalized[0] ?? 'all');
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

export function getMissingProviderKeyForModes(
  modes: Iterable<ExtractMode>,
  apiKeys: ProviderApiKeys,
): AIProvider | null {
  if (isCloudRunConfigured()) return null;

  const requiredProviders = new Set(getProvidersForModes(modes));
  for (const provider of requiredProviders) {
    if (!apiKeys[provider]) {
      return provider;
    }
  }

  return null;
}
