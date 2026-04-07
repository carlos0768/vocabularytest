// Design tokens matching iOS MerkenTheme (Theme.swift + GlassSurface.swift)
// This is the source of truth for all UI colors in the RN app.

export const theme = {
  // Accent — iOS uses black, NOT blue, as primary accent
  accentBlack: '#1a1a1a',
  accentBlackLight: '#0d0d0d',

  // Chart / data visualization accent (the original blue)
  chartBlue: '#137fec',
  chartBlueBg: 'rgba(19,127,236,0.10)',

  // Semantic status colors
  success: '#21c559',
  successBg: 'rgba(33,197,89,0.10)',
  warning: '#f59e0b',
  warningBg: 'rgba(245,158,11,0.10)',
  danger: '#f05a5a',
  dangerBg: 'rgba(240,90,90,0.10)',

  // Surfaces
  surface: '#ffffff',
  surfaceAlt: '#f7f7f7',
  background: '#ffffff',

  // Borders
  border: '#e5e7eb',
  borderLight: '#f3f4f6',

  // Text
  primaryText: '#1a1a1a',
  secondaryText: '#6b7280',
  mutedText: '#9ca3af',

  // Fixed
  white: '#ffffff',
  black: '#000000',

  // Thumbnail placeholder palette (hash-based selection)
  thumbnailPalette: [
    '#137FEC',  // blue
    '#664DB3',  // purple
    '#228B22',  // green
    '#2E66BF',  // medium blue
    '#D97340',  // orange
    '#3373B3',  // slate blue
    '#CC4D59',  // red
    '#3DA1B8',  // teal
  ] as const,

  // Typography sizes matching iOS
  fontSize: {
    caption: 11,
    footnote: 12,
    subheadline: 13,
    callout: 14,
    body: 15,
    headline: 16,
    title3: 18,
    title2: 22,
    title1: 28,
    largeTitle: 31.2,
  },

  // Corner radii
  radius: {
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    xxl: 28,
    full: 9999,
  },

  // Spacing
  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    xxl: 24,
  },
} as const;

/** Get a deterministic thumbnail color from the palette based on a string hash */
export function getThumbnailColor(id: string | undefined | null): string {
  if (!id) return theme.thumbnailPalette[0];
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash << 5) - hash + id.charCodeAt(i);
    hash |= 0;
  }
  return theme.thumbnailPalette[Math.abs(hash) % theme.thumbnailPalette.length];
}

export default theme;
