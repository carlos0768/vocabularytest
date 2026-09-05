#!/usr/bin/env node
/**
 * トップページ (未ログイン時のLP = src/components/home/GuestLanding.tsx) をPDFに書き出す。
 *
 * 使い方:
 *   npm run build && npm run start        # 別ターミナルで本番ビルドを起動 (dev でも可)
 *   npm i --no-save playwright-core       # 実行時のみ必要 (依存には入れていない)
 *   node scripts/generate-lp-pdf.mjs
 *
 * 環境変数:
 *   LP_URL            対象URL             (既定: http://localhost:3000/)
 *   LP_PDF_OUT_DIR    出力先ディレクトリ  (既定: output/pdf)
 *   LP_ONEPAGE_WIDTH  1枚版のレンダリング幅px (既定: 1280 = PC表示)
 *   CHROMIUM_PATH     Chromium実行パス    (未指定ならplaywright同梱を使う)
 *
 * 出力:
 *   merken-lp-a4.pdf       A4縦・複数ページ (印刷/配布用)
 *   merken-lp-onepage.pdf  全体を1枚に収めた縦長PDF (PC表示の見たまま)
 *
 * 注意: Material Symbols (アイコン) と本文フォントは Google Fonts から読み込む。
 * ネットワークが無い環境ではアイコンがリガチャ名の文字列として出てしまうため、
 * フォント未読込を検出したらアイコンを非表示にしてから書き出す。
 */
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright-core';

const url = process.env.LP_URL ?? 'http://localhost:3000/';
const outDir = process.env.LP_PDF_OUT_DIR ?? 'output/pdf';
const onePageWidth = Number(process.env.LP_ONEPAGE_WIDTH ?? 1280);
const executablePath = process.env.CHROMIUM_PATH || undefined;

// A4 = 210mm x 297mm。上下左右10mmの余白を引いた印刷領域を96dpi換算した値。
// この幅でレンダリングしておくと印刷時に再レイアウトが起きず、
// 読み込み済みの画像がそのままPDFに乗る。
const A4_CONTENT_WIDTH_PX = Math.round((190 / 25.4) * 96);
const A4_CONTENT_HEIGHT_PX = Math.round((277 / 25.4) * 96);

/** 遅延読み込みの画像を確実に出すため、最下部まで一度スクロールしてから戻す。 */
async function scrollThrough(page) {
  await page.evaluate(async () => {
    const step = window.innerHeight;
    for (let y = 0; y < document.body.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(600);
  await page.evaluate(() =>
    Promise.all(
      Array.from(document.images)
        .filter((img) => !img.complete)
        .map((img) => new Promise((resolve) => {
          img.addEventListener('load', resolve, { once: true });
          img.addEventListener('error', resolve, { once: true });
        }))
    )
  );
}

/**
 * 端末モックのような1ページに収まらない画像は、ページ境界に跨ったときに
 * 次ページの本文へ重なって描画されてしまう。印刷領域の高さに収まるまで
 * 縮めたうえで分割禁止にする。
 */
async function fitImagesToPage(page, maxHeightPx) {
  await page.evaluate((maxHeight) => {
    for (const img of document.images) {
      if (img.getBoundingClientRect().height > maxHeight) {
        img.style.maxHeight = `${maxHeight - 16}px`;
        img.style.width = 'auto';
        img.style.objectFit = 'contain';
      }
      img.style.breakInside = 'avoid';
    }
  }, maxHeightPx);
}

/** PDFに出したくない開発用UI・読み込めなかったアイコンを落とす。 */
async function cleanUpForPrint(page) {
  // document.fonts.check() は @font-face が1つも無いとフォールバック扱いで true を返すので、
  // 読み込まれた @font-face の一覧そのものを見る。
  const iconFontLoaded = await page.evaluate(() =>
    Array.from(document.fonts).some((font) => font.family.includes('Material Symbols'))
  );
  await page.addStyleTag({
    content: `
      *, *::before, *::after { animation: none !important; transition: none !important; }
      /* Next.js の開発用オーバーレイ (エラーバッジ) */
      nextjs-portal { display: none !important; }
      /* ページを跨ぐと固定要素が全ページに焼き付く */
      [style*="position: fixed"], [style*="position:fixed"], .fixed { position: absolute !important; }
      /* 印刷時は backface-visibility が効かず、フラッシュカードの裏面が鏡文字で重なる */
      [style*="rotateY(180deg)"] { display: none !important; }
      ${iconFontLoaded ? '' : '.material-symbols-outlined { display: none !important; }'}
    `,
  });
  return iconFontLoaded;
}

async function openLandingPage(browser, width, { fitToPageHeight } = {}) {
  const page = await browser.newPage({ viewport: { width, height: 1000 } });
  // print メディアだと画面用の装飾(背景・角丸)が落ちるので screen のまま出す。
  await page.emulateMedia({ media: 'screen' });
  await page.goto(url, { waitUntil: 'networkidle', timeout: 120_000 });
  await scrollThrough(page);
  if (fitToPageHeight) {
    await fitImagesToPage(page, fitToPageHeight);
  }
  const iconFontLoaded = await cleanUpForPrint(page);
  if (!iconFontLoaded) {
    console.warn('warning: Material Symbols を読み込めなかったのでアイコンを非表示にしました');
  }
  return page;
}

const browser = await chromium.launch({ executablePath, args: ['--no-sandbox'] });
try {
  await mkdir(outDir, { recursive: true });

  const a4Page = await openLandingPage(browser, A4_CONTENT_WIDTH_PX, {
    fitToPageHeight: A4_CONTENT_HEIGHT_PX,
  });
  const a4Path = path.join(outDir, 'merken-lp-a4.pdf');
  await a4Page.pdf({
    path: a4Path,
    format: 'A4',
    printBackground: true,
    margin: { top: '10mm', bottom: '10mm', left: '10mm', right: '10mm' },
  });
  console.log(`wrote ${a4Path}`);
  await a4Page.close();

  const onePage = await openLandingPage(browser, onePageWidth);
  const fullHeight = await onePage.evaluate(() => document.documentElement.scrollHeight);
  const onePagePath = path.join(outDir, 'merken-lp-onepage.pdf');
  await onePage.pdf({
    path: onePagePath,
    width: `${onePageWidth}px`,
    height: `${fullHeight}px`,
    printBackground: true,
    pageRanges: '1',
  });
  console.log(`wrote ${onePagePath} (${onePageWidth}x${fullHeight}px)`);
  await onePage.close();
} finally {
  await browser.close();
}
