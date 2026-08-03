import { EIKEN_LEVEL_LABELS } from './engine';
import type { LevelTestResultPayload } from './result-code';
import { LEVEL_ACCENT_COLORS, formatVocabSizeFromTheta, vocabSizeTextFor } from './share';
import { cssFontFamily, drawRoundedRect, fitFontSize } from '@/lib/share/canvas';

/**
 * 診断結果の共有カード画像(PNG)。
 *
 * Instagramはテキストだけの投稿を受け取れない(URLもリンクにならない)ため、
 * キャプションのコピーだけでは「Instagramに共有できない」状態になる。
 * 画像さえ作れば navigator.share(files) でストーリーズ/フィードに渡せるので、
 * リールの単語カード(lib/reels/share-image.ts)と同じ方式で結果カードを描く。
 */

// 4:5 — Instagramのフィードで最大表示され、ストーリーズにもそのまま貼れる。
const CARD_WIDTH = 1080;
const CARD_HEIGHT = 1350;
const MARGIN = 72;
const CORNER_RADIUS = 48;

const INK = '#1a1a1a';
const PAPER = '#faf7f1';
const SURFACE = '#ffffff';
const BACKGROUND = '#faf7f1';
const MUTED = '#6b7280';
const GOLD = '#B8860B';

const MONO_FONT = 'ui-monospace, SFMono-Regular, Menlo, monospace';

export const LEVEL_TEST_SHARE_FILE_NAME = 'merken-level-test.png';

export type LevelTestCardText = {
  grade: string;
  accent: string;
  vocab: string;
  correctText: string;
  vocabRangeText: string | null;
  crowned: boolean;
};

/**
 * カードに描く文言の組み立て(純粋関数)。画面の結果カードと同じ表示条件を使う。
 */
export function buildLevelTestCardText(payload: LevelTestResultPayload): LevelTestCardText {
  const lowerVocab = payload.lowerAbility !== undefined
    ? formatVocabSizeFromTheta(payload.lowerAbility)
    : null;
  const upperVocab = payload.upperAbility !== undefined
    ? formatVocabSizeFromTheta(payload.upperAbility)
    : null;

  return {
    grade: EIKEN_LEVEL_LABELS[payload.finalLevel] ?? EIKEN_LEVEL_LABELS[0],
    accent: LEVEL_ACCENT_COLORS[payload.finalLevel] ?? LEVEL_ACCENT_COLORS[0],
    vocab: vocabSizeTextFor(payload),
    correctText: `20問中${payload.correctTotal}問正解`,
    // 上下限が同じ語数に丸まる場合は「約600〜600語」を出さない
    vocabRangeText: lowerVocab && upperVocab && lowerVocab !== upperVocab
      ? `推定範囲 約${lowerVocab}〜${upperVocab}語`
      : null,
    crowned: payload.clearedMax,
  };
}

/**
 * 結果カードをPNG Blobとして描画する。
 * Canvasが使えない環境(SSR・古いブラウザ)ではnullを返す。
 */
