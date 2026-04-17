'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRef } from 'react';
import { motion, useScroll, useTransform, useInView } from 'framer-motion';
import { Icon } from '@/components/ui/Icon';
import { StatusAwareCta } from '@/components/marketing/StatusAwareCta';

/* ═══════════════════════════════════════════════════════════════
   MERKEN Landing Page — v2
   Aesthetic: Japanese study notebook × editorial magazine
   Palette : paper off-white / ink black / stamp red / indigo accent
   ═══════════════════════════════════════════════════════════════ */

const PAPER = '#faf7ef';
const INK = '#1a1a1a';
const STAMP = '#c0392b';
const INDIGO = '#1e3a8a';

function Reveal({
  children,
  delay = 0,
  y = 24,
  className = '',
}: {
  children: React.ReactNode;
  delay?: number;
  y?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-60px' });
  return (
    <motion.div
      ref={ref}
      className={className}
      initial={{ opacity: 0, y }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.7, delay, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  );
}

/* A faint ruled-paper background layer used across sections */
function RuledPaper({ className = '' }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={`absolute inset-0 pointer-events-none opacity-[0.35] ${className}`}
      style={{
        backgroundImage:
          'repeating-linear-gradient(to bottom, transparent 0px, transparent 31px, rgba(26,26,26,0.08) 32px)',
      }}
    />
  );
}

/* Red hanko-style stamp */
function Stamp({ label, className = '' }: { label: string; className?: string }) {
  return (
    <div
      className={`inline-flex items-center justify-center border-2 rounded-md px-2 py-1 font-display font-bold text-[10px] tracking-[0.25em] rotate-[-4deg] ${className}`}
      style={{ color: STAMP, borderColor: STAMP }}
    >
      {label}
    </div>
  );
}

const scanModes = [
  { no: '01', jp: '全抽出', en: 'ALL', desc: 'ページ全体の英単語を一括でリスト化。' },
  { no: '02', jp: '丸囲み', en: 'CIRCLED', desc: '手書きの丸枠の中だけをピンポイント抽出。', featured: true },
  { no: '03', jp: '英検級', en: 'EIKEN', desc: '指定した級 (5〜1) の単語のみフィルター。' },
  { no: '04', jp: '熟語', en: 'IDIOM', desc: '文脈から慣用句をAIが判断して抽出。' },
];

const studyModes = [
  { kanji: '問', jp: '4択クイズ', desc: 'AIが自動で生成したダミー選択肢で、テンポよく記憶を確認。' },
  { kanji: '札', jp: 'フラッシュカード', desc: '英↔日の切替とスワイプで、直感的にさっと復習。' },
  { kanji: '憶', jp: 'SM-2反復', desc: '忘れかける最適タイミングで自動再出題。' },
  { kanji: '録', jp: '学習ログ', desc: '学習量・正答率・連続日数を自動で可視化。' },
];

export default function LandingPageV2() {
  const heroRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: heroRef,
    offset: ['start start', 'end start'],
  });
  const heroY = useTransform(scrollYProgress, [0, 1], [0, 120]);

  return (
    <div
      className="min-h-screen overflow-x-hidden"
      style={{ backgroundColor: PAPER, color: INK }}
    >
      {/* ━━━ Top meta bar (like a magazine masthead) ━━━ */}
      <div
        className="border-b text-[10px] font-mono tracking-[0.2em] uppercase"
        style={{ borderColor: 'rgba(26,26,26,0.15)' }}
      >
        <div className="max-w-6xl mx-auto px-6 h-8 flex items-center justify-between">
          <span>Merken / Vol.001 / Vocabulary Study Notebook</span>
          <span className="hidden sm:block">For Japanese English Learners</span>
          <span>¥0 — Free to start</span>
        </div>
      </div>

      {/* ━━━ Navigation ━━━ */}
      <nav
        className="sticky top-0 z-50 border-b backdrop-blur"
        style={{
          backgroundColor: 'rgba(250,247,239,0.85)',
          borderColor: 'rgba(26,26,26,0.12)',
        }}
      >
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/lp/v2" className="flex items-baseline gap-2">
            <span className="font-display text-2xl font-black tracking-tight">MERKEN</span>
            <span className="text-[10px] font-mono tracking-[0.3em] opacity-60">メルケン</span>
          </Link>

          <div className="hidden md:flex items-center gap-8 text-sm">
            <Link href="#workflow" className="hover:opacity-60 transition">仕組み</Link>
            <Link href="#modes" className="hover:opacity-60 transition">抽出モード</Link>
            <Link href="#study" className="hover:opacity-60 transition">学習</Link>
            <Link href="#pricing" className="hover:opacity-60 transition">料金</Link>
          </div>

          <StatusAwareCta
            guestLabel="はじめる"
            authLabel="開く"
            size="sm"
            className="text-sm"
          />
        </div>
      </nav>

      {/* ━━━ Hero ━━━ */}
      <section ref={heroRef} className="relative overflow-hidden">
        <RuledPaper />

        <motion.div style={{ y: heroY }} className="relative max-w-6xl mx-auto px-6 pt-16 pb-24 md:pt-24 md:pb-32">
          {/* Issue marker */}
          <Reveal>
            <div className="flex items-center gap-4 mb-8">
              <span
                className="font-mono text-xs tracking-[0.3em] px-2 py-1 border"
                style={{ borderColor: INK }}
              >
                ISSUE — 001
              </span>
              <span className="font-mono text-xs opacity-60">
                {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: '2-digit' })}
              </span>
              <Stamp label="AI POWERED" />
            </div>
          </Reveal>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-end">
            {/* Headline */}
            <div className="lg:col-span-7">
              <Reveal delay={0.05}>
                <p className="font-display text-sm tracking-[0.3em] mb-6" style={{ color: STAMP }}>
                  撮 る・覚 え る・合 格 す る
                </p>
              </Reveal>
              <Reveal delay={0.1}>
                <h1
                  className="font-display font-black leading-[0.95] tracking-tight"
                  style={{ fontSize: 'clamp(3rem, 8vw, 6rem)' }}
                >
                  手書きのノートが、
                  <br />
                  <span className="relative inline-block">
                    <span
                      className="absolute left-0 right-0 bottom-2 h-4 -z-0"
                      style={{ backgroundColor: 'rgba(192, 57, 43, 0.2)' }}
                    />
                    <span className="relative">最強の単語帳</span>
                  </span>
                  に。
                </h1>
              </Reveal>

              <Reveal delay={0.2}>
                <p className="mt-8 text-base md:text-lg leading-relaxed max-w-xl opacity-80">
                  ペンで丸をつけて、写真を撮るだけ。MERKENのAIが英単語と和訳を自動で抽出し、
                  あなた専用の単語帳を組み立てます。抽出、クイズ、反復。すべてこの1つで。
                </p>
              </Reveal>

              <Reveal delay={0.3}>
                <div className="mt-10 flex flex-col sm:flex-row items-start sm:items-center gap-4">
                  <StatusAwareCta
                    guestLabel="無料ではじめる"
                    authLabel="ダッシュボードを開く"
                    size="lg"
                    icon="arrow_forward"
                  />
                  <Link
                    href="#workflow"
                    className="group flex items-center gap-2 text-sm font-semibold underline underline-offset-4 decoration-dotted"
                  >
                    仕組みを見る
                    <Icon name="arrow_downward" size={16} className="group-hover:translate-y-0.5 transition" />
                  </Link>
                </div>
              </Reveal>

              <Reveal delay={0.4}>
                <div className="mt-10 flex flex-wrap items-center gap-6 text-xs font-mono opacity-70">
                  <span className="flex items-center gap-1.5">
                    <Icon name="check_circle" size={14} style={{ color: STAMP }} />
                    クレジットカード不要
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Icon name="check_circle" size={14} style={{ color: STAMP }} />
                    1 分で開始
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Icon name="check_circle" size={14} style={{ color: STAMP }} />
                    PWA 対応
                  </span>
                </div>
              </Reveal>
            </div>

            {/* Hero visual — polaroid stack on paper */}
            <div className="lg:col-span-5 relative h-[480px] md:h-[560px]">
              <Reveal delay={0.3}>
                <div
                  className="absolute top-6 -left-4 w-[260px] p-3 bg-white shadow-[0_24px_48px_-16px_rgba(0,0,0,0.25)] rotate-[-6deg]"
                  style={{ border: '1px solid rgba(0,0,0,0.05)' }}
                >
                  <div className="relative w-full aspect-[3/4] overflow-hidden">
                    <Image
                      src="/lp/instagram/vocab-circled-1.jpg"
                      alt="丸囲み単語帳"
                      fill
                      className="object-cover"
                    />
                  </div>
                  <p className="text-[10px] font-mono text-center mt-2 opacity-60">note_01.jpg</p>
                </div>
              </Reveal>

              <Reveal delay={0.5}>
                <div
                  className="absolute top-28 right-0 w-[240px] p-3 bg-white shadow-[0_24px_48px_-16px_rgba(0,0,0,0.3)] rotate-[4deg]"
                  style={{ border: '1px solid rgba(0,0,0,0.05)' }}
                >
                  <div className="relative w-full aspect-[3/4] overflow-hidden">
                    <Image
                      src="/lp/instagram/vocab-circled-3.jpg"
                      alt="手書きノート"
                      fill
                      className="object-cover"
                    />
                  </div>
                  <p className="text-[10px] font-mono text-center mt-2 opacity-60">textbook_02.jpg</p>
                </div>
              </Reveal>

              <Reveal delay={0.7}>
                <div
                  className="absolute bottom-0 left-8 w-[200px] rounded-[1.8rem] overflow-hidden border-[8px] bg-black shadow-[0_24px_48px_-16px_rgba(0,0,0,0.4)]"
                  style={{ borderColor: INK }}
                >
                  <Image
                    src="/lp/quiz-new.png"
                    alt="MERKENクイズ画面"
                    width={375}
                    height={812}
                    className="w-full h-auto"
                    priority
                  />
                </div>
              </Reveal>

              <Reveal delay={0.9}>
                <div
                  className="absolute top-0 right-8 font-display font-black text-[120px] leading-none opacity-10 pointer-events-none"
                  style={{ color: INK }}
                >
                  撮
                </div>
              </Reveal>
            </div>
          </div>
        </motion.div>
      </section>

      {/* ━━━ Stats bar ━━━ */}
      <section className="border-y" style={{ borderColor: 'rgba(26,26,26,0.15)' }}>
        <div className="max-w-6xl mx-auto px-6 py-10 grid grid-cols-2 md:grid-cols-4 gap-6">
          {[
            { k: '撮る', v: '1枚', sub: 'から開始' },
            { k: '抽出', v: '4', sub: 'モード' },
            { k: '学習', v: '2', sub: 'モード' },
            { k: '料金', v: '¥0', sub: 'ではじめる' },
          ].map((item, i) => (
            <Reveal key={item.k} delay={i * 0.05}>
              <div className="flex flex-col">
                <span className="font-mono text-[10px] tracking-[0.3em] uppercase opacity-60">{item.k}</span>
                <span className="font-display text-4xl md:text-5xl font-black tracking-tight mt-1">{item.v}</span>
                <span className="text-xs opacity-60 mt-1">{item.sub}</span>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ━━━ Workflow (3 steps like chapters) ━━━ */}
      <section id="workflow" className="relative py-24 md:py-32">
        <div className="max-w-6xl mx-auto px-6">
          <Reveal>
            <div className="flex items-end justify-between mb-16 border-b pb-4" style={{ borderColor: INK }}>
              <div>
                <p className="font-mono text-xs tracking-[0.3em] uppercase opacity-60 mb-2">Chapter 01</p>
                <h2 className="font-display text-4xl md:text-6xl font-black tracking-tight">仕 組 み</h2>
              </div>
              <span className="font-mono text-sm opacity-60 hidden sm:block">p. 003</span>
            </div>
          </Reveal>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
            {[
              { no: 'I', title: '撮る', icon: 'photo_camera', desc: 'ノート・プリント・教科書をカメラで撮影。HEICも自動変換。' },
              { no: 'II', title: '確かめる', icon: 'checklist_rtl', desc: 'AIが抽出した単語と和訳を確認。編集・削除も自由自在。' },
              { no: 'III', title: '覚える', icon: 'menu_book', desc: 'クイズ・カード・例文で定着。SM-2が復習タイミングを自動計算。' },
            ].map((s, i) => (
              <Reveal key={s.no} delay={i * 0.1}>
                <div className="relative">
                  <div
                    className="font-display font-black text-[140px] leading-none opacity-[0.08] absolute -top-8 -left-2 pointer-events-none"
                    style={{ color: INK }}
                  >
                    {s.no}
                  </div>
                  <div className="relative pt-6">
                    <div
                      className="w-14 h-14 rounded-full flex items-center justify-center mb-5"
                      style={{ backgroundColor: INK, color: PAPER }}
                    >
                      <Icon name={s.icon} size={24} />
                    </div>
                    <h3 className="font-display text-2xl font-bold mb-3">{s.title}</h3>
                    <p className="text-sm leading-relaxed opacity-80">{s.desc}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ━━━ Scan modes — editorial feature ━━━ */}
      <section
        id="modes"
        className="relative py-24 md:py-32 border-y"
        style={{ backgroundColor: '#f3ecdc', borderColor: 'rgba(26,26,26,0.15)' }}
      >
        <RuledPaper className="opacity-[0.2]" />
        <div className="relative max-w-6xl mx-auto px-6">
          <Reveal>
            <div className="flex items-end justify-between mb-16 border-b pb-4" style={{ borderColor: INK }}>
              <div>
                <p className="font-mono text-xs tracking-[0.3em] uppercase opacity-60 mb-2">Chapter 02</p>
                <h2 className="font-display text-4xl md:text-6xl font-black tracking-tight">抽 出 の 型</h2>
              </div>
              <span className="font-mono text-sm opacity-60 hidden sm:block">p. 007</span>
            </div>
          </Reveal>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
            {/* Photo side */}
            <Reveal className="lg:col-span-5">
              <div className="relative">
                <div
                  className="relative overflow-hidden bg-white shadow-[0_30px_60px_-20px_rgba(0,0,0,0.25)] p-2 rotate-[-1.5deg]"
                  style={{ border: '1px solid rgba(0,0,0,0.08)' }}
                >
                  <Image
                    src="/lp/instagram/vocab-circled-4.jpg"
                    alt="丸囲みされた英単語"
                    width={600}
                    height={800}
                    className="w-full h-auto"
                  />
                  <div
                    className="absolute top-6 right-6 rotate-[8deg]"
                    aria-hidden
                  >
                    <Stamp label="CIRCLED" />
                  </div>
                </div>
                <p className="mt-4 font-mono text-xs opacity-60 text-center">
                  ⟶ 教科書にペンで丸をつけて、撮るだけ。
                </p>
              </div>
            </Reveal>

            {/* Modes list */}
            <div className="lg:col-span-7">
              <Reveal delay={0.1}>
                <p className="text-base leading-relaxed mb-10 max-w-xl">
                  学習スタイルも教材も人それぞれ。MERKENは4種類の
                  <strong>AIビジョン・モード</strong>
                  を用意し、あなたの取り込み方にフィットします。
                </p>
              </Reveal>

              <ul className="divide-y" style={{ borderColor: INK }}>
                <li className="border-t" style={{ borderColor: INK }} />
                {scanModes.map((m, i) => (
                  <Reveal key={m.no} delay={i * 0.08}>
                    <li className="py-6 grid grid-cols-12 gap-4 items-baseline group">
                      <span className="col-span-2 font-mono text-sm opacity-60">{m.no}</span>
                      <div className="col-span-8">
                        <div className="flex items-baseline gap-3 flex-wrap">
                          <h4 className="font-display text-2xl font-bold">{m.jp}</h4>
                          <span className="font-mono text-[10px] tracking-[0.3em] opacity-60">{m.en}</span>
                          {m.featured && <Stamp label="★ 推し" />}
                        </div>
                        <p className="text-sm opacity-75 mt-1">{m.desc}</p>
                      </div>
                      <span className="col-span-2 text-right font-mono text-xs opacity-60 group-hover:opacity-100 transition">
                        ⟶
                      </span>
                    </li>
                  </Reveal>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ━━━ Study modes — 4 kanji cards ━━━ */}
      <section id="study" className="relative py-24 md:py-32">
        <div className="max-w-6xl mx-auto px-6">
          <Reveal>
            <div className="flex items-end justify-between mb-16 border-b pb-4" style={{ borderColor: INK }}>
              <div>
                <p className="font-mono text-xs tracking-[0.3em] uppercase opacity-60 mb-2">Chapter 03</p>
                <h2 className="font-display text-4xl md:text-6xl font-black tracking-tight">学 ぶ 方 法</h2>
              </div>
              <span className="font-mono text-sm opacity-60 hidden sm:block">p. 013</span>
            </div>
          </Reveal>

          <Reveal>
            <p className="text-base md:text-lg max-w-2xl leading-relaxed mb-14 opacity-85">
              がむしゃらに繰り返すのではなく、<strong>科学的に、効率よく</strong>。
              SM-2アルゴリズムがあなたの記憶度を分析し、忘れかける最適なタイミングで復習を提示します。
            </p>
          </Reveal>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
            {studyModes.map((m, i) => (
              <Reveal key={m.kanji} delay={i * 0.08}>
                <div
                  className="aspect-[3/4] p-6 flex flex-col justify-between relative overflow-hidden transition-transform hover:-translate-y-1"
                  style={{
                    backgroundColor: PAPER,
                    border: `1px solid ${INK}`,
                    boxShadow: '4px 4px 0 ' + INK,
                  }}
                >
                  <div
                    className="font-display font-black leading-none"
                    style={{ fontSize: 'clamp(4rem, 10vw, 7rem)', color: INK }}
                  >
                    {m.kanji}
                  </div>
                  <div>
                    <h4 className="font-display text-lg font-bold mb-1">{m.jp}</h4>
                    <p className="text-xs opacity-70 leading-relaxed">{m.desc}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ━━━ Big pull-quote ━━━ */}
      <section className="relative py-24 border-y" style={{ backgroundColor: INK, color: PAPER, borderColor: INK }}>
        <div className="max-w-5xl mx-auto px-6 text-center">
          <Reveal>
            <p className="font-mono text-xs tracking-[0.3em] opacity-60 mb-6">— EDITOR&apos;S NOTE —</p>
          </Reveal>
          <Reveal delay={0.1}>
            <p
              className="font-display font-black leading-[1.05] tracking-tight"
              style={{ fontSize: 'clamp(2rem, 5vw, 3.75rem)' }}
            >
              「 手 で 書 く 」 は 、<br />
              「 手 で 入 力 す る 」 と <br />
              <span style={{ color: STAMP }}>違 う 。</span>
            </p>
          </Reveal>
          <Reveal delay={0.3}>
            <p className="mt-10 text-sm opacity-70 max-w-xl mx-auto leading-relaxed">
              紙とペンで学ぶ良さを残したまま、デジタルの効率を足しました。<br />
              ノートの上の単語を、スマホの中でそのまま育てられます。
            </p>
          </Reveal>
        </div>
      </section>

      {/* ━━━ Pricing ━━━ */}
      <section id="pricing" className="relative py-24 md:py-32">
        <div className="max-w-5xl mx-auto px-6">
          <Reveal>
            <div className="flex items-end justify-between mb-16 border-b pb-4" style={{ borderColor: INK }}>
              <div>
                <p className="font-mono text-xs tracking-[0.3em] uppercase opacity-60 mb-2">Chapter 04</p>
                <h2 className="font-display text-4xl md:text-6xl font-black tracking-tight">料 金</h2>
              </div>
              <span className="font-mono text-sm opacity-60 hidden sm:block">p. 021</span>
            </div>
          </Reveal>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Free */}
            <Reveal>
              <div
                className="p-10 h-full flex flex-col"
                style={{
                  backgroundColor: PAPER,
                  border: `1px solid ${INK}`,
                }}
              >
                <div className="flex items-baseline justify-between mb-6">
                  <h3 className="font-display text-2xl font-bold">Free</h3>
                  <span className="font-mono text-xs opacity-60">ずっと無料</span>
                </div>
                <div className="mb-8">
                  <span className="font-display text-6xl font-black tracking-tighter">¥0</span>
                </div>
                <ul className="space-y-3 flex-grow text-sm">
                  {['1日3回までスキャン', '100単語まで保存', 'ローカル保存', '基本クイズモード'].map(
                    (item) => (
                      <li key={item} className="flex items-center gap-3">
                        <span
                          className="w-5 h-5 flex items-center justify-center border"
                          style={{ borderColor: INK }}
                        >
                          <Icon name="check" size={14} />
                        </span>
                        {item}
                      </li>
                    )
                  )}
                  <li className="flex items-center gap-3 opacity-40">
                    <span
                      className="w-5 h-5 flex items-center justify-center border"
                      style={{ borderColor: INK }}
                    >
                      <Icon name="close" size={14} />
                    </span>
                    クラウド同期 / 複数デバイス
                  </li>
                </ul>
                <div className="mt-8">
                  <StatusAwareCta
                    guestLabel="無料で始める"
                    authLabel="ダッシュボードへ"
                    variant="secondary"
                    size="md"
                    className="w-full justify-center"
                  />
                </div>
              </div>
            </Reveal>

            {/* Pro */}
            <Reveal delay={0.1}>
              <div
                className="p-10 h-full flex flex-col relative"
                style={{
                  backgroundColor: INK,
                  color: PAPER,
                  border: `1px solid ${INK}`,
                  boxShadow: '8px 8px 0 ' + STAMP,
                }}
              >
                <div
                  className="absolute -top-3 left-6 px-3 py-1 font-mono text-[10px] tracking-[0.3em]"
                  style={{ backgroundColor: STAMP, color: PAPER }}
                >
                  MOST POPULAR
                </div>
                <div className="flex items-baseline justify-between mb-6">
                  <h3 className="font-display text-2xl font-bold">Pro</h3>
                  <span className="font-mono text-xs opacity-60">いつでも解約可</span>
                </div>
                <div className="mb-8 flex items-end gap-1">
                  <span className="font-display text-6xl font-black tracking-tighter">¥300</span>
                  <span className="text-sm opacity-70 mb-2">/ 月</span>
                </div>
                <ul className="space-y-3 flex-grow text-sm">
                  {[
                    'スキャン無制限',
                    '単語登録数 無制限',
                    'クラウド同期・マルチデバイス',
                    '全学習モード解放',
                    '全4つのスキャンモード',
                    'AIセマンティック検索',
                  ].map((item) => (
                    <li key={item} className="flex items-center gap-3">
                      <span
                        className="w-5 h-5 flex items-center justify-center"
                        style={{ backgroundColor: STAMP, color: PAPER }}
                      >
                        <Icon name="check" size={14} />
                      </span>
                      {item}
                    </li>
                  ))}
                </ul>
                <div className="mt-8">
                  <StatusAwareCta
                    guestLabel="Proで始める"
                    authLabel="Proにアップグレード"
                    guestHref="/signup"
                    authHref="/settings"
                    size="md"
                    className="w-full justify-center"
                  />
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ━━━ Final CTA ━━━ */}
      <section className="relative py-24 md:py-32 border-t" style={{ borderColor: 'rgba(26,26,26,0.15)' }}>
        <div className="max-w-5xl mx-auto px-6 text-center">
          <Reveal>
            <p
              className="font-display font-black leading-[0.95] tracking-tight"
              style={{ fontSize: 'clamp(2.5rem, 7vw, 5rem)' }}
            >
              次 の ペ ー ジ は 、<br />
              <span style={{ color: STAMP }}>あ な た の 番 。</span>
            </p>
          </Reveal>
          <Reveal delay={0.15}>
            <p className="mt-8 text-base md:text-lg opacity-80 max-w-xl mx-auto">
              手書きのノートも、分厚い教科書も。写真を撮るだけで、AIがあなた専用の単語帳を組み立てます。
            </p>
          </Reveal>
          <Reveal delay={0.3}>
            <div className="mt-12 flex flex-col sm:flex-row items-center justify-center gap-4">
              <StatusAwareCta
                guestLabel="無料ではじめる"
                authLabel="ダッシュボードを開く"
                size="lg"
                icon="arrow_forward"
              />
              <Link
                href="/pricing"
                className="text-sm font-semibold underline underline-offset-4 decoration-dotted opacity-80 hover:opacity-100"
              >
                料金プランの詳細を見る
              </Link>
            </div>
          </Reveal>
          <Reveal delay={0.45}>
            <p className="mt-8 text-xs font-mono opacity-60 flex items-center justify-center gap-2">
              <Icon name="lock" size={12} />
              クレジットカード不要・1分で開始
            </p>
          </Reveal>
        </div>
      </section>

      {/* ━━━ Footer ━━━ */}
      <footer
        className="border-t"
        style={{ borderColor: 'rgba(26,26,26,0.15)', backgroundColor: PAPER }}
      >
        <div className="max-w-6xl mx-auto px-6 py-12">
          <div className="flex flex-col md:flex-row gap-10 md:items-end md:justify-between mb-10">
            <div>
              <div className="flex items-baseline gap-2 mb-4">
                <span className="font-display text-2xl font-black tracking-tight">MERKEN</span>
                <span className="text-[10px] font-mono tracking-[0.3em] opacity-60">メルケン</span>
              </div>
              <p className="text-sm max-w-sm opacity-80 leading-relaxed">
                手入力ゼロの英単語帳。写真を撮るだけで、AIが英単語を自動抽出。
                日本の英語学習者のために設計されたPWAです。
              </p>
            </div>
            <div className="grid grid-cols-2 gap-10 text-sm">
              <div>
                <h4 className="font-display font-bold mb-3">プロダクト</h4>
                <ul className="space-y-2 opacity-80">
                  <li><Link href="/features" className="hover:opacity-60">機能</Link></li>
                  <li><Link href="/pricing" className="hover:opacity-60">料金</Link></li>
                  <li><Link href="/lp" className="hover:opacity-60">別バージョンLP</Link></li>
                </ul>
              </div>
              <div>
                <h4 className="font-display font-bold mb-3">会社情報</h4>
                <ul className="space-y-2 opacity-80">
                  <li><Link href="/terms" className="hover:opacity-60">利用規約</Link></li>
                  <li><Link href="/privacy" className="hover:opacity-60">プライバシー</Link></li>
                  <li><Link href="/tokusho" className="hover:opacity-60">特商法</Link></li>
                  <li><Link href="/contact" className="hover:opacity-60">お問い合わせ</Link></li>
                </ul>
              </div>
            </div>
          </div>

          <div
            className="pt-6 border-t flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 text-xs font-mono opacity-60"
            style={{ borderColor: 'rgba(26,26,26,0.15)' }}
          >
            <p>&copy; {new Date().getFullYear()} MERKEN — All rights reserved.</p>
            <p>Built for Japanese English learners.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
