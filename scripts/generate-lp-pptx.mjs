#!/usr/bin/env node
/**
 * トップページ (未ログイン時のLP = src/components/home/GuestLanding.tsx) の内容を
 * PowerPoint (.pptx) に書き出す。LPの実物のモック画像・カードをブラウザから切り出し、
 * LPと同じ配色 (クリーム地 + 黒枠 + グリーン) のスライドに組み直している。
 *
 * 使い方:
 *   npm run build && npm run start                    # 別ターミナルで起動しておく
 *   npm i --no-save playwright-core pptxgenjs         # 実行時のみ必要 (依存には入れていない)
 *   node scripts/generate-lp-pptx.mjs                 # A4横 (既定)
 *   LP_PPTX_LAYOUT=wide node scripts/generate-lp-pptx.mjs   # 16:9
 *
 * 環境変数:
 *   LP_URL           対象URL              (既定: http://localhost:3000/)
 *   LP_PPTX_LAYOUT   a4 | a4-portrait | wide (既定: a4 = A4横)
 *   LP_PPTX_OUT      出力ファイル         (既定: output/pptx/merken-lp-<layout>.pptx)
 *   LP_SHOT_DIR      切り出し画像の置き場 (既定: output/pptx/shots)
 *   CHROMIUM_PATH    Chromium実行パス     (未指定ならplaywright同梱を使う)
 *
 * 座標はすべてスライド寸法から計算しているので、レイアウトを変えても各要素は
 * 同じ比率で収まる。
 *
 * 注意: アイコンは Google Fonts の Material Symbols なので、ネットワークが無い環境では
 * リガチャ名の文字列として写り込む。切り出し前に非表示にしている。
 */
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright-core';
import PptxGenJS from 'pptxgenjs';

const url = process.env.LP_URL ?? 'http://localhost:3000/';
const shotDir = process.env.LP_SHOT_DIR ?? 'output/pptx/shots';
const executablePath = process.env.CHROMIUM_PATH || undefined;

const LAYOUTS = {
  // A4 = 210mm x 297mm。インチ換算した実寸なのでA4用紙にそのまま印刷できる。
  a4: { name: 'A4', width: 11.69, height: 8.27, suffix: 'a4' },
  'a4-portrait': { name: 'A4_PORTRAIT', width: 8.27, height: 11.69, suffix: 'a4-portrait' },
  wide: { name: 'WIDE', width: 13.333, height: 7.5, suffix: '16x9' },
};

const layoutKey = process.env.LP_PPTX_LAYOUT ?? 'a4';
const layout = LAYOUTS[layoutKey];
if (!layout) {
  throw new Error(`LP_PPTX_LAYOUT は ${Object.keys(LAYOUTS).join(' / ')} のいずれかです: ${layoutKey}`);
}
const outFile = process.env.LP_PPTX_OUT ?? `output/pptx/merken-lp-${layout.suffix}.pptx`;

// LPの配色 (src/app/globals.css / GuestLanding.tsx と同じ値)
const INK = '1A1A1A';
const CREAM = 'F3F0E9';
const CARD = 'FAF7F1';
const BODY_INK = '4A4740';
const ACCENT = '15803D';
const ACCENT_ON_DARK = '4ADE80';
const MUTED = '8A857A';
const WHITE = 'FFFFFF';
const ON_DARK_BODY = 'D8D4CA';

const BODY_FONT = 'Arial';
const MONO_FONT = 'Courier New';

// スライド寸法から引く共通の寸法
const W = layout.width;
const H = layout.height;
const M = W * 0.05; // 外余白
const CONTENT_W = W - M * 2;
const GAP = W * 0.023;

/** 見出しブロックの下端 (本文の有無で変わる)。 */
const HEADING_TOP = H * 0.055;
const HEADING_BOTTOM = HEADING_TOP + H * 0.155;

/** n個を横に並べたときの1枚の幅。 */
const colWidth = (n, width = CONTENT_W, gap = GAP) => (width - gap * (n - 1)) / n;
const colX = (i, n, { x = M, width = CONTENT_W, gap = GAP } = {}) => x + i * (colWidth(n, width, gap) + gap);

// ---------------------------------------------------------------- LPの文言

