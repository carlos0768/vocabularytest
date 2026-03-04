/** Shared color palette for generated book covers */

// Default (Stitch Blue)
const COVER_COLORS_DEFAULT: [string, string][] = [
  ['#3b82f6', '#2563eb'], // blue
  ['#8b5cf6', '#7c3aed'], // violet
  ['#06b6d4', '#0891b2'], // cyan
  ['#10b981', '#059669'], // emerald
  ['#f59e0b', '#d97706'], // amber
  ['#ef4444', '#dc2626'], // red
  ['#ec4899', '#db2777'], // pink
  ['#6366f1', '#4f46e5'], // indigo
];

// Navy × Copper
const COVER_COLORS_NAVY: [string, string][] = [
  ['#C87941', '#A86330'], // copper
  ['#2E7D8C', '#1F6070'], // teal
  ['#8B6F47', '#6B5535'], // warm brown
  ['#1E4D6E', '#133752'], // deep navy
  ['#A0522D', '#8B4513'], // sienna
  ['#3A7D7B', '#2A5D5B'], // dark teal
  ['#D4A855', '#B8923F'], // gold
  ['#4A6D8C', '#35506B'], // slate blue
];

// Charcoal × Lime
const COVER_COLORS_LIME: [string, string][] = [
  ['#7CB518', '#5A8A0F'], // lime
  ['#3D3D3D', '#2A2A2A'], // charcoal
  ['#B4E33D', '#8BC42A'], // bright lime
  ['#555555', '#404040'], // dark gray
  ['#6B8E23', '#556B2F'], // olive
  ['#4A4A4A', '#333333'], // medium gray
  ['#9ACD32', '#7BA428'], // yellow-green
  ['#2E2E2E', '#1E1E1E'], // near black
];

const THEME_PALETTES: Record<string, [string, string][]> = {
  default: COVER_COLORS_DEFAULT,
  'navy-copper': COVER_COLORS_NAVY,
  'charcoal-lime': COVER_COLORS_LIME,
};

export function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/** Get a deterministic color pair for a given ID */
export function getBookCoverColors(id: string, theme?: string): [string, string] {
  const palette = THEME_PALETTES[theme || 'default'] || COVER_COLORS_DEFAULT;
  const idx = hashCode(id) % palette.length;
  return palette[idx];
}

// Re-export for backward compat
export const COVER_COLORS = COVER_COLORS_DEFAULT;
