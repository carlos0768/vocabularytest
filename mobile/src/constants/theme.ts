// Design tokens matching current iOS/Web mobile parity UI.
// This is the source of truth for all UI colors in the RN app.

export const theme = {
  // Solid UI
  solidInk: '#1a1a1a',
  solidBorder: '#1a1a1a',
  solidShadow: '#1a1a1a',
  notebookPaper: '#faf7f1',

  // Accent — green is reserved for bookmarks, links, progress, and positive actions
  accentGreen: '#15803d',
  accentGreenInk: '#14532d',
  accentGreenBg: '#dcfce7',

  // Primary ink
  accentBlack: '#1a1a1a',
  accentBlackLight: '#0d0d0d',

  // Chart / data visualization accent (the original blue)
  chartBlue: '#137fec',
  chartBlueBg: 'rgba(19,127,236,0.10)',

  // Semantic status colors
  success: '#16a34a',
  successBg: '#bbf7d0',
  warning: '#f59e0b',
  warningBg: '#fef3c7',
  danger: '#dc2626',
  dangerBg: '#fecaca',

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

  // Web parity typography: --font-display = Lexend, --font-body = Noto Sans JP
  fontFamily: {
    body: 'NotoSansJP_400Regular',
    bodyMedium: 'NotoSansJP_500Medium',
    bodySemiBold: 'NotoSansJP_600SemiBold',
    bodyBold: 'NotoSansJP_700Bold',
    bodyExtraBold: 'NotoSansJP_800ExtraBold',
    bodyBlack: 'NotoSansJP_900Black',
    display: 'Lexend_700Bold',
    displayExtraBold: 'Lexend_800ExtraBold',
    displayBlack: 'Lexend_900Black',
    mono: 'monospace',
  },

  // Corner radii
  radius: {
    sm: 8,
    solidSm: 10,
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