const HERO = {
  eyebrow: 'AI VOCABULARY NOTEBOOK',
  title: ['手入力ゼロで、', '単語帳。'],
  body: '教科書・ノート・プリントを撮影するだけ。AIが英単語、和訳、例文、発音記号、クイズ素材を作り、あなた専用の単語帳として保存できます（AIスキャンはProプラン）。無料でも共有ライブラリから単語帳を取り込んで、すぐに学習を始められます。',
  shortBody: '教科書・ノート・プリントを撮影するだけ。AIが英単語、和訳、例文、発音記号、クイズ素材を作り、あなた専用の単語帳として保存できます。',
  stats: [
    ['4', '抽出モード（Pro）'],
    ['無料', '共有単語帳の取込'],
    ['1日50枚', 'リール（無料プラン）'],
    ['100語', '無料保存枠'],
  ],
};

const WORKFLOW = [
  ['01', 'CAPTURE', '撮る', 'ノート、教科書、プリントをカメラで撮影するか、写真から選びます。'],
  ['02', 'EXTRACT', '抽出する', 'AIが英単語、和訳、品詞、例文、発音記号の候補を作ります。'],
  ['03', 'SAVE', '確認して保存', '抽出結果を確認し、必要なら編集して自分の単語帳へ追加します。'],
  ['04', 'REVIEW', '覚える', '4択、語順クイズ、フラッシュカードで復習し、習得度を記録します。'],
];

const SCAN_MODES = [
  ['単語帳取込', '単語帳の単語を抽出', '単語帳やノートに「英単語＋日本語訳」のペアで載っている単語だけを取り込みます。'],
  ['丸囲み', '覚えたい単語だけ', 'ペンで丸を付けた単語を優先して抽出。授業中に印を付けた紙面をそのまま使えます。'],
  ['英検', '級に合わせて選別', '5級から1級まで、選んだ英検レベルに合わせて単語を抽出します。'],
  ['熟語・イディオム', '複数語の表現も保存', 'take care のような複数語の表現も、単語帳とクイズの対象にできます。'],
];

const STUDY_FEATURES = [
  ['4択クイズ', 'AIが用意した選択肢でテンポよく復習。正答結果は単語の習得度に反映されます。'],
  ['語順クイズ', '2語以上の表現は、下の単語を選んで並べる形式のクイズとして出題できます。'],
  ['フラッシュカード', '単語をめくりながら確認。習得度順、品詞順、保存済みの単語で学習できます。'],
  ['保存済み単語', '気になる単語だけを保存して、カードや10問クイズですぐに復習できます。'],
];

const REEL_POINTS = [
  ['縦スワイプで、次の単語へ', '公開されている単語帳と公式単語帳から、単語が1枚ずつ流れてきます。すき間時間にスクロールするだけで新しい語彙に出会えます。'],
  ['めくって意味を確認', '表は英単語と発音記号だけ。左右のスワイプかタップで和訳の面に切り替わります。'],
  ['語源つきカードは1画面で', '接頭辞・語根・接尾辞の組み立てと解説をまとめて表示。丸暗記にしないための手がかりが付きます。'],
  ['出典の単語帳をワンタップで取り込み', 'カードの下には、その単語が入っている単語帳と作成者が出ます。気に入ればまるごと追加できます。'],
];

const WORD_DATA_ITEMS = ['和訳・品詞', '例文（英日）', '発音記号', 'クイズ用の選択肢', '習得度・復習履歴'];

const PROGRESS_ITEMS = [
  ['習得度', '習得、学習中、未学習を単語ごとに管理'],
  ['連続日数', '毎日の学習をホームで確認'],
  ['マイ単語帳', '直近の単語帳をホームから開ける'],
  ['保存済み', 'あとで見返したい単語だけを集めて復習'],
];

const PLANS = [
  {
    plan: 'FREE',
    name: 'まず試す',
    price: '0',
    description: '共有ライブラリの単語帳で、基本の復習を試すためのプランです。',
    features: ['共有単語帳のインポート', '100単語まで保存', 'ローカル保存', '基本の単語帳・クイズ・カード'],
    pro: false,
  },
  {
    plan: 'PRO',
    name: 'もっと続ける',
    price: '300',
    description: '撮るだけ単語帳、複数端末、クラウド同期が必要な人向けのプランです。',
    features: ['AIスキャン無制限', 'クラウド同期', 'マルチデバイス対応', 'データ永続化'],
    pro: true,
  },
];

// ------------------------------------------------------------ LPの切り出し

/**
 * LPを開き、スライドに使うブロックを画像として切り出す。
 * 端末モック2点は元画像 (public/lp/) をそのまま使うので撮らない。
 */
