#!/usr/bin/env node
/**
 * トップページ (未ログイン時のLP = src/components/home/GuestLanding.tsx) の内容を
 * PowerPoint (.pptx) に書き出す。LPの実物のモック画像・カードをブラウザから切り出し、
 * LPと同じ配色 (クリーム地 + 黒枠 + グリーン) のスライドに組み直している。
 *
 * 使い方:
 *   npm run build && npm run start                    # 別ターミナルで起動しておく
 *   npm i --no-save playwright-core pptxgenjs         # 実行時のみ必要 (依存には入れていない)
 *   node scripts/generate-lp-pptx.mjs
 *
 * 環境変数:
 *   LP_URL           対象URL             (既定: http://localhost:3000/)
 *   LP_PPTX_OUT      出力ファイル        (既定: output/pptx/merken-lp.pptx)
 *   LP_SHOT_DIR      切り出し画像の置き場 (既定: output/pptx/shots)
 *   CHROMIUM_PATH    Chromium実行パス    (未指定ならplaywright同梱を使う)
 *
 * 注意: アイコンは Google Fonts の Material Symbols なので、ネットワークが無い環境では
 * リガチャ名の文字列として写り込む。切り出し前に非表示にしている。
 */
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright-core';
import PptxGenJS from 'pptxgenjs';

const url = process.env.LP_URL ?? 'http://localhost:3000/';
const outFile = process.env.LP_PPTX_OUT ?? 'output/pptx/merken-lp.pptx';
const shotDir = process.env.LP_SHOT_DIR ?? 'output/pptx/shots';
const executablePath = process.env.CHROMIUM_PATH || undefined;

// LPの配色 (src/app/globals.css / GuestLanding.tsx と同じ値)
const INK = '1A1A1A';
const CREAM = 'F3F0E9';
const CARD = 'FAF7F1';
const ACCENT = '15803D';
const ACCENT_ON_DARK = '4ADE80';
const MUTED = '8A857A';
const WHITE = 'FFFFFF';

const BODY_FONT = 'Arial';
const MONO_FONT = 'Courier New';

// ---------------------------------------------------------------- LPの文言

