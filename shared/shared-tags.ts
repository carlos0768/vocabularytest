const MAX_SHARED_TAGS = 8;
const MAX_SHARED_TAG_LENGTH = 20;

type NormalizeSharedTagsOptions = {
  requireHashPrefix?: boolean;
};

function normalizeSharedTag(tag: string, options: NormalizeSharedTagsOptions): string | null {
  const trimmed = tag.trim();
  if (!trimmed) return null;
  if (options.requireHashPrefix && !/^[#＃]/.test(trimmed)) return null;

  const normalized = trimmed
    .replace(/^[#＃/／]+/, '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, MAX_SHARED_TAG_LENGTH);

  return normalized || null;
}

export function normalizeSharedTags(
  tags?: readonly string[] | null,
  options: NormalizeSharedTagsOptions = {},
): string[] {
  if (!tags || tags.length === 0) return [];

  const result: string[] = [];
  const seen = new Set<string>();

  for (const tag of tags) {
    const normalized = normalizeSharedTag(tag, options);
    if (!normalized) continue;

    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
    if (result.length >= MAX_SHARED_TAGS) break;
  }

  return result;
}

export function parseSharedTagsInput(input: string): string[] {
  const candidates = input
    .split(/[,、\n]/g)
    .flatMap((part) => part.split(/\s+(?=[#＃])/g));

  return normalizeSharedTags(candidates, { requireHashPrefix: true });
}

export function formatSharedTag(tag: string): string {
  const normalized = normalizeSharedTags([tag])[0];
  return normalized ? `#${normalized}` : '';
}