async function captureShots() {
  await mkdir(shotDir, { recursive: true });
  const browser = await chromium.launch({ executablePath, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });
    await page.goto(url, { waitUntil: 'networkidle', timeout: 120_000 });
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 700) {
        window.scrollTo(0, y);
        await new Promise((resolve) => setTimeout(resolve, 120));
      }
      window.scrollTo(0, 0);
    });
    await page.waitForTimeout(1000);
    await page.addStyleTag({
      content: `
        *, *::before, *::after { animation: none !important; transition: none !important; }
        .material-symbols-outlined { display: none !important; }
        [style*="rotateY(180deg)"] { display: none !important; }
      `,
    });

    /** テキストを含む最も内側の要素から、指定した高さに収まる祖先を撮る。 */
    async function shotByText(name, text, { minH, maxH }) {
      const handle = await page.evaluateHandle(({ text, minH, maxH }) => {
        // XPathだとNext.jsが埋め込むRSCペイロード(script)に当たるのでDOM側で探す
        const leaves = Array.from(document.body.querySelectorAll('*')).filter((el) => {
          if (['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(el.tagName)) return false;
          if (!el.textContent.includes(text)) return false;
          return !Array.from(el.children).some((child) => child.textContent.includes(text));
        });
        for (const leaf of leaves) {
          for (let el = leaf; el && el !== document.body; el = el.parentElement) {
            const h = el.getBoundingClientRect().height;
            if (h >= minH && h <= maxH) return el;
          }
        }
        return null;
      }, { text, minH, maxH });
      const element = handle.asElement();
      if (!element) throw new Error(`切り出し対象が見つかりませんでした: ${name}`);
      await element.screenshot({ path: path.join(shotDir, `${name}.png`) });
    }

    await shotByText('word-detail', 'AI generated pronunciation', { minH: 120, maxH: 800 });
    await shotByText('quiz-demo', '次の英単語の意味は？', { minH: 350, maxH: 700 });
    await shotByText('flashcard-demo', 'タップして意味を確認', { minH: 300, maxH: 600 });
    await page.locator('#reels div.rounded-\\[36px\\]').first()
      .screenshot({ path: path.join(shotDir, 'reel-phone.png') });
  } finally {
    await browser.close();
  }
}

// -------------------------------------------------------------- スライド組み

/** LPのカード (黒枠 + ずらした黒影) を再現する。影は毎回作り直す必要がある。 */
function addCard(slide, { x, y, w, h, fill = CARD }) {
  slide.addShape('roundRect', {
    x, y, w, h,
    rectRadius: 0.1,
    fill: { color: fill },
    line: { color: INK, width: 1.5 },
    shadow: { type: 'outer', color: INK, blur: 0, offset: 0.05, angle: 45, opacity: 1 },
  });
}

/** セクション見出し (通し番号 + ラベル + タイトル)。戻り値は本文を置ける y。 */
function addSectionHeading(slide, { number, label, title, body, bodyW = CONTENT_W }) {
  slide.addText(
    [
      { text: `${number} `, options: { color: ACCENT, bold: true } },
      { text: label.toUpperCase(), options: { color: MUTED, bold: true } },
    ],
    { x: M, y: HEADING_TOP, w: CONTENT_W, h: 0.26, fontFace: MONO_FONT, fontSize: 11, charSpacing: 1.5, margin: 0, isTextBox: true },
  );
  slide.addText(title, {
    x: M, y: HEADING_TOP + 0.28, w: CONTENT_W, h: 0.62,
    fontFace: BODY_FONT, fontSize: 27, bold: true, color: INK, margin: 0, isTextBox: true,
  });
  if (!body) return HEADING_BOTTOM;

  // 本文の行数を幅から見積もる。全角1文字 ≒ フォントサイズ分の幅なので、
  // 折り返し行数ぶんの高さを確保しないと下のカードに潜り込む。
  const fontSize = 12;
  const charW = fontSize / 72;
  const lines = Math.max(1, Math.ceil(body.length / Math.floor(bodyW / charW)));
  const bodyH = lines * (fontSize * 1.35) / 72;
  slide.addText(body, {
    x: M, y: HEADING_BOTTOM, w: bodyW, h: bodyH,
    fontFace: BODY_FONT, fontSize, color: BODY_INK, lineSpacingMultiple: 1.3, valign: 'top', margin: 0, isTextBox: true,
  });
  return HEADING_BOTTOM + bodyH + 0.22;
}

