/** Shared color palette for generated book covers */
export const COVER_COLORS: [string, string][] = [
  ['#3b82f6', '#2563eb'], // blue
  ['#8b5cf6', '#7c3aed'], // violet
  ['#06b6d4', '#0891b2'], // cyan
  ['#10b981', '#059669'], // emerald
  ['#f59e0b', '#d97706'], // amber
  ['#ef4444', '#dc2626'], // red
  ['#ec4899', '#db2777'], // pink
  ['#6366f1', '#4f46e5'], // indigo
];

export function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/** Get a deterministic color pair for a given ID */
export function getBookCoverColors(id: string): [string, string] {
  const idx = hashCode(id) % COVER_COLORS.length;
  return COVER_COLORS[idx];
}
