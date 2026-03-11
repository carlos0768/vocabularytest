const NOTE_LABELS = new Set([
  'note',
  'notes',
  'notebook',
  'ノート',
  'ﾉｰﾄ',
]);

function normalizeWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

export function normalizeSourceLabel(value: unknown): string | null {
  if (typeof value !== 'string') return null;

  const normalized = normalizeWhitespace(value);
  if (!normalized) return null;

  if (NOTE_LABELS.has(normalized.toLowerCase())) {
    return 'ノート';
  }

  return normalized;
}

export function normalizeSourceLabels(values: Iterable<unknown> | null | undefined): string[] {
  if (!values) return [];

  const deduped = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const normalized = normalizeSourceLabel(value);
    if (!normalized) continue;

    const key = normalized.toLocaleLowerCase('ja-JP');
    if (deduped.has(key)) continue;

    deduped.add(key);
    result.push(normalized);
  }

  return result;
}

export function mergeSourceLabels(...groups: Array<Iterable<unknown> | null | undefined>): string[] {
  return normalizeSourceLabels(groups.flatMap((group) => (group ? Array.from(group) : [])));
}

export function ensureSourceLabels(values: Iterable<unknown> | null | undefined): string[] {
  const normalized = normalizeSourceLabels(values);
  return normalized.length > 0 ? normalized : ['ノート'];
}