function newSlide(pres, { dark = false } = {}) {
  const slide = pres.addSlide();
  slide.background = { color: dark ? INK : CREAM };
  return slide;
}

async function buildDeck() {
  const pres = new PptxGenJS();
  pres.defineLayout({ name: layout.name, width: W, height: H });
  pres.layout = layout.name;
  pres.author = 'MERKEN';
  pres.title = 'MERKEN サービス紹介';

  const shot = (name) => path.join(shotDir, `${name}.png`);

  // 1. 表紙 --------------------------------------------------------------
  {
    const slide = newSlide(pres, { dark: true });
    const textW = CONTENT_W * 0.58;
    slide.addText('M E R K E N', {
      x: M, y: H * 0.07, w: textW, h: 0.36,
      fontFace: BODY_FONT, fontSize: 15, bold: true, color: WHITE, charSpacing: 3, margin: 0, isTextBox: true,
    });
    slide.addText(HERO.eyebrow, {
      x: M, y: H * 0.28, w: textW, h: 0.28,
      fontFace: MONO_FONT, fontSize: 11, bold: true, color: ACCENT_ON_DARK, charSpacing: 2, margin: 0, isTextBox: true,
    });
    slide.addText(
      [
        { text: HERO.title[0], options: { color: WHITE, breakLine: true } },
        { text: HERO.title[1], options: { color: ACCENT_ON_DARK } },
      ],
      {
        x: M, y: H * 0.34, w: textW, h: H * 0.24,
        fontFace: BODY_FONT, fontSize: 38, bold: true, lineSpacingMultiple: 1.1, margin: 0, isTextBox: true,
      },
    );
    slide.addText(HERO.shortBody, {
      x: M, y: H * 0.61, w: textW, h: H * 0.14,
      fontFace: BODY_FONT, fontSize: 12, color: ON_DARK_BODY, lineSpacingMultiple: 1.3, margin: 0, isTextBox: true,
    });
    slide.addText('www.merken.jp', {
      x: M, y: H - M - 0.3, w: 3, h: 0.3,
      fontFace: MONO_FONT, fontSize: 11, color: ACCENT_ON_DARK, margin: 0, isTextBox: true,
    });

    const imgW = CONTENT_W * 0.38;
    slide.addImage({
      path: shot('flashcard-demo'),
      x: W - M - imgW, y: H * 0.3, w: imgW, h: H * 0.42,
      sizing: { type: 'contain', w: imgW, h: H * 0.42 },
    });
    slide.addNotes('MERKENのトップページ（未ログイン時のランディングページ）の内容をスライドにしたものです。');
  }

  // 2. 概要と数字 --------------------------------------------------------
  {
    const slide = newSlide(pres);
    const top = addSectionHeading(slide, {
      number: '00', label: 'Overview', title: '写真から、単語帳ができる。', body: HERO.body,
    });

    const cardW = colWidth(4);
    const statH = (H - M - top - GAP) * 0.55;
    HERO.stats.forEach(([num, label], i) => {
      const x = colX(i, 4);
      addCard(slide, { x, y: top, w: cardW, h: statH });
      slide.addText(num, {
        x: x + 0.25, y: top + statH * 0.2, w: cardW - 0.5, h: statH * 0.4,
        fontFace: BODY_FONT, fontSize: 30, bold: true, color: i === 0 ? ACCENT : INK, margin: 0, isTextBox: true,
      });
      slide.addText(label, {
        x: x + 0.25, y: top + statH * 0.66, w: cardW - 0.5, h: statH * 0.28,
        fontFace: BODY_FONT, fontSize: 10.5, color: MUTED, margin: 0, isTextBox: true,
      });
    });

    const bannerY = top + statH + GAP;
    const bannerH = H - M - bannerY;
    addCard(slide, { x: M, y: bannerY, w: CONTENT_W, h: bannerH, fill: INK });
    slide.addText('スキャンはProプラン。無料プランでも共有ライブラリの単語帳を取り込んで、クイズとフラッシュカードで学習できます。', {
      x: M + 0.35, y: bannerY + bannerH * 0.28, w: CONTENT_W - 0.7, h: bannerH * 0.45,
      fontFace: BODY_FONT, fontSize: 13, bold: true, color: WHITE, lineSpacingMultiple: 1.2, margin: 0, isTextBox: true,
    });
    slide.addNotes('ヒーローの数字はLPと同じ（4抽出モード・共有単語帳の取込は無料・リールは無料プランで1日50枚・無料保存枠100語）。');
  }

  // 3. HOW IT WORKS ------------------------------------------------------
  {
    const slide = newSlide(pres);
    const top = addSectionHeading(slide, {
      number: '01', label: 'How it works', title: '撮る、確認する、覚える。',
      body: '手入力やコピペを前提にせず、教材の写真から単語帳を作ります。登録後すぐにホーム、単語帳、クイズへ進める構成です。',
    });

    const cardW = colWidth(4);
    const cardH = Math.min(H - M - top, W * 0.38);
    WORKFLOW.forEach(([step, label, title, body], i) => {
      const x = colX(i, 4);
      addCard(slide, { x, y: top, w: cardW, h: cardH });
      const pad = 0.28;
      slide.addShape('ellipse', {
        x: x + pad, y: top + 0.3, w: 0.55, h: 0.55,
        fill: { color: i % 2 === 0 ? ACCENT : INK }, line: { color: INK, width: 1 },
      });
      slide.addText(step, {
        x: x + pad, y: top + 0.41, w: 0.55, h: 0.33,
        align: 'center', fontFace: MONO_FONT, fontSize: 12, bold: true, color: WHITE, margin: 0, isTextBox: true,
      });
      slide.addText(label, {
        x: x + pad, y: top + 1.0, w: cardW - pad * 2, h: 0.26,
        fontFace: MONO_FONT, fontSize: 9.5, bold: true, color: MUTED, charSpacing: 1, margin: 0, isTextBox: true,
      });
      slide.addText(title, {
        x: x + pad, y: top + 1.28, w: cardW - pad * 2, h: 0.42,
        fontFace: BODY_FONT, fontSize: 18, bold: true, color: INK, margin: 0, isTextBox: true,
      });
      slide.addText(body, {
        x: x + pad, y: top + 1.8, w: cardW - pad * 2, h: cardH - 2.1,
        fontFace: BODY_FONT, fontSize: 11, color: BODY_INK, lineSpacingMultiple: 1.3, valign: 'top', margin: 0, isTextBox: true,
      });
    });
    slide.addNotes('LPの「01 HOW IT WORKS」セクションと同じ4ステップ。');
  }

  // 4. 抽出モード --------------------------------------------------------
  {
    const slide = newSlide(pres);
    const leftW = CONTENT_W * 0.66;
    const top = addSectionHeading(slide, {
      number: '02', label: 'Scan modes', title: '目的に合わせて、抽出方法を選ぶ。',
      body: 'まずは「すべての単語」で広く取り込み、必要に応じて丸囲み、英検、熟語・イディオムへ切り替えます。抽出後は確認画面で編集してから保存できます（スキャンはProプランの機能です）。',
      bodyW: leftW,
    });

    const cardW = colWidth(2, leftW);
    const cardH = (H - M - top - GAP) / 2;
    SCAN_MODES.forEach(([label, title, body], i) => {
      const x = colX(i % 2, 2, { width: leftW });
      const y = top + Math.floor(i / 2) * (cardH + GAP);
      addCard(slide, { x, y, w: cardW, h: cardH });
      const pad = 0.24;
      slide.addText(label, {
        x: x + pad, y: y + 0.2, w: cardW - pad * 2, h: 0.24,
        fontFace: MONO_FONT, fontSize: 9.5, bold: true, color: ACCENT, charSpacing: 1, margin: 0, isTextBox: true,
      });
      slide.addText(title, {
        x: x + pad, y: y + 0.46, w: cardW - pad * 2, h: 0.38,
        fontFace: BODY_FONT, fontSize: 15, bold: true, color: INK, margin: 0, isTextBox: true,
      });
      slide.addText(body, {
        x: x + pad, y: y + 0.88, w: cardW - pad * 2, h: cardH - 1.1,
        fontFace: BODY_FONT, fontSize: 10.5, color: BODY_INK, lineSpacingMultiple: 1.25, valign: 'top', margin: 0, isTextBox: true,
      });
    });

    const imgW = CONTENT_W - leftW - GAP;
    const imgY = HEADING_BOTTOM;
    slide.addImage({
      path: 'public/lp/scan-modes.png',
      x: W - M - imgW, y: imgY, w: imgW, h: H - M - imgY,
      sizing: { type: 'contain', w: imgW, h: H - M - imgY },
    });
    slide.addNotes('抽出モードは4種類。Proではユーザ定義のカスタム抽出モードも使える。');
  }

  // 5. 単語データ --------------------------------------------------------
  {
    const slide = newSlide(pres);
    const leftW = CONTENT_W * 0.44;
    const top = addSectionHeading(slide, {
      number: '03', label: 'Word detail', title: '保存した単語は、学習用データになる。',
      body: '和訳だけでなく、例文、品詞、発音記号、クイズ用の選択肢を持てる構造です。2語以上の表現は語順クイズとして扱い、4択だけに寄せすぎないようにしています。',
      bodyW: leftW,
    });

    const rowH = (H - M - top - GAP * 4) / WORD_DATA_ITEMS.length;
    WORD_DATA_ITEMS.forEach((item, i) => {
      const y = top + i * (rowH + GAP);
      addCard(slide, { x: M, y, w: leftW, h: rowH, fill: i === 0 ? INK : CARD });
      slide.addText(item, {
        x: M + 0.28, y: y + rowH * 0.25, w: leftW - 0.56, h: rowH * 0.5,
        fontFace: BODY_FONT, fontSize: 12.5, bold: true, color: i === 0 ? WHITE : INK, margin: 0, isTextBox: true,
      });
    });

    const imgW = CONTENT_W - leftW - GAP;
    const imgX = W - M - imgW;
    const imgH = (H - M - top) * 0.6;
    slide.addImage({
      path: shot('word-detail'), x: imgX, y: top, w: imgW, h: imgH,
      sizing: { type: 'contain', w: imgW, h: imgH },
    });
    slide.addText('単語カードの例（LPの実画面）', {
      x: imgX, y: top + imgH + 0.1, w: imgW, h: 0.3,
      fontFace: MONO_FONT, fontSize: 9.5, color: MUTED, margin: 0, isTextBox: true,
    });
    slide.addNotes('LPの「02 WORD DETAIL」に対応。take care のような複数語表現も1件として扱う。');
  }

  // 6. 学習機能 ----------------------------------------------------------
  {
    const slide = newSlide(pres);
    const leftW = CONTENT_W * 0.5;
    const top = addSectionHeading(slide, {
      number: '04', label: 'Study', title: '4つの復習の形。',
      body: '保存した単語は、4択・語順・カードの3系統で復習できます。結果は習得度に反映されます。',
      bodyW: leftW,
    });

    const cardW = colWidth(2, leftW);
    const cardH = (H - M - top - GAP) / 2;
    STUDY_FEATURES.forEach(([title, body], i) => {
      const x = colX(i % 2, 2, { width: leftW });
      const y = top + Math.floor(i / 2) * (cardH + GAP);
      addCard(slide, { x, y, w: cardW, h: cardH });
      const pad = 0.24;
      slide.addText(title, {
        x: x + pad, y: y + 0.24, w: cardW - pad * 2, h: 0.38,
        fontFace: BODY_FONT, fontSize: 15, bold: true, color: INK, margin: 0, isTextBox: true,
      });
      slide.addText(body, {
        x: x + pad, y: y + 0.66, w: cardW - pad * 2, h: cardH - 0.9,
        fontFace: BODY_FONT, fontSize: 10.5, color: BODY_INK, lineSpacingMultiple: 1.25, valign: 'top', margin: 0, isTextBox: true,
      });
    });

    const imgW = CONTENT_W - leftW - GAP;
    const imgX = W - M - imgW;
    const imgH = H - M - top - 0.4;
    slide.addImage({
      path: shot('quiz-demo'), x: imgX, y: top, w: imgW, h: imgH,
      sizing: { type: 'contain', w: imgW, h: imgH },
    });
    slide.addText('登録なしで試せるデモ（LPの実画面）', {
      x: imgX, y: top + imgH + 0.08, w: imgW, h: 0.3,
      fontFace: MONO_FONT, fontSize: 9.5, color: MUTED, margin: 0, isTextBox: true,
    });
    slide.addNotes('LPでは登録前にフラッシュカードと4択クイズをその場で試せる。');
  }

  // 7. リール ------------------------------------------------------------
  {
    const slide = newSlide(pres);
    const leftW = CONTENT_W * 0.72;
    const top = addSectionHeading(slide, {
      number: '05', label: 'Reels', title: 'スワイプするだけで、単語に出会う。',
      body: 'みんなが公開した単語帳と公式単語帳の単語が、1枚ずつ流れてくる縦スクロールのフィードです。',
      bodyW: leftW,
    });

    const bannerH = 0.75;
    const gridH = H - M - top - bannerH - GAP;
    const cardW = colWidth(2, leftW);
    const cardH = (gridH - GAP) / 2;
    REEL_POINTS.forEach(([title, body], i) => {
      const x = colX(i % 2, 2, { width: leftW });
      const y = top + Math.floor(i / 2) * (cardH + GAP);
      addCard(slide, { x, y, w: cardW, h: cardH });
      const pad = 0.24;
      slide.addText(title, {
        x: x + pad, y: y + 0.2, w: cardW - pad * 2, h: 0.36,
        fontFace: BODY_FONT, fontSize: 14, bold: true, color: INK, margin: 0, isTextBox: true,
      });
      slide.addText(body, {
        x: x + pad, y: y + 0.72, w: cardW - pad * 2, h: cardH - 0.94,
        fontFace: BODY_FONT, fontSize: 10.5, color: BODY_INK, lineSpacingMultiple: 1.25, valign: 'top', margin: 0, isTextBox: true,
      });
    });

    const bannerY = top + gridH + GAP;
    addCard(slide, { x: M, y: bannerY, w: leftW, h: bannerH, fill: INK });
    slide.addText('リールの閲覧は無料プランでも1日50枚まで（要ログイン）。Proは上限なし・広告なし。', {
      x: M + 0.3, y: bannerY + bannerH * 0.26, w: leftW - 0.6, h: bannerH * 0.5,
      fontFace: BODY_FONT, fontSize: 12, bold: true, color: WHITE, margin: 0, isTextBox: true,
    });

    const imgW = CONTENT_W - leftW - GAP;
    const imgY = HEADING_BOTTOM;
    slide.addImage({
      path: shot('reel-phone'), x: W - M - imgW, y: imgY, w: imgW, h: H - M - imgY,
      sizing: { type: 'contain', w: imgW, h: H - M - imgY },
    });
    slide.addNotes('語源つきカードは接頭辞・語根・接尾辞まで1画面。出典の単語帳はワンタップで取り込める。');
  }

  // 8. ホーム / 進捗 -----------------------------------------------------
  {
    const slide = newSlide(pres);
    const leftW = CONTENT_W * 0.6;
    const top = addSectionHeading(slide, {
      number: '06', label: 'Progress', title: 'ホームで、今日やることがすぐ見える。',
      body: '単語帳、習得度、連続日数、保存済み単語へアクセスできます。学習の入口をホームに集約し、スキャンから復習まで迷わない構成にしています。',
      bodyW: leftW,
    });

    const rowH = (H - M - top - GAP * 3) / PROGRESS_ITEMS.length;
    PROGRESS_ITEMS.forEach(([title, body], i) => {
      const y = top + i * (rowH + GAP);
      addCard(slide, { x: M, y, w: leftW, h: rowH });
      slide.addText(title, {
        x: M + 0.28, y: y + rowH * 0.16, w: leftW - 0.56, h: rowH * 0.36,
        fontFace: BODY_FONT, fontSize: 14, bold: true, color: INK, margin: 0, isTextBox: true,
      });
      slide.addText(body, {
        x: M + 0.28, y: y + rowH * 0.54, w: leftW - 0.56, h: rowH * 0.34,
        fontFace: BODY_FONT, fontSize: 10.5, color: BODY_INK, margin: 0, isTextBox: true,
      });
    });

    const imgW = CONTENT_W - leftW - GAP;
    const imgY = HEADING_BOTTOM;
    slide.addImage({
      path: 'public/lp/home.png', x: W - M - imgW, y: imgY, w: imgW, h: H - M - imgY,
      sizing: { type: 'contain', w: imgW, h: H - M - imgY },
    });
    slide.addNotes('ホーム画面には連続学習日数、クイズ導線、最近の単語帳が並ぶ。');
  }

  // 9. 料金 --------------------------------------------------------------
  {
    const slide = newSlide(pres);
    const top = addSectionHeading(slide, {
      number: '07', label: 'Pricing', title: '無料で始めて、必要ならProへ。',
      body: 'まずは無料で試し、AIスキャンや同期が必要になったらProへ切り替えられます。',
    });

    const cardW = colWidth(2);
    const cardH = H - M - top;
    PLANS.forEach((plan, i) => {
      const x = colX(i, 2);
      addCard(slide, { x, y: top, w: cardW, h: cardH, fill: plan.pro ? INK : CARD });
      const fg = plan.pro ? WHITE : INK;
      const pad = 0.35;
      slide.addText(plan.plan, {
        x: x + pad, y: top + 0.28, w: cardW - pad * 2, h: 0.28,
        fontFace: MONO_FONT, fontSize: 10.5, bold: true, color: plan.pro ? ACCENT_ON_DARK : MUTED, charSpacing: 2, margin: 0, isTextBox: true,
      });
      slide.addText(plan.name, {
        x: x + pad, y: top + 0.58, w: cardW - pad * 2, h: 0.45,
        fontFace: BODY_FONT, fontSize: 20, bold: true, color: fg, margin: 0, isTextBox: true,
      });
      slide.addText(
        [
          { text: plan.price, options: { fontSize: 34, bold: true, color: fg } },
          { text: ' 円 / 月', options: { fontSize: 13, bold: true, color: plan.pro ? 'C9C6BE' : MUTED } },
        ],
        { x: x + pad, y: top + 1.1, w: cardW - pad * 2, h: 0.65, fontFace: BODY_FONT, margin: 0, isTextBox: true },
      );
      slide.addText(plan.description, {
        x: x + pad, y: top + 1.85, w: cardW - pad * 2, h: 0.5,
        fontFace: BODY_FONT, fontSize: 10.5, color: plan.pro ? 'C9C6BE' : BODY_INK, lineSpacingMultiple: 1.25, margin: 0, isTextBox: true,
      });
      slide.addText(
        plan.features.map((feature, index) => ({
          text: feature,
          options: { bullet: true, breakLine: index !== plan.features.length - 1 },
        })),
        {
          x: x + pad, y: top + 2.45, w: cardW - pad * 2, h: cardH - 2.8,
          fontFace: BODY_FONT, fontSize: 11.5, color: fg, paraSpaceAfter: 6, valign: 'top', margin: 0, isTextBox: true,
        },
      );
    });
    slide.addNotes('Proは月額300円。無料プランは共有単語帳の取り込みと基本の復習まで。');
  }

  // 10. クロージング -----------------------------------------------------
  {
    const slide = newSlide(pres, { dark: true });
    slide.addText('READY', {
      x: M, y: H * 0.28, w: CONTENT_W, h: 0.28,
      fontFace: MONO_FONT, fontSize: 11, bold: true, color: ACCENT_ON_DARK, charSpacing: 2, margin: 0, isTextBox: true,
    });
    slide.addText('単語帳を、\nもう手で作らなくていい。', {
      x: M, y: H * 0.34, w: CONTENT_W * 0.8, h: H * 0.24,
      fontFace: BODY_FONT, fontSize: 34, bold: true, color: WHITE, lineSpacingMultiple: 1.15, margin: 0, isTextBox: true,
    });
    slide.addText('ブラウザからすぐに開始できます。メールOTP、Google、Appleのいずれかで登録し、最初の単語帳を作成してください。', {
      x: M, y: H * 0.62, w: CONTENT_W * 0.72, h: H * 0.11,
      fontFace: BODY_FONT, fontSize: 12, color: ON_DARK_BODY, lineSpacingMultiple: 1.3, margin: 0, isTextBox: true,
    });
    const btnW = 2.3;
    const btnH = 0.66;
    const btnY = H * 0.77;
    slide.addShape('roundRect', {
      x: M, y: btnY, w: btnW, h: btnH,
      rectRadius: 0.1, fill: { color: ACCENT_ON_DARK }, line: { color: ACCENT_ON_DARK, width: 1 },
    });
    slide.addText('無料で始める', {
      x: M, y: btnY + btnH * 0.22, w: btnW, h: btnH * 0.55,
      align: 'center', fontFace: BODY_FONT, fontSize: 13, bold: true, color: INK, margin: 0, isTextBox: true,
    });
    slide.addText('www.merken.jp', {
      x: M + btnW + 0.35, y: btnY + btnH * 0.25, w: 2.5, h: 0.35,
      fontFace: MONO_FONT, fontSize: 12, color: WHITE, margin: 0, isTextBox: true,
    });
    slide.addNotes('LP末尾のCTAと同じ文言。');
  }

  await mkdir(path.dirname(outFile), { recursive: true });
  await pres.writeFile({ fileName: outFile });
  console.log(`wrote ${outFile} (${layout.name} ${W}x${H}in)`);
}

if (process.env.LP_PPTX_SKIP_CAPTURE !== '1') {
  await captureShots();
}
await buildDeck();