const HERO = {
  eyebrow: 'AI VOCABULARY NOTEBOOK',
  title: ['手入力ゼロで、', '単語帳。'],
  body: '教科書・ノート・プリントを撮影するだけ。AIが英単語、和訳、例文、発音記号、クイズ素材を作り、あなた専用の単語帳として保存できます（AIスキャンはProプラン）。無料でも共有ライブラリから単語帳を取り込んで、すぐに学習を始められます。',
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

/** LPのカード (2px黒枠 + ずらした黒影) を再現する。影は毎回作り直す必要がある。 */
function addCard(slide, { x, y, w, h, fill = CARD, line = INK }) {
  slide.addShape('roundRect', {
    x, y, w, h,
    rectRadius: 0.12,
    fill: { color: fill },
    line: { color: line, width: 1.5 },
    shadow: { type: 'outer', color: INK, blur: 0, offset: 0.05, angle: 45, opacity: 1 },
  });
}

/** 見出し (通し番号 + ラベル + タイトル)。LPのセクション見出しに合わせている。 */
function addSectionHeading(slide, { number, label, title, x = 0.65, y = 0.5, w = 8 }) {
  slide.addText(
    [
      { text: `${number} `, options: { color: ACCENT, bold: true } },
      { text: label.toUpperCase(), options: { color: MUTED, bold: true } },
    ],
    { x, y, w, h: 0.28, fontFace: MONO_FONT, fontSize: 11, charSpacing: 1.5, margin: 0, isTextBox: true },
  );
  slide.addText(title, {
    x, y: y + 0.3, w, h: 0.72,
    fontFace: BODY_FONT, fontSize: 30, bold: true, color: INK, margin: 0, isTextBox: true,
  });
}

function newSlide(pres, { dark = false } = {}) {
  const slide = pres.addSlide();
  slide.background = { color: dark ? INK : CREAM };
  return slide;
}

async function buildDeck() {
  const pres = new PptxGenJS();
  pres.layout = 'LAYOUT_WIDE'; // 13.33 x 7.5 inch
  pres.author = 'MERKEN';
  pres.title = 'MERKEN サービス紹介';

  const shot = (name) => path.join(shotDir, `${name}.png`);

  // 1. 表紙 --------------------------------------------------------------
  {
    const slide = newSlide(pres, { dark: true });
    slide.addText('M E R K E N', {
      x: 0.75, y: 0.55, w: 5, h: 0.4,
      fontFace: BODY_FONT, fontSize: 16, bold: true, color: WHITE, charSpacing: 3, margin: 0, isTextBox: true,
    });
    slide.addText(HERO.eyebrow, {
      x: 0.75, y: 2.15, w: 6, h: 0.3,
      fontFace: MONO_FONT, fontSize: 12, bold: true, color: ACCENT_ON_DARK, charSpacing: 2, margin: 0, isTextBox: true,
    });
    slide.addText(
      [
        { text: HERO.title[0], options: { color: WHITE, breakLine: true } },
        { text: HERO.title[1], options: { color: ACCENT_ON_DARK } },
      ],
      { x: 0.75, y: 2.5, w: 7.4, h: 1.9, fontFace: BODY_FONT, fontSize: 44, bold: true, lineSpacingMultiple: 1.1, margin: 0, isTextBox: true },
    );
    slide.addText(
      '教科書・ノート・プリントを撮影するだけ。AIが英単語、和訳、例文、発音記号、クイズ素材を作り、あなた専用の単語帳として保存できます。',
      { x: 0.75, y: 4.5, w: 6.9, h: 1.0, fontFace: BODY_FONT, fontSize: 13, color: 'D8D4CA', lineSpacingMultiple: 1.3, margin: 0, isTextBox: true },
    );
    slide.addText('www.merken.jp', {
      x: 0.75, y: 6.45, w: 4, h: 0.3,
      fontFace: MONO_FONT, fontSize: 12, color: ACCENT_ON_DARK, margin: 0, isTextBox: true,
    });
    slide.addImage({ path: shot('flashcard-demo'), x: 8.3, y: 2.35, w: 4.3, h: 3.1, sizing: { type: 'contain', w: 4.3, h: 3.1 } });
    slide.addNotes('MERKENのトップページ（未ログイン時のランディングページ）の内容をスライドにしたものです。');
  }

  // 2. 概要と数字 --------------------------------------------------------
  {
    const slide = newSlide(pres);
    addSectionHeading(slide, { number: '00', label: 'Overview', title: '写真から、単語帳ができる。' });
    slide.addText(HERO.body, {
      x: 0.65, y: 1.6, w: 12.05, h: 0.95,
      fontFace: BODY_FONT, fontSize: 13, color: '4A4740', lineSpacingMultiple: 1.35, margin: 0, isTextBox: true,
    });

    const cardW = 2.85;
    const gap = 0.28;
    HERO.stats.forEach(([num, label], i) => {
      const x = 0.65 + i * (cardW + gap);
      addCard(slide, { x, y: 2.95, w: cardW, h: 1.85 });
      slide.addText(num, {
        x: x + 0.3, y: 3.25, w: cardW - 0.6, h: 0.7,
        fontFace: BODY_FONT, fontSize: 34, bold: true, color: i === 0 ? ACCENT : INK, margin: 0, isTextBox: true,
      });
      slide.addText(label, {
        x: x + 0.3, y: 4.05, w: cardW - 0.6, h: 0.5,
        fontFace: BODY_FONT, fontSize: 11, color: MUTED, margin: 0, isTextBox: true,
      });
    });

    addCard(slide, { x: 0.65, y: 5.2, w: 12.05, h: 1.5, fill: INK });
    slide.addText('スキャンはProプラン。無料プランでも共有ライブラリの単語帳を取り込んで、クイズとフラッシュカードで学習できます。', {
      x: 1.05, y: 5.55, w: 11.25, h: 0.8,
      fontFace: BODY_FONT, fontSize: 14, bold: true, color: WHITE, lineSpacingMultiple: 1.25, margin: 0, isTextBox: true,
    });
    slide.addNotes('ヒーローの数字はLPと同じ（4抽出モード・共有単語帳の取込は無料・リールは無料プランで1日50枚・無料保存枠100語）。');
  }

  // 3. HOW IT WORKS ------------------------------------------------------
  {
    const slide = newSlide(pres);
    addSectionHeading(slide, { number: '01', label: 'How it works', title: '撮る、確認する、覚える。' });
    slide.addText('手入力やコピペを前提にせず、教材の写真から単語帳を作ります。登録後すぐにホーム、単語帳、クイズへ進める構成です。', {
      x: 0.65, y: 1.6, w: 12.05, h: 0.5,
      fontFace: BODY_FONT, fontSize: 13, color: '4A4740', margin: 0, isTextBox: true,
    });

    const cardW = 2.85;
    const gap = 0.28;
    WORKFLOW.forEach(([step, label, title, body], i) => {
      const x = 0.65 + i * (cardW + gap);
      addCard(slide, { x, y: 2.5, w: cardW, h: 3.6 });
      slide.addShape('ellipse', {
        x: x + 0.32, y: 2.85, w: 0.62, h: 0.62,
        fill: { color: i % 2 === 0 ? ACCENT : INK }, line: { color: INK, width: 1 },
      });
      slide.addText(step, {
        x: x + 0.32, y: 2.98, w: 0.62, h: 0.36,
        align: 'center', fontFace: MONO_FONT, fontSize: 13, bold: true, color: WHITE, margin: 0, isTextBox: true,
      });
      slide.addText(label, {
        x: x + 0.32, y: 3.65, w: cardW - 0.64, h: 0.28,
        fontFace: MONO_FONT, fontSize: 10, bold: true, color: MUTED, charSpacing: 1, margin: 0, isTextBox: true,
      });
      slide.addText(title, {
        x: x + 0.32, y: 3.95, w: cardW - 0.64, h: 0.45,
        fontFace: BODY_FONT, fontSize: 19, bold: true, color: INK, margin: 0, isTextBox: true,
      });
      slide.addText(body, {
        x: x + 0.32, y: 4.5, w: cardW - 0.64, h: 1.35,
        fontFace: BODY_FONT, fontSize: 11.5, color: '4A4740', lineSpacingMultiple: 1.3, margin: 0, isTextBox: true,
      });
    });
    slide.addNotes('LPの「01 HOW IT WORKS」セクションと同じ4ステップ。');
  }

  // 4. 抽出モード --------------------------------------------------------
  {
    const slide = newSlide(pres);
    addSectionHeading(slide, { number: '02', label: 'Scan modes', title: '目的に合わせて、抽出方法を選ぶ。' });
    slide.addText('まずは「すべての単語」で広く取り込み、必要に応じて丸囲み、英検、熟語・イディオムへ切り替えます。抽出後は確認画面で編集してから保存できます（スキャンはProプランの機能です）。', {
      x: 0.65, y: 1.6, w: 8.1, h: 0.7,
      fontFace: BODY_FONT, fontSize: 12.5, color: '4A4740', lineSpacingMultiple: 1.3, margin: 0, isTextBox: true,
    });

    const cardW = 3.9;
    const cardH = 1.85;
    SCAN_MODES.forEach(([label, title, body], i) => {
      const x = 0.65 + (i % 2) * (cardW + 0.3);
      const y = 2.5 + Math.floor(i / 2) * (cardH + 0.3);
      addCard(slide, { x, y, w: cardW, h: cardH });
      slide.addText(label, {
        x: x + 0.28, y: y + 0.22, w: cardW - 0.56, h: 0.26,
        fontFace: MONO_FONT, fontSize: 10, bold: true, color: ACCENT, charSpacing: 1, margin: 0, isTextBox: true,
      });
      slide.addText(title, {
        x: x + 0.28, y: y + 0.5, w: cardW - 0.56, h: 0.4,
        fontFace: BODY_FONT, fontSize: 16, bold: true, color: INK, margin: 0, isTextBox: true,
      });
      slide.addText(body, {
        x: x + 0.28, y: y + 0.95, w: cardW - 0.56, h: 0.75,
        fontFace: BODY_FONT, fontSize: 10.5, color: '4A4740', lineSpacingMultiple: 1.25, margin: 0, isTextBox: true,
      });
    });

    slide.addImage({ path: 'public/lp/scan-modes.png', x: 9.3, y: 1.35, w: 3.4, h: 5.6, sizing: { type: 'contain', w: 3.4, h: 5.6 } });
    slide.addNotes('抽出モードは4種類。カスタム抽出モードを含めるとProではさらに細かく指定できる。');
  }

  // 5. 単語データ --------------------------------------------------------
  {
    const slide = newSlide(pres);
    addSectionHeading(slide, { number: '03', label: 'Word detail', title: '保存した単語は、学習用データになる。' });
    slide.addText('和訳だけでなく、例文、品詞、発音記号、クイズ用の選択肢を持てる構造です。2語以上の表現は語順クイズとして扱い、4択だけに寄せすぎないようにしています。', {
      x: 0.65, y: 1.6, w: 5.3, h: 1.1,
      fontFace: BODY_FONT, fontSize: 12.5, color: '4A4740', lineSpacingMultiple: 1.35, margin: 0, isTextBox: true,
    });

    const items = ['和訳・品詞', '例文（英日）', '発音記号', 'クイズ用の選択肢', '習得度・復習履歴'];
    items.forEach((item, i) => {
      const y = 2.9 + i * 0.72;
      addCard(slide, { x: 0.65, y, w: 5.3, h: 0.58, fill: i === 0 ? INK : CARD });
      slide.addText(item, {
        x: 0.95, y: y + 0.12, w: 4.7, h: 0.34,
        fontFace: BODY_FONT, fontSize: 13, bold: true, color: i === 0 ? WHITE : INK, margin: 0, isTextBox: true,
      });
    });

    slide.addImage({ path: shot('word-detail'), x: 6.6, y: 2.4, w: 6.1, h: 2.8, sizing: { type: 'contain', w: 6.1, h: 2.8 } });
    slide.addText('単語カードの例（LPの実画面）', {
      x: 6.6, y: 5.35, w: 6.1, h: 0.3,
      fontFace: MONO_FONT, fontSize: 10, color: MUTED, margin: 0, isTextBox: true,
    });
    slide.addNotes('LPの「02 WORD DETAIL」に対応。take care のような複数語表現も1件として扱う。');
  }

  // 6. 学習機能 ----------------------------------------------------------
  {
    const slide = newSlide(pres);
    addSectionHeading(slide, { number: '04', label: 'Study', title: '4つの復習の形。' });

    const cardW = 3.05;
    const cardH = 2.15;
    STUDY_FEATURES.forEach(([title, body], i) => {
      const x = 0.65 + (i % 2) * (cardW + 0.3);
      const y = 1.85 + Math.floor(i / 2) * (cardH + 0.3);
      addCard(slide, { x, y, w: cardW, h: cardH });
      slide.addText(title, {
        x: x + 0.26, y: y + 0.28, w: cardW - 0.52, h: 0.4,
        fontFace: BODY_FONT, fontSize: 16, bold: true, color: INK, margin: 0, isTextBox: true,
      });
      slide.addText(body, {
        x: x + 0.26, y: y + 0.75, w: cardW - 0.52, h: 1.2,
        fontFace: BODY_FONT, fontSize: 10.5, color: '4A4740', lineSpacingMultiple: 1.25, margin: 0, isTextBox: true,
      });
    });

    slide.addImage({ path: shot('quiz-demo'), x: 7.5, y: 1.9, w: 5.2, h: 4.4, sizing: { type: 'contain', w: 5.2, h: 4.4 } });
    slide.addText('登録なしで試せるデモ（LPの実画面）', {
      x: 7.5, y: 6.4, w: 5.2, h: 0.3,
      fontFace: MONO_FONT, fontSize: 10, color: MUTED, margin: 0, isTextBox: true,
    });
    slide.addNotes('LPでは登録前にフラッシュカードと4択クイズをその場で試せる。');
  }

  // 7. リール ------------------------------------------------------------
  {
    const slide = newSlide(pres);
    addSectionHeading(slide, { number: '05', label: 'Reels', title: 'スワイプするだけで、単語に出会う。' });

    const cardW = 4.35;
    const cardH = 1.9;
    REEL_POINTS.forEach(([title, body], i) => {
      const x = 0.65 + (i % 2) * (cardW + 0.3);
      const y = 1.75 + Math.floor(i / 2) * (cardH + 0.3);
      addCard(slide, { x, y, w: cardW, h: cardH });
      slide.addText(title, {
        x: x + 0.26, y: y + 0.22, w: cardW - 0.52, h: 0.38,
        fontFace: BODY_FONT, fontSize: 15, bold: true, color: INK, margin: 0, isTextBox: true,
      });
      slide.addText(body, {
        x: x + 0.26, y: y + 0.65, w: cardW - 0.52, h: 1.05,
        fontFace: BODY_FONT, fontSize: 10.5, color: '4A4740', lineSpacingMultiple: 1.25, margin: 0, isTextBox: true,
      });
    });

    addCard(slide, { x: 0.65, y: 6.05, w: 9.0, h: 0.85, fill: INK });
    slide.addText('リールの閲覧は無料プランでも1日50枚まで（要ログイン）。Proは上限なし・広告なし。', {
      x: 1.0, y: 6.28, w: 8.4, h: 0.4,
      fontFace: BODY_FONT, fontSize: 12.5, bold: true, color: WHITE, margin: 0, isTextBox: true,
    });

    slide.addImage({ path: shot('reel-phone'), x: 10.15, y: 1.3, w: 2.55, h: 5.6, sizing: { type: 'contain', w: 2.55, h: 5.6 } });
    slide.addNotes('公開単語帳と公式単語帳の単語が1枚ずつ流れるフィード。語源つきカードは接頭辞・語根・接尾辞まで1画面。');
  }

  // 8. ホーム / 進捗 -----------------------------------------------------
  {
    const slide = newSlide(pres);
    addSectionHeading(slide, { number: '06', label: 'Progress', title: 'ホームで、今日やることがすぐ見える。' });
    slide.addText('単語帳、習得度、連続日数、保存済み単語へアクセスできます。学習の入口をホームに集約し、スキャンから復習まで迷わない構成にしています。', {
      x: 0.65, y: 1.6, w: 7.5, h: 0.75,
      fontFace: BODY_FONT, fontSize: 12.5, color: '4A4740', lineSpacingMultiple: 1.3, margin: 0, isTextBox: true,
    });

    PROGRESS_ITEMS.forEach(([title, body], i) => {
      const y = 2.6 + i * 1.05;
      addCard(slide, { x: 0.65, y, w: 7.5, h: 0.9 });
      slide.addText(title, {
        x: 0.95, y: y + 0.13, w: 2.2, h: 0.32,
        fontFace: BODY_FONT, fontSize: 15, bold: true, color: INK, margin: 0, isTextBox: true,
      });
      slide.addText(body, {
        x: 0.95, y: y + 0.47, w: 6.9, h: 0.3,
        fontFace: BODY_FONT, fontSize: 11, color: '4A4740', margin: 0, isTextBox: true,
      });
    });

    slide.addImage({ path: 'public/lp/home.png', x: 8.6, y: 1.35, w: 4.1, h: 5.6, sizing: { type: 'contain', w: 4.1, h: 5.6 } });
    slide.addNotes('ホーム画面には連続学習日数、クイズ導線、最近の単語帳が並ぶ。');
  }

  // 9. 料金 --------------------------------------------------------------
  {
    const slide = newSlide(pres);
    addSectionHeading(slide, { number: '07', label: 'Pricing', title: '無料で始めて、必要ならProへ。' });
    slide.addText('まずは無料で試し、AIスキャンや同期が必要になったらProへ切り替えられます。', {
      x: 0.65, y: 1.6, w: 12.05, h: 0.4,
      fontFace: BODY_FONT, fontSize: 12.5, color: '4A4740', margin: 0, isTextBox: true,
    });

    PLANS.forEach((plan, i) => {
      const x = 0.65 + i * 6.2;
      const w = 5.9;
      addCard(slide, { x, y: 2.3, w, h: 4.4, fill: plan.pro ? INK : CARD });
      const fg = plan.pro ? WHITE : INK;
      slide.addText(plan.plan, {
        x: x + 0.35, y: 2.55, w: w - 0.7, h: 0.3,
        fontFace: MONO_FONT, fontSize: 11, bold: true, color: plan.pro ? ACCENT_ON_DARK : MUTED, charSpacing: 2, margin: 0, isTextBox: true,
      });
      slide.addText(plan.name, {
        x: x + 0.35, y: 2.85, w: w - 0.7, h: 0.45,
        fontFace: BODY_FONT, fontSize: 22, bold: true, color: fg, margin: 0, isTextBox: true,
      });
      slide.addText(
        [
          { text: plan.price, options: { fontSize: 40, bold: true, color: fg } },
          { text: ' 円 / 月', options: { fontSize: 14, bold: true, color: plan.pro ? 'C9C6BE' : MUTED } },
        ],
        { x: x + 0.35, y: 3.4, w: w - 0.7, h: 0.75, fontFace: BODY_FONT, margin: 0, isTextBox: true },
      );
      slide.addText(plan.description, {
        x: x + 0.35, y: 4.25, w: w - 0.7, h: 0.55,
        fontFace: BODY_FONT, fontSize: 11, color: plan.pro ? 'C9C6BE' : '4A4740', lineSpacingMultiple: 1.25, margin: 0, isTextBox: true,
      });
      slide.addText(
        plan.features.map((feature, index) => ({
          text: feature,
          options: { bullet: true, breakLine: index !== plan.features.length - 1 },
        })),
        {
          x: x + 0.35, y: 4.9, w: w - 0.7, h: 1.5,
          fontFace: BODY_FONT, fontSize: 11.5, color: fg, paraSpaceAfter: 6, margin: 0, isTextBox: true,
        },
      );
    });
    slide.addNotes('Proは月額300円。無料プランは共有単語帳の取り込みと基本の復習まで。');
  }

  // 10. クロージング -----------------------------------------------------
  {
    const slide = newSlide(pres, { dark: true });
    slide.addText('READY', {
      x: 0.9, y: 2.1, w: 6, h: 0.3,
      fontFace: MONO_FONT, fontSize: 12, bold: true, color: ACCENT_ON_DARK, charSpacing: 2, margin: 0, isTextBox: true,
    });
    slide.addText('単語帳を、\nもう手で作らなくていい。', {
      x: 0.9, y: 2.5, w: 8.6, h: 1.9,
      fontFace: BODY_FONT, fontSize: 38, bold: true, color: WHITE, lineSpacingMultiple: 1.15, margin: 0, isTextBox: true,
    });
    slide.addText('ブラウザからすぐに開始できます。メールOTP、Google、Appleのいずれかで登録し、最初の単語帳を作成してください。', {
      x: 0.9, y: 4.5, w: 7.8, h: 0.7,
      fontFace: BODY_FONT, fontSize: 13, color: 'D8D4CA', lineSpacingMultiple: 1.3, margin: 0, isTextBox: true,
    });
    slide.addShape('roundRect', {
      x: 0.9, y: 5.5, w: 2.6, h: 0.72,
      rectRadius: 0.1, fill: { color: ACCENT_ON_DARK }, line: { color: ACCENT_ON_DARK, width: 1 },
    });
    slide.addText('無料で始める', {
      x: 0.9, y: 5.65, w: 2.6, h: 0.42,
      align: 'center', fontFace: BODY_FONT, fontSize: 14, bold: true, color: INK, margin: 0, isTextBox: true,
    });
    slide.addText('www.merken.jp', {
      x: 3.8, y: 5.68, w: 3, h: 0.36,
      fontFace: MONO_FONT, fontSize: 13, color: WHITE, margin: 0, isTextBox: true,
    });
    slide.addNotes('LP末尾のCTAと同じ文言。');
  }

  await mkdir(path.dirname(outFile), { recursive: true });
  await pres.writeFile({ fileName: outFile });
  console.log(`wrote ${outFile}`);
}

await captureShots();
await buildDeck();
