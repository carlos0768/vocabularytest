/**
 * 共有カード描画に必要な最小限の単語情報。ReelItem はこれを構造的に
 * 満たすので、リール以外（共有単語帳の単語など）からも使える。
 */
export type WordShareCardInput = {
  english: string;
  pronunciation?: string | null;
  japanese: string;
  book: { title: string };
};

// Canvas card dimensions (4:5 — feed-friendly on Instagram / LINE).
const CARD_WIDTH = 1080;
const CARD_HEIGHT = 1350;
const MARGIN = 72;
const CORNER_RADIUS = 48;

const INK = '#1a1a1a';
const PAPER = '#faf7f1';
const SURFACE = '#ffffff';
const MUTED = '#6b7280';
const ACCENT = '#15803d';

const MONO_FONT = "ui-monospace, SFMono-Regular, Menlo, monospace";

function cssFontFamily(variable: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
  return value || fallback;
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, width, height, radius);
  } else {
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + width, y, x + width, y + height, radius);
    ctx.arcTo(x + width, y + height, x, y + height, radius);
    ctx.arcTo(x, y + height, x, y, radius);
    ctx.arcTo(x, y, x + width, y, radius);
    ctx.closePath();
  }
}

/** Shrink the font size until the text fits maxWidth (floor at minSize). */
function fitFontSize(
  ctx: CanvasRenderingContext2D,
  text: string,
  family: string,
  weight: number,
  baseSize: number,
  minSize: number,
  maxWidth: number,
): number {
  let size = baseSize;
  while (size > minSize) {
    ctx.font = `${weight} ${size}px ${family}`;
    if (ctx.measureText(text).width <= maxWidth) break;
    size -= 4;
  }
  return size;
}

/** Greedy character wrap (works for Japanese, which has no spaces). */
function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  const lines: string[] = [];
  let current = '';
  for (const char of text) {
    if (ctx.measureText(current + char).width > maxWidth && current !== '') {
      lines.push(current);
      current = char;
      if (lines.length === maxLines) break;
    } else {
      current += char;
    }
  }
  if (lines.length < maxLines && current) lines.push(current);
  if (lines.length === maxLines && current && lines[maxLines - 1] !== current) {
    // Overflow — ellipsize the final line.
    let last = lines[maxLines - 1];
    while (last.length > 0 && ctx.measureText(`${last}…`).width > maxWidth) {
      last = last.slice(0, -1);
    }
    lines[maxLines - 1] = `${last}…`;
  }
  return lines;
}

/**
 * Render a "この単語知ってた？" share card for a reel word as a PNG blob.
 * Always renders the light Merken Solid look regardless of app theme.
 * Returns null when canvas rendering is unavailable.
 */
export async function generateWordShareImage(item: WordShareCardInput): Promise<Blob | null> {
  if (typeof document === 'undefined') return null;

  const displayFont = cssFontFamily('--font-display', 'sans-serif');
  const bodyFont = cssFontFamily('--font-body', 'sans-serif');

  try {
    await Promise.all([
      document.fonts.load(`700 120px ${displayFont}`),
      document.fonts.load(`800 52px ${displayFont}`),
      document.fonts.load(`700 64px ${bodyFont}`),
      document.fonts.load(`700 44px ${bodyFont}`),
    ]);
  } catch {
    // Font preloading is best-effort; system fallbacks still render.
  }

  const canvas = document.createElement('canvas');
  canvas.width = CARD_WIDTH;
  canvas.height = CARD_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // Paper background
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  // Merken Solid card: hard offset shadow + thick ink border
  const cardW = CARD_WIDTH - MARGIN * 2;
  const cardH = CARD_HEIGHT - MARGIN * 2;
  ctx.fillStyle = INK;
  drawRoundedRect(ctx, MARGIN + 14, MARGIN + 18, cardW, cardH, CORNER_RADIUS);
  ctx.fill();
  ctx.fillStyle = SURFACE;
  drawRoundedRect(ctx, MARGIN, MARGIN, cardW, cardH, CORNER_RADIUS);
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 6;
  drawRoundedRect(ctx, MARGIN, MARGIN, cardW, cardH, CORNER_RADIUS);
  ctx.stroke();

  const centerX = CARD_WIDTH / 2;
  const contentWidth = cardW - 140;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Badge: この単語知ってた？
  const badgeText = 'この単語知ってた？';
  ctx.font = `700 44px ${bodyFont}`;
  const badgeTextWidth = ctx.measureText(badgeText).width;
  const badgeW = badgeTextWidth + 96;
  const badgeH = 92;
  const badgeY = MARGIN + 96;
  ctx.fillStyle = INK;
  drawRoundedRect(ctx, centerX - badgeW / 2, badgeY, badgeW, badgeH, badgeH / 2);
  ctx.fill();
  ctx.fillStyle = SURFACE;
  ctx.fillText(badgeText, centerX, badgeY + badgeH / 2 + 2);

  // English word
  const englishSize = fitFontSize(ctx, item.english, displayFont, 700, 132, 56, contentWidth);
  ctx.font = `700 ${englishSize}px ${displayFont}`;
  ctx.fillStyle = INK;
  const englishY = 560;
  ctx.fillText(item.english, centerX, englishY);

  // IPA
  if (item.pronunciation) {
    const ipaSize = fitFontSize(ctx, item.pronunciation, MONO_FONT, 400, 46, 28, contentWidth);
    ctx.font = `400 ${ipaSize}px ${MONO_FONT}`;
    ctx.fillStyle = MUTED;
    ctx.fillText(item.pronunciation, centerX, englishY + englishSize / 2 + 64);
  }

  // Divider
  ctx.strokeStyle = INK;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(centerX - 60, 760);
  ctx.lineTo(centerX + 60, 760);
  ctx.stroke();

  // Japanese meaning (up to 2 wrapped lines)
  ctx.font = `700 64px ${bodyFont}`;
  ctx.fillStyle = INK;
  const japaneseLines = wrapText(ctx, item.japanese, contentWidth, 2);
  japaneseLines.forEach((line, index) => {
    ctx.fillText(line, centerX, 872 + index * 88);
  });

  // Book attribution
  ctx.font = `400 40px ${bodyFont}`;
  ctx.fillStyle = MUTED;
  const bookLine = wrapText(ctx, `『${item.book.title}』より`, contentWidth, 1)[0] ?? '';
  ctx.fillText(bookLine, centerX, CARD_HEIGHT - MARGIN - 180);

  // Brand footer
  ctx.font = `800 52px ${displayFont}`;
  ctx.fillStyle = INK;
  ctx.fillText('MERKEN', centerX, CARD_HEIGHT - MARGIN - 96);
  ctx.font = `600 32px ${bodyFont}`;
  ctx.fillStyle = ACCENT;
  ctx.fillText('merken.jp', centerX, CARD_HEIGHT - MARGIN - 44);

  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/png');
  });
}
