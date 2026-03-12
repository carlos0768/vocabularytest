export const DEFAULT_GEMINI_FLASH_MODEL = 'gemini-2.5-flash' as const;
export const DEFAULT_GEMINI_GENERATION_MODEL = 'gemini-2.0-flash' as const;

const GEMINI_MODEL_ALIASES: Record<string, string> = {
  'gemini-1.5-flash-002': DEFAULT_GEMINI_FLASH_MODEL,
  'gemini-2.0-flash-001': DEFAULT_GEMINI_GENERATION_MODEL,
  'gemini-2.5-flash-001': DEFAULT_GEMINI_FLASH_MODEL,
  'gemini-3-flash-preview': DEFAULT_GEMINI_FLASH_MODEL,
};

const SUPPORTED_GEMINI_MODELS = new Set<string>([
  DEFAULT_GEMINI_FLASH_MODEL,
  DEFAULT_GEMINI_GENERATION_MODEL,
  'gemini-1.5-pro-002',
  'gemini-2.5-pro',
]);

export function normalizeGeminiModel(model: string | null | undefined): string {
  const sanitized = (model ?? '').trim().toLowerCase().replace(/^models\//, '');

  if (!sanitized) {
    return DEFAULT_GEMINI_FLASH_MODEL;
  }

  const aliased = GEMINI_MODEL_ALIASES[sanitized];
  if (aliased) {
    return aliased;
  }

  if (SUPPORTED_GEMINI_MODELS.has(sanitized)) {
    return sanitized;
  }

  if (sanitized.startsWith('gemini-2.5-flash')) {
    return DEFAULT_GEMINI_FLASH_MODEL;
  }

  if (sanitized.includes('flash')) {
    return DEFAULT_GEMINI_FLASH_MODEL;
  }

  return sanitized;
}
