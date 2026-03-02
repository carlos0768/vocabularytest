/** Shared color palette for generated book covers (light mode) */
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

/** Blue-toned palette for dark mode (brand-consistent) */
export const COVER_COLORS_DARK: [string, string][] = [
  ['#2563a8', '#1d4e8a'], // blue
  ['#3b5998', '#2d4a80'], // steel blue
  ['#1e5a8a', '#164a72'], // ocean blue
  ['#2a4a7a', '#1f3d66'], // navy
  ['#3a6090', '#2c5078'], // slate blue
  ['#1a5580', '#134568'], // deep teal-blue
  ['#4060a0', '#305088'], // periwinkle
  ['#2850a0', '#1e4088'], // royal blue
];

export function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/** Get a deterministic color pair for a given ID */
export function getBookCoverColors(id: string, isDark = false): [string, string] {
  const palette = isDark ? COVER_COLORS_DARK : COVER_COLORS;
  const idx = hashCode(id) % palette.length;
  return palette[idx];
}
