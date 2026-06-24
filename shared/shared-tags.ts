const MAX_SHARED_TAGS = 8;
const MAX_SHARED_TAG_LENGTH = 20;

export function normalizeSharedTags(tags?: readonly string[] | null): string[] {
  if (!tags || tags.length === 0) return [];

  const result: string[] = [];
  const seen = new Set<string>();

  for (const tag of tags) {
    const normalized = tag
      .trim()
      .replace(/^#+/, '')
      .replace(/\s+/g, ' ')
      .slice(0, MAX_SHARED_TAG_LENGTH);
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
  return normalizeSharedTags(input.split(/[,、\n]/g));
}
