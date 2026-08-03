/**
 * 共有カード画像(Canvas)の共通ヘルパー。
 * リールの単語カード(`lib/reels/share-image.ts`)と
 * 語彙レベル診断の結果カード(`lib/level-test/share-image.ts`)で共用する。
 */

/** CSS変数で定義したフォントファミリーを取得する(SSR時はfallback)。 */
export function cssFontFamily(variable: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
  return value || fallback;
}

export function drawRoundedRect(
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
export function fitFontSize(
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
export function wrapText(
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
 * 生成した共有画像をダウンロードさせる(Web Share APIが使えない環境の逃げ道)。
 * 保存さえできればユーザーが手動でInstagramに投稿できる。
 */
export function downloadBlob(blob: Blob, fileName: string): boolean {
  if (typeof document === 'undefined') return false;
  try {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    // revokeはクリック直後だとSafariでダウンロードが落ちることがあるので少し待つ
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return true;
  } catch {
    return false;
  }
}
