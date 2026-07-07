// MERKEN PR ad generator — renders a Merken Solid story ad (1080x1920) to PNG.
// Fonts (Lexend / Noto Sans JP) are fetched from Google Fonts, subset, and
// embedded as base64 so the exported HTML is fully self-contained.
//
// Usage: node design/pr-ads/generate.mjs
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium } = pw;
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';

// ---- Ad copy (single source of truth) --------------------------------------
const COPY = {
  wordmark: 'MERKEN',
  tagline: '手入力ゼロで単語帳作成',
  eyebrow: 'AI英単語学習アプリ',
  headA: '写真を撮るだけで、',
  headHi: '単語帳',
  headB: 'が完成。',
  sub: '教科書もノートも、撮ればそのまま単語帳に。',
  steps: [
    { n: '1', t: '撮る', d: '教科書・ノートを撮影' },
    { n: '2', t: 'AIが抽出', d: '英単語と訳を自動生成' },
    { n: '3', t: '覚える', d: '例文つき4択クイズ' },
  ],
  chipPhoto: '撮るだけ',
  chipAI: 'AIが自動生成',
  cta: '無料で始める',
  url: 'www.merken.jp',
};

// ---- Font embedding ---------------------------------------------------------
function collectGlyphs() {
  const s = new Set();
  const add = (t) => [...t].forEach((c) => s.add(c));
  add(COPY.tagline);
  add(COPY.eyebrow);
  add(COPY.headA + COPY.headHi + COPY.headB);
  add(COPY.sub);
  COPY.steps.forEach((st) => add(st.n + st.t + st.d));
  add(COPY.chipPhoto + COPY.chipAI + COPY.cta);
  add('英単語学習写真教科書ノート撮影自動生成例文つき択問題復習覚定着手入力');
  return [...s].join('');
}

async function fetchCss(url) {
  const r = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Error(`css fetch failed ${r.status} ${url}`);
  return r.text();
}

// Parse @font-face blocks, download each woff2, re-emit with base64 src.
async function embedFontFaces(css, familyOverride) {
  const blocks = css.match(/@font-face\s*{[^}]*}/g) || [];
  const out = [];
  for (const block of blocks) {
    const urlMatch = block.match(/url\((https:\/\/[^)]+\.woff2)\)/);
    if (!urlMatch) continue;
    const weight = (block.match(/font-weight:\s*([^;]+);/) || [, '400'])[1].trim();
    const range = (block.match(/unicode-range:\s*([^;]+);/) || [, null])[1];
    const fr = await fetch(urlMatch[1], { headers: { 'User-Agent': UA } });
    if (!fr.ok) continue;
    const b64 = Buffer.from(await fr.arrayBuffer()).toString('base64');
    const fam = familyOverride || (block.match(/font-family:\s*'([^']+)'/) || [, 'X'])[1];
    out.push(
      `@font-face{font-family:'${fam}';font-style:normal;font-weight:${weight};` +
        `font-display:block;src:url(data:font/woff2;base64,${b64}) format('woff2');` +
        (range ? `unicode-range:${range};` : '') +
        `}`,
    );
  }
  return out.join('\n');
}

async function buildFontCss() {
  const glyphs = encodeURIComponent(collectGlyphs());
  const lexendCss = await fetchCss(
    'https://fonts.googleapis.com/css2?family=Lexend:wght@600;700;800&display=block',
  );
  const notoCss = await fetchCss(
    `https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@500;700;900&display=block&text=${glyphs}`,
  );
  const lexend = await embedFontFaces(lexendCss, 'Lexend');
  const noto = await embedFontFaces(notoCss, 'Noto Sans JP');
  return lexend + '\n' + noto;
}

// ---- Assets (base64 so the exported HTML stands alone) ----------------------
// Sourced straight from the app's public assets so the ad always tracks the
// real brand icon and app UI — no duplicated copies to keep in sync.
const REPO = join(__dirname, '..', '..');
function dataUri(relPath, mime) {
  const b64 = readFileSync(join(REPO, relPath)).toString('base64');
  return `data:${mime};base64,${b64}`;
}