export async function generateLevelTestShareImage(
  payload: LevelTestResultPayload,
): Promise<Blob | null> {
  if (typeof document === 'undefined') return null;

  const displayFont = cssFontFamily('--font-display', 'sans-serif');
  const bodyFont = cssFontFamily('--font-body', 'sans-serif');

  try {
    await Promise.all([
      document.fonts.load(`800 96px ${displayFont}`),
      document.fonts.load(`800 52px ${displayFont}`),
      document.fonts.load(`700 48px ${bodyFont}`),
      document.fonts.load(`700 32px ${bodyFont}`),
    ]);
  } catch {
    // Font preloading is best-effort; system fallbacks still render.
  }

  const canvas = document.createElement('canvas');
  canvas.width = CARD_WIDTH;
  canvas.height = CARD_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const text = buildLevelTestCardText(payload);

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
  const contentWidth = cardW - 160;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // ヘッダー
  ctx.font = `700 30px ${MONO_FONT}`;
  ctx.fillStyle = MUTED;
  ctx.fillText('VOCABULARY LEVEL TEST', centerX, MARGIN + 78);

  // 最高レベル完全制覇(該当時のみ)
  if (text.crowned) {
    ctx.font = `700 34px ${bodyFont}`;
    ctx.fillStyle = GOLD;
    ctx.fillText('最高レベル完全制覇', centerX, MARGIN + 148);
  }

  // 級バッジ
  const badgeSize = fitFontSize(ctx, text.grade, displayFont, 800, 96, 56, contentWidth - 120);
  ctx.font = `800 ${badgeSize}px ${displayFont}`;
  const badgeW = Math.min(ctx.measureText(text.grade).width + 120, contentWidth);
  const badgeH = 150;
  const badgeY = MARGIN + 190;
  ctx.fillStyle = INK;
  drawRoundedRect(ctx, centerX - badgeW / 2 + 8, badgeY + 10, badgeW, badgeH, 32);
  ctx.fill();
  ctx.fillStyle = text.accent;
  drawRoundedRect(ctx, centerX - badgeW / 2, badgeY, badgeW, badgeH, 32);
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 6;
  drawRoundedRect(ctx, centerX - badgeW / 2, badgeY, badgeW, badgeH, 32);
  ctx.stroke();
  ctx.fillStyle = SURFACE;
  ctx.font = `800 ${badgeSize}px ${displayFont}`;
  ctx.fillText(text.grade, centerX, badgeY + badgeH / 2 + 4);

  ctx.font = `700 34px ${bodyFont}`;
  ctx.fillStyle = MUTED;
  ctx.fillText('レベル', centerX, badgeY + badgeH + 54);

  // 推定語彙数ピル
  const vocabText = `推定語彙数 ${text.vocab}語`;
  const vocabSize = fitFontSize(ctx, vocabText, bodyFont, 700, 48, 30, contentWidth - 100);
  ctx.font = `700 ${vocabSize}px ${bodyFont}`;
  const pillW = Math.min(ctx.measureText(vocabText).width + 100, contentWidth);
  const pillH = 104;
  const pillY = badgeY + badgeH + 96;
  ctx.fillStyle = BACKGROUND;
  drawRoundedRect(ctx, centerX - pillW / 2, pillY, pillW, pillH, pillH / 2);
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 5;
  drawRoundedRect(ctx, centerX - pillW / 2, pillY, pillW, pillH, pillH / 2);
  ctx.stroke();
  ctx.fillStyle = INK;
  ctx.fillText(vocabText, centerX, pillY + pillH / 2 + 2);

  let cursorY = pillY + pillH + 46;
  if (text.vocabRangeText) {
    ctx.font = `700 30px ${bodyFont}`;
    ctx.fillStyle = MUTED;
    ctx.fillText(text.vocabRangeText, centerX, cursorY);
    cursorY += 46;
  }
  ctx.font = `700 32px ${bodyFont}`;
  ctx.fillStyle = MUTED;
  ctx.fillText(text.correctText, centerX, cursorY);

  // レベル別の正答バー
  const barsTop = 812;
  ctx.textAlign = 'left';
  ctx.font = `700 26px ${MONO_FONT}`;
  ctx.fillStyle = MUTED;
  ctx.fillText('レベル別の正答', MARGIN + 80, barsTop - 44);

  const labelRight = MARGIN + 80 + 130;
  const barLeft = labelRight + 24;
  const barRight = CARD_WIDTH - MARGIN - 80 - 110;
  const barWidth = barRight - barLeft;
  const rowHeight = 48;

  EIKEN_LEVEL_LABELS.forEach((label, levelIndex) => {
    const asked = payload.askedByLevel[levelIndex] ?? 0;
    const correct = payload.correctByLevel[levelIndex] ?? 0;
    const attempted = asked > 0;
    const rowY = barsTop + levelIndex * rowHeight;
    ctx.globalAlpha = attempted ? 1 : 0.35;

    ctx.textAlign = 'right';
    ctx.font = `700 28px ${bodyFont}`;
    ctx.fillStyle = INK;
    ctx.fillText(label.replace('英検', ''), labelRight, rowY);

    const barH = 26;
    ctx.fillStyle = BACKGROUND;
    drawRoundedRect(ctx, barLeft, rowY - barH / 2, barWidth, barH, barH / 2);
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 3;
    drawRoundedRect(ctx, barLeft, rowY - barH / 2, barWidth, barH, barH / 2);
    ctx.stroke();
    if (attempted && correct > 0) {
      const ratio = Math.max(0, Math.min(1, correct / asked));
      const filledWidth = Math.max(barH, barWidth * ratio);
      ctx.fillStyle = LEVEL_ACCENT_COLORS[levelIndex];
      drawRoundedRect(ctx, barLeft, rowY - barH / 2, filledWidth, barH, barH / 2);
      ctx.fill();
    }

    ctx.textAlign = 'left';
    ctx.font = `700 26px ${MONO_FONT}`;
    ctx.fillStyle = MUTED;
    ctx.fillText(attempted ? `${correct}/${asked}` : '—', barRight + 22, rowY);
    ctx.globalAlpha = 1;
  });

  // ブランドフッター
  ctx.textAlign = 'center';
  ctx.font = `800 52px ${displayFont}`;
  ctx.fillStyle = INK;
  ctx.fillText('MERKEN', centerX, CARD_HEIGHT - MARGIN - 94);
  ctx.font = `700 30px ${bodyFont}`;
  ctx.fillStyle = MUTED;
  ctx.fillText('merken.jp/level-test で診断できます', centerX, CARD_HEIGHT - MARGIN - 42);

  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/png');
  });
}