// ---- HTML -------------------------------------------------------------------
function buildHtml(fontCss) {
  const icon = dataUri('public/icon-512.png', 'image/png');
  const home = dataUri('public/lp/home.png', 'image/png');

  const cameraSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>`;
  const sparkSvg = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l1.9 5.6L19.5 9.5 13.9 11.4 12 17l-1.9-5.6L4.5 9.5l5.6-1.9z"/><path d="M19 14l.9 2.6L22.5 17.5 19.9 18.4 19 21l-.9-2.6L15.5 17.5l2.6-.9z"/></svg>`;
  const boltSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2L4 14h7l-1 8 9-12h-7z"/></svg>`;
  const checkSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>`;
  const arrowSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M13 5l7 7-7 7"/></svg>`;
  const stepIcons = [cameraSvg, boltSvg, checkSvg];

  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><style>
${fontCss}
:root{
  --ink:#1a1a1a; --paper:#fffdf7; --fg:#111418;
  --accent:#15803d; --accent-ink:#14532d; --accent-light:#dcfce7;
  --muted:#6b7280; --rule:#e8e0d0;
  --bw:3px; --off:8px;
}
*{margin:0;padding:0;box-sizing:border-box;-webkit-font-smoothing:antialiased;text-rendering:geometricPrecision;}
html,body{width:1080px;height:1920px;}
body{
  font-family:'Noto Sans JP','Lexend',sans-serif;
  background:var(--paper); color:var(--fg); position:relative; overflow:hidden;
}
/* dot grid */
.bg-dots{position:absolute;inset:0;
  background-image:radial-gradient(rgba(17,20,24,.06) 2px, transparent 2px);
  background-size:34px 34px; background-position:0 0;}
/* soft green wash top-right */
.bg-wash{position:absolute;top:-260px;right:-260px;width:760px;height:760px;border-radius:50%;
  background:radial-gradient(circle, rgba(21,128,61,.14), transparent 68%);}
.stage{position:relative;z-index:2;width:100%;height:100%;padding:80px 84px 72px;display:flex;flex-direction:column;}

/* header */
.brand{display:flex;align-items:center;gap:22px;}
.brand img{width:96px;height:96px;border-radius:24px;border:var(--bw) solid var(--ink);
  box-shadow:6px 7px 0 var(--ink);}
.brand .wm{font-family:'Lexend',sans-serif;font-weight:800;font-size:52px;letter-spacing:-.02em;line-height:1;color:var(--fg);}
.brand .tg{font-weight:700;font-size:24px;color:var(--muted);margin-top:8px;}

/* eyebrow */
.eyebrow{margin-top:52px;display:inline-flex;align-items:center;gap:14px;align-self:flex-start;
  background:var(--accent);color:#fff;border:var(--bw) solid var(--accent-ink);
  border-radius:999px;padding:16px 30px;font-weight:900;font-size:26px;letter-spacing:.01em;
  box-shadow:4px 5px 0 var(--accent-ink);}
.eyebrow .dot{width:16px;height:16px;border-radius:50%;background:#fff;}

/* headline */
.head{margin-top:30px;font-family:'Noto Sans JP',sans-serif;font-weight:900;
  font-size:90px;line-height:1.14;letter-spacing:-.035em;color:var(--ink);}
.head .hi{position:relative;color:var(--accent);white-space:nowrap;}
.head .hi::after{content:'';position:absolute;left:-4px;right:-4px;bottom:8px;height:20px;
  background:var(--accent-light);z-index:-1;border-radius:4px;transform:rotate(-.6deg);}
.sub{margin-top:22px;font-weight:700;font-size:31px;line-height:1.5;color:#4d5560;}

/* hero */
.hero{position:relative;flex:1;min-height:0;margin-top:14px;display:flex;align-items:center;justify-content:center;}
.phone{position:relative;z-index:1;width:452px;border-radius:52px;border:var(--bw) solid var(--ink);
  background:var(--ink);box-shadow:14px 16px 0 var(--ink);padding:14px;transform:rotate(-3deg);}
/* Crop the tall app screenshot to its top portion so the phone stays compact. */
.phone .scr{height:560px;border-radius:40px;overflow:hidden;border:2px solid var(--ink);display:block;}
.phone .scr img{display:block;width:100%;object-fit:cover;object-position:top center;}
.notch{position:absolute;top:26px;left:50%;transform:translateX(-50%);width:130px;height:30px;
  background:var(--ink);border-radius:0 0 18px 18px;z-index:3;}

/* floating chips */
.fchip{position:absolute;z-index:6;display:flex;align-items:center;gap:16px;background:#fff;
  border:var(--bw) solid var(--ink);border-radius:22px;box-shadow:6px 7px 0 var(--ink);
  padding:18px 28px;font-weight:900;font-size:31px;white-space:nowrap;}
.fchip .ic{width:58px;height:58px;border-radius:16px;display:flex;align-items:center;justify-content:center;
  border:2.5px solid var(--ink);flex-shrink:0;}
.fchip .ic svg{width:34px;height:34px;}
.fchip.photo{top:10px;left:6px;transform:rotate(-4deg);}
.fchip.photo .ic{background:var(--accent);color:#fff;}
.fchip.ai{bottom:26px;right:2px;transform:rotate(3deg);}
.fchip.ai .ic{background:#111418;color:#fff;}

/* steps */
.steps{display:flex;gap:18px;margin-top:22px;}
.step{flex:1;background:#fff;border:var(--bw) solid var(--ink);border-radius:22px;
  box-shadow:5px 6px 0 var(--ink);padding:22px 20px 22px;position:relative;}
.step .num{position:absolute;top:-22px;left:22px;width:50px;height:50px;border-radius:50%;
  background:var(--ink);color:#fff;font-family:'Lexend',sans-serif;font-weight:800;font-size:26px;
  display:flex;align-items:center;justify-content:center;border:var(--bw) solid var(--ink);}
.step .sic{width:48px;height:48px;color:var(--accent);margin:8px 0 12px;}
.step .sic svg{width:48px;height:48px;}
.step .st{font-weight:900;font-size:33px;letter-spacing:-.01em;}
.step .sd{font-weight:600;font-size:21px;color:var(--muted);margin-top:6px;line-height:1.3;white-space:nowrap;}

/* cta */
.cta{margin-top:34px;display:flex;align-items:center;gap:28px;}
.btn{flex:1;display:flex;align-items:center;justify-content:center;gap:18px;
  background:var(--fg);color:#fff;border:var(--bw) solid var(--ink);border-radius:26px;
  box-shadow:7px 8px 0 var(--ink);padding:34px 40px;font-weight:900;font-size:44px;letter-spacing:.01em;}
.btn svg{width:44px;height:44px;}
.url{font-family:'Lexend',sans-serif;font-weight:800;font-size:34px;color:var(--fg);white-space:nowrap;}
</style></head>
<body>
  <div class="bg-dots"></div>
  <div class="bg-wash"></div>
  <div class="stage">
    <div class="brand">
      <img src="${icon}" alt="MERKEN">
      <div><div class="wm">${COPY.wordmark}</div><div class="tg">${COPY.tagline}</div></div>
    </div>

    <div class="eyebrow"><span class="dot"></span>${COPY.eyebrow}</div>

    <h1 class="head">${COPY.headA}<br><span class="hi">${COPY.headHi}</span>${COPY.headB}</h1>
    <p class="sub">${COPY.sub}</p>

    <div class="hero">
      <div class="fchip photo"><span class="ic">${cameraSvg}</span>${COPY.chipPhoto}</div>
      <div class="phone">
        <div class="notch"></div>
        <div class="scr"><img src="${home}" alt="MERKEN app"></div>
      </div>
      <div class="fchip ai"><span class="ic">${sparkSvg}</span>${COPY.chipAI}</div>
    </div>

    <div class="steps">
      ${COPY.steps
        .map(
          (s, i) => `<div class="step"><div class="num">${s.n}</div>
        <div class="sic">${stepIcons[i]}</div>
        <div class="st">${s.t}</div><div class="sd">${s.d}</div></div>`,
        )
        .join('')}
    </div>

    <div class="cta">
      <div class="btn">${COPY.cta}${arrowSvg}</div>
      <div class="url">${COPY.url}</div>
    </div>
  </div>
</body></html>`;
}

// ---- Render -----------------------------------------------------------------
async function main() {
  console.log('fetching + embedding fonts…');
  const fontCss = await buildFontCss();
  const html = buildHtml(fontCss);
  const htmlPath = join(__dirname, 'story-1080x1920.html');
  writeFileSync(htmlPath, html);
  console.log(`wrote ${htmlPath} (${(html.length / 1024).toFixed(0)} KB)`);

  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--no-sandbox', '--force-color-profile=srgb'],
  });
  const page = await browser.newPage({
    viewport: { width: 1080, height: 1920 },
    deviceScaleFactor: 2,
  });
  await page.goto('file://' + htmlPath, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  const outPath = join(__dirname, 'merken-pr-story-1080x1920.png');
  await page.screenshot({ path: outPath, clip: { x: 0, y: 0, width: 1080, height: 1920 } });
  await browser.close();
  console.log(`wrote ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
