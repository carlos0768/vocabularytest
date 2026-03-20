'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRef } from 'react';
import { motion, useScroll, useTransform, useInView } from 'framer-motion';
import { Icon } from '@/components/ui/Icon';
import { StatusAwareCta } from '@/components/marketing/StatusAwareCta';

/* ═══════════════════════════════════════════════════════════════
   MERKEN Landing Page
   Aesthetic: Japanese editorial precision × cinematic SaaS motion
   ═══════════════════════════════════════════════════════════════ */

/* ──── Reusable animation wrapper ──── */
function Reveal({
  children,
  delay = 0,
  className = '',
  y = 60,
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
  y?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });
  return (
    <motion.div
      ref={ref}
      className={className}
      initial={{ opacity: 0, y }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.7, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

/* ──── Phone mockup ──── */
function Phone({
  src,
  alt,
  className = '',
  priority = false,
}: {
  src: string;
  alt: string;
  className?: string;
  priority?: boolean;
}) {
  return (
    <div className={`relative ${className}`}>
      <div className="rounded-[2.2rem] border-[5px] border-[#1a1a1a] bg-[#1a1a1a] shadow-2xl overflow-hidden">
        <div className="absolute top-[5px] left-1/2 -translate-x-1/2 w-[72px] h-[18px] bg-[#1a1a1a] rounded-b-xl z-10" />
        <Image
          src={src}
          alt={alt}
          width={375}
          height={812}
          className="w-full h-auto rounded-[1.8rem]"
          priority={priority}
        />
      </div>
    </div>
  );
}

/* ──── Floating badge ──── */
function FloatingBadge({
  icon,
  label,
  color,
  className = '',
}: {
  icon: string;
  label: string;
  color: string;
  className?: string;
}) {
  return (
    <motion.div
      className={`absolute flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-white/95 dark:bg-[#1e242b]/95 shadow-lg backdrop-blur-sm border border-white/20 ${className}`}
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: 1.2, duration: 0.5, ease: 'easeOut' }}
    >
      <div
        className="w-8 h-8 rounded-lg flex items-center justify-center"
        style={{ backgroundColor: color + '20', color }}
      >
        <Icon name={icon} size={18} />
      </div>
      <span className="text-sm font-semibold text-[var(--color-foreground)] whitespace-nowrap">{label}</span>
    </motion.div>
  );
}

/* ──── Number counter ──── */
function Counter({ value, suffix = '' }: { value: string; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  return (
    <motion.span
      ref={ref}
      className="tabular-nums"
      initial={{ opacity: 0 }}
      animate={inView ? { opacity: 1 } : {}}
      transition={{ duration: 0.4 }}
    >
      {value}{suffix}
    </motion.span>
  );
}

/* ──── Scan mode data ──── */
const scanModes = [
  { icon: 'center_focus_weak', title: 'すべての単語を抽出', color: '#137fec' },
  { icon: 'radio_button_checked', title: '丸で囲んだ単語', color: '#8b5cf6' },
  { icon: 'highlight', title: 'ハイライト単語', color: '#f59e0b' },
  { icon: 'menu_book', title: '英検レベルでフィルター', color: '#22c55e' },
  { icon: 'translate', title: '熟語・イディオム', color: '#ec4899' },
  { icon: 'warning', title: '間違えた単語', color: '#ef4444' },
];

/* ──── Study mode data ──── */
const studyModes = [
  { icon: 'quiz', title: '4択クイズ', desc: '意味を確認しながらテンポよく学習', image: '/lp/quiz.png' },
  { icon: 'psychology', title: '自己評価', desc: '自己想起してAgain/Hard/Good/Easyで評価', image: '/lp/word-detail.png' },
  { icon: 'style', title: 'フラッシュカード', desc: '3Dフリップでスムーズな暗記', image: '/lp/wordlist.png' },
  { icon: 'chat', title: '例文クイズ', desc: '文脈から単語の使い方を定着', image: '/lp/quiz.png' },
];

/* ──── Stats data ──── */
const stats = [
  { value: '6', label: 'スキャンモード', icon: 'document_scanner' },
  { value: '4', label: '学習モード', icon: 'school' },
  { value: '¥500', label: 'Pro月額', icon: 'payments' },
  { value: '¥0', label: 'で始められる', icon: 'rocket_launch' },
];

/* ═══════════════════════════════════════════════════════════════
   Page
   ═══════════════════════════════════════════════════════════════ */
export default function LandingPage() {
  const heroRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: heroRef,
    offset: ['start start', 'end start'],
  });
  const heroY = useTransform(scrollYProgress, [0, 1], [0, 200]);
  const heroOpacity = useTransform(scrollYProgress, [0, 0.6], [1, 0]);

  return (
    <div className="min-h-screen bg-[var(--color-background)] overflow-x-hidden">
      {/* ━━━ Navigation ━━━ */}
      <motion.nav
        className="fixed top-0 left-0 right-0 z-50 header-film border-b border-white/10"
        initial={{ y: -80 }}
        animate={{ y: 0 }}
        transition={{ delay: 0.2, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="max-w-7xl mx-auto px-5 md:px-8 h-16 flex items-center justify-between">
          <Link href="/lp" className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-full bg-[#137fec] flex items-center justify-center text-white">
              <Icon name="school" size={18} />
            </div>
            <span className="font-display text-lg font-extrabold text-[var(--color-foreground)] tracking-tight">
              MERKEN
            </span>
          </Link>

          <div className="hidden md:flex items-center gap-1">
            <Link href="/features" className="px-4 py-2 text-sm font-medium text-[var(--color-muted)] hover:text-[var(--color-foreground)] transition-colors rounded-full hover:bg-black/5 dark:hover:bg-white/5">
              機能
            </Link>
            <Link href="/pricing" className="px-4 py-2 text-sm font-medium text-[var(--color-muted)] hover:text-[var(--color-foreground)] transition-colors rounded-full hover:bg-black/5 dark:hover:bg-white/5">
              料金
            </Link>
            <Link href="/login" className="px-4 py-2 text-sm font-medium text-[var(--color-muted)] hover:text-[var(--color-foreground)] transition-colors rounded-full hover:bg-black/5 dark:hover:bg-white/5">
              ログイン
            </Link>
          </div>

          <StatusAwareCta
            guestLabel="無料で始める"
            authLabel="開く"
            size="sm"
            className="text-sm"
          />
        </div>
      </motion.nav>

      {/* ━━━ Hero ━━━ */}
      <section ref={heroRef} className="relative min-h-[100dvh] flex items-center pt-16 overflow-hidden">
        {/* Background gradient orbs */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-[40%] -right-[20%] w-[80vw] h-[80vw] rounded-full bg-[#137fec]/[0.07] blur-[120px]" />
          <div className="absolute -bottom-[30%] -left-[10%] w-[60vw] h-[60vw] rounded-full bg-[#8b5cf6]/[0.05] blur-[100px]" />
        </div>

        <motion.div style={{ y: heroY, opacity: heroOpacity }} className="w-full">
          <div className="max-w-7xl mx-auto px-5 md:px-8 py-12 md:py-0">
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-12 lg:gap-16 items-center">
              {/* Text */}
              <div className="max-w-2xl">
                <motion.div
                  className="flex flex-wrap gap-2 mb-6"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5, duration: 0.6 }}
                >
                  <span className="chip bg-[#137fec]/10 text-[#137fec] text-xs border border-[#137fec]/20">
                    <Icon name="bolt" size={14} />
                    手入力ゼロ
                  </span>
                  <span className="chip bg-[#22c55e]/10 text-[#22c55e] text-xs border border-[#22c55e]/20">
                    <Icon name="auto_awesome" size={14} />
                    AI搭載
                  </span>
                  <span className="chip bg-[#8b5cf6]/10 text-[#8b5cf6] text-xs border border-[#8b5cf6]/20">
                    <Icon name="devices" size={14} />
                    マルチデバイス
                  </span>
                </motion.div>

                <motion.h1
                  className="font-display text-[clamp(2.25rem,6vw,4.5rem)] font-extrabold leading-[1.08] tracking-tight text-[var(--color-foreground)]"
                  initial={{ opacity: 0, y: 40 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                >
                  撮るだけで、
                  <br />
                  <span className="relative">
                    <span className="relative z-10">自分だけの単語帳</span>
                    <motion.span
                      className="absolute bottom-1 left-0 right-0 h-[0.18em] bg-[#137fec]/30 rounded-full -z-0"
                      initial={{ scaleX: 0 }}
                      animate={{ scaleX: 1 }}
                      transition={{ delay: 1.1, duration: 0.6, ease: 'easeOut' }}
                      style={{ transformOrigin: 'left' }}
                    />
                  </span>
                </motion.h1>

                <motion.p
                  className="mt-6 text-lg md:text-xl text-[var(--color-muted)] leading-relaxed max-w-lg"
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.6, duration: 0.7 }}
                >
                  ノートやプリントを撮影するだけで、AIが英単語を自動抽出。
                  6つのスキャンモードと4つの学習モードで、
                  作成から定着までを一気通貫。
                </motion.p>

                <motion.div
                  className="mt-8 flex flex-wrap gap-4 items-center"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.8, duration: 0.6 }}
                >
                  <StatusAwareCta
                    guestLabel="無料で始める"
                    authLabel="ダッシュボードを開く"
                    size="lg"
                    icon="arrow_forward"
                  />
                  <Link
                    href="/features"
                    className="group flex items-center gap-2 text-sm font-semibold text-[var(--color-muted)] hover:text-[var(--color-foreground)] transition-colors"
                  >
                    機能を見る
                    <Icon name="arrow_forward" size={16} className="group-hover:translate-x-1 transition-transform" />
                  </Link>
                </motion.div>

                <motion.p
                  className="mt-4 text-xs text-[var(--color-muted)] flex items-center gap-1.5"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 1, duration: 0.5 }}
                >
                  <Icon name="check_circle" size={14} className="text-[#22c55e]" />
                  クレジットカード不要 ・ 1分で開始
                </motion.p>
              </div>

              {/* Hero phone */}
              <motion.div
                className="relative w-[260px] md:w-[300px] mx-auto lg:mx-0"
                initial={{ opacity: 0, y: 80, rotateY: -8 }}
                animate={{ opacity: 1, y: 0, rotateY: 0 }}
                transition={{ delay: 0.6, duration: 1, ease: [0.22, 1, 0.36, 1] }}
              >
                <Phone src="/lp/home.png" alt="MERKENホーム画面" priority className="w-full" />
                <FloatingBadge
                  icon="auto_awesome"
                  label="AI自動抽出"
                  color="#137fec"
                  className="-left-12 top-[20%] hidden md:flex"
                />
                <FloatingBadge
                  icon="school"
                  label="SM-2 反復学習"
                  color="#22c55e"
                  className="-right-8 bottom-[28%] hidden md:flex"
                />
              </motion.div>
            </div>
          </div>
        </motion.div>

        {/* Scroll indicator */}
        <motion.div
          className="absolute bottom-8 left-1/2 -translate-x-1/2"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.5, duration: 0.5 }}
        >
          <motion.div
            className="w-6 h-10 rounded-full border-2 border-[var(--color-muted)]/30 flex justify-center pt-2"
            animate={{ y: [0, 6, 0] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
          >
            <div className="w-1 h-2.5 rounded-full bg-[var(--color-muted)]/40" />
          </motion.div>
        </motion.div>
      </section>

      {/* ━━━ Stats ribbon ━━━ */}
      <section className="relative z-10 border-y border-[var(--color-border)]">
        <div className="max-w-7xl mx-auto px-5 md:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-[var(--color-border)]">
            {stats.map((stat, i) => (
              <Reveal key={stat.label} delay={i * 0.1} y={30} className="py-8 md:py-10 text-center">
                <div className="flex items-center justify-center gap-2 mb-2">
                  <Icon name={stat.icon} size={20} className="text-[#137fec]" />
                </div>
                <p className="text-3xl md:text-4xl font-display font-extrabold text-[var(--color-foreground)]">
                  <Counter value={stat.value} />
                </p>
                <p className="text-sm text-[var(--color-muted)] mt-1">{stat.label}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ━━━ How it works ━━━ */}
      <section className="py-24 md:py-32">
        <div className="max-w-7xl mx-auto px-5 md:px-8">
          <Reveal>
            <p className="text-sm font-semibold tracking-widest uppercase text-[#137fec] mb-3">How It Works</p>
            <h2 className="font-display text-3xl md:text-5xl font-extrabold text-[var(--color-foreground)] leading-tight">
              3ステップで、
              <br className="hidden sm:block" />
              すぐに始められる
            </h2>
          </Reveal>

          <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-8 relative">
            {/* Connector line */}
            <div className="hidden md:block absolute top-[3.5rem] left-[16.7%] right-[16.7%] h-px bg-gradient-to-r from-transparent via-[var(--color-border)] to-transparent" />

            {[
              {
                step: '01',
                title: '撮影する',
                desc: 'ノート・プリント・教科書をカメラで撮影。HEICも自動変換。',
                icon: 'photo_camera',
                image: '/lp/scan-modes.png',
              },
              {
                step: '02',
                title: '確認する',
                desc: 'AIが抽出した英単語と和訳を確認。編集・削除も自由自在。',
                icon: 'edit_note',
                image: '/lp/wordlist.png',
              },
              {
                step: '03',
                title: '学習する',
                desc: 'クイズ・カード・例文で繰り返し学習。SM-2で最適タイミングで復習。',
                icon: 'school',
                image: '/lp/quiz.png',
              },
            ].map((item, i) => (
              <Reveal key={item.step} delay={i * 0.15} className="relative">
                <div className="text-center mb-6">
                  <div className="w-[4.5rem] h-[4.5rem] rounded-2xl bg-[#137fec] text-white flex items-center justify-center mx-auto shadow-glow">
                    <span className="text-2xl font-display font-extrabold">{item.step}</span>
                  </div>
                </div>

                <div className="card overflow-hidden group hover:shadow-xl transition-shadow duration-300">
                  <div className="relative h-[320px] overflow-hidden bg-gradient-to-b from-[var(--color-primary-light)] to-transparent">
                    <Image
                      src={item.image}
                      alt={item.title}
                      fill
                      className="object-cover object-top group-hover:scale-[1.03] transition-transform duration-500"
                    />
                  </div>
                  <div className="p-6">
                    <div className="flex items-center gap-2 mb-2">
                      <Icon name={item.icon} size={20} className="text-[#137fec]" />
                      <h3 className="font-display text-xl font-bold text-[var(--color-foreground)]">{item.title}</h3>
                    </div>
                    <p className="text-sm text-[var(--color-muted)] leading-relaxed">{item.desc}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ━━━ 6 Scan Modes ━━━ */}
      <section className="py-24 md:py-32 bg-gradient-to-b from-[var(--color-background)] via-[var(--color-primary-light)]/30 to-[var(--color-background)]">
        <div className="max-w-7xl mx-auto px-5 md:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            <div>
              <Reveal>
                <p className="text-sm font-semibold tracking-widest uppercase text-[#137fec] mb-3">Scan Modes</p>
                <h2 className="font-display text-3xl md:text-5xl font-extrabold text-[var(--color-foreground)] leading-tight">
                  目的に合わせた
                  <br />
                  6つの抽出モード
                </h2>
                <p className="mt-4 text-[var(--color-muted)] leading-relaxed max-w-lg text-base md:text-lg">
                  ノートのすべてを取り込むことも、丸をつけた単語だけをピンポイントで抽出することも。
                  英検レベルや熟語にも対応した、MERKENならではの機能です。
                </p>
              </Reveal>

              <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 gap-3">
                {scanModes.map((mode, i) => (
                  <Reveal key={mode.title} delay={i * 0.08} y={30}>
                    <div className="group flex items-center gap-3 p-4 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] hover:border-transparent hover:shadow-lg transition-all duration-300 cursor-default">
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-transform duration-300 group-hover:scale-110"
                        style={{ backgroundColor: mode.color + '15', color: mode.color }}
                      >
                        <Icon name={mode.icon} size={20} />
                      </div>
                      <span className="text-sm font-semibold text-[var(--color-foreground)]">{mode.title}</span>
                    </div>
                  </Reveal>
                ))}
              </div>
            </div>

            <Reveal delay={0.3} className="flex justify-center">
              <div className="relative">
                <Phone src="/lp/scan-modes-2.png" alt="スキャンモード選択" className="w-[260px] md:w-[280px]" />
                {/* Decorative glow behind phone */}
                <div className="absolute inset-0 -z-10 bg-[#137fec]/10 blur-[80px] rounded-full scale-75" />
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ━━━ Study Modes — horizontal scroll showcase ━━━ */}
      <section className="py-24 md:py-32">
        <div className="max-w-7xl mx-auto px-5 md:px-8">
          <Reveal>
            <p className="text-sm font-semibold tracking-widest uppercase text-[#137fec] mb-3">Study Modes</p>
            <h2 className="font-display text-3xl md:text-5xl font-extrabold text-[var(--color-foreground)] leading-tight">
              4つの学習モードで
              <br className="hidden sm:block" />
              定着を最大化
            </h2>
            <p className="mt-4 text-[var(--color-muted)] leading-relaxed max-w-lg text-base md:text-lg">
              気分や目的に合わせて、最適な方法で学習。
              SM-2アルゴリズムが最適な復習タイミングを自動計算します。
            </p>
          </Reveal>

          <div className="mt-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {studyModes.map((mode, i) => (
              <Reveal key={mode.title} delay={i * 0.12}>
                <div className="group card overflow-hidden h-full hover:shadow-xl transition-all duration-300">
                  <div className="relative h-[200px] overflow-hidden bg-gradient-to-b from-[var(--color-primary-light)]/50 to-transparent">
                    <Image
                      src={mode.image}
                      alt={mode.title}
                      fill
                      className="object-cover object-top group-hover:scale-105 transition-transform duration-500"
                    />
                  </div>
                  <div className="p-5">
                    <div className="w-10 h-10 rounded-xl bg-[#137fec]/10 flex items-center justify-center mb-3">
                      <Icon name={mode.icon} size={20} className="text-[#137fec]" />
                    </div>
                    <h3 className="font-display text-lg font-bold text-[var(--color-foreground)]">{mode.title}</h3>
                    <p className="text-sm text-[var(--color-muted)] mt-1.5 leading-relaxed">{mode.desc}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ━━━ Feature showcase — Progress tracking ━━━ */}
      <section className="py-24 md:py-32 relative overflow-hidden">
        {/* Background decoration */}
        <div className="absolute top-0 right-0 w-[50vw] h-[50vw] rounded-full bg-[#22c55e]/[0.04] blur-[100px] pointer-events-none" />

        <div className="max-w-7xl mx-auto px-5 md:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            <Reveal delay={0.2} className="order-2 lg:order-1 flex justify-center">
              <div className="relative">
                <Phone src="/lp/stats.png" alt="学習統計" className="w-[260px] md:w-[280px]" />
                <div className="absolute inset-0 -z-10 bg-[#22c55e]/10 blur-[80px] rounded-full scale-75" />
              </div>
            </Reveal>

            <div className="order-1 lg:order-2">
              <Reveal>
                <p className="text-sm font-semibold tracking-widest uppercase text-[#22c55e] mb-3">Progress Tracking</p>
                <h2 className="font-display text-3xl md:text-5xl font-extrabold text-[var(--color-foreground)] leading-tight">
                  学習の進捗が
                  <br />
                  ひと目でわかる
                </h2>
                <p className="mt-4 text-[var(--color-muted)] leading-relaxed max-w-lg text-base md:text-lg">
                  毎日の学習をデータで振り返り。正答率、習得数、連続学習日数をリアルタイムで可視化します。
                </p>
              </Reveal>

              <div className="mt-8 space-y-4">
                {[
                  { icon: 'check_circle', text: '習得済み・復習中・未学習を自動で分類', color: '#22c55e' },
                  { icon: 'bar_chart', text: '今日の学習量と正答率をリアルタイム表示', color: '#137fec' },
                  { icon: 'local_fire_department', text: '連続学習日数でモチベーション維持', color: '#f59e0b' },
                  { icon: 'star', text: '苦手な単語をお気に入り登録して重点復習', color: '#ec4899' },
                ].map((item, i) => (
                  <Reveal key={item.text} delay={0.1 + i * 0.1} y={20}>
                    <div className="flex items-start gap-4 p-4 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)]">
                      <div
                        className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                        style={{ backgroundColor: item.color + '15', color: item.color }}
                      >
                        <Icon name={item.icon} size={18} />
                      </div>
                      <span className="text-sm font-medium text-[var(--color-foreground)] pt-1.5 leading-relaxed">{item.text}</span>
                    </div>
                  </Reveal>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ━━━ App showcase ━━━ */}
      <section className="py-24 md:py-32 bg-gradient-to-b from-[var(--color-background)] to-[var(--color-primary-light)]/20">
        <div className="max-w-7xl mx-auto px-5 md:px-8">
          <Reveal className="text-center max-w-2xl mx-auto mb-16">
            <p className="text-sm font-semibold tracking-widest uppercase text-[#137fec] mb-3">App Overview</p>
            <h2 className="font-display text-3xl md:text-5xl font-extrabold text-[var(--color-foreground)] leading-tight">
              あらゆる場面で使える
            </h2>
          </Reveal>

          <div className="flex gap-6 md:gap-8 justify-center flex-wrap">
            {[
              { src: '/lp/home.png', label: 'ホーム' },
              { src: '/lp/projects.png', label: '単語帳' },
              { src: '/lp/quiz.png', label: 'クイズ' },
              { src: '/lp/bookshelf.png', label: '本棚' },
              { src: '/lp/stats.png', label: '統計' },
            ].map((screen, i) => (
              <Reveal key={screen.label} delay={i * 0.1}>
                <div className="text-center group">
                  <Phone
                    src={screen.src}
                    alt={screen.label}
                    className="w-[160px] md:w-[180px] group-hover:scale-[1.03] transition-transform duration-300"
                  />
                  <p className="mt-4 text-sm font-semibold text-[var(--color-muted)]">{screen.label}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ━━━ Pricing ━━━ */}
      <section className="py-24 md:py-32">
        <div className="max-w-4xl mx-auto px-5 md:px-8">
          <Reveal className="text-center mb-12">
            <p className="text-sm font-semibold tracking-widest uppercase text-[#137fec] mb-3">Pricing</p>
            <h2 className="font-display text-3xl md:text-5xl font-extrabold text-[var(--color-foreground)] leading-tight">
              シンプルな料金プラン
            </h2>
            <p className="mt-4 text-[var(--color-muted)] text-base md:text-lg max-w-lg mx-auto">
              まずは無料で始めて、もっと使いたくなったらProへ。
            </p>
          </Reveal>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {/* Free */}
            <Reveal>
              <div className="card p-8 h-full">
                <p className="text-sm font-semibold text-[var(--color-muted)] uppercase tracking-wide">Free</p>
                <p className="mt-4 text-5xl font-display font-extrabold text-[var(--color-foreground)]">
                  ¥0
                </p>
                <p className="text-sm text-[var(--color-muted)] mt-1">ずっと無料</p>
                <hr className="my-6 border-[var(--color-border)]" />
                <ul className="space-y-3">
                  {[
                    '1日3回までスキャン',
                    '100単語まで保存',
                    'ローカル保存',
                    '基本クイズモード',
                  ].map((item) => (
                    <li key={item} className="flex items-center gap-3 text-sm text-[var(--color-foreground)]">
                      <Icon name="check_circle" size={18} className="text-[#22c55e] shrink-0" />
                      {item}
                    </li>
                  ))}
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
            <Reveal delay={0.15}>
              <div className="card p-8 h-full ring-2 ring-[#137fec]/30 relative overflow-hidden">
                {/* Popular badge */}
                <div className="absolute top-5 right-5">
                  <span className="chip chip-pro text-[11px] px-3 py-1">
                    <Icon name="auto_awesome" size={12} />
                    おすすめ
                  </span>
                </div>

                <p className="text-sm font-semibold text-[#137fec] uppercase tracking-wide">Pro</p>
                <p className="mt-4 text-5xl font-display font-extrabold text-[var(--color-foreground)]">
                  ¥500
                  <span className="text-lg font-normal text-[var(--color-muted)]">/月</span>
                </p>
                <p className="text-sm text-[var(--color-muted)] mt-1">いつでも解約OK</p>
                <hr className="my-6 border-[var(--color-border)]" />
                <ul className="space-y-3">
                  {[
                    'スキャン無制限',
                    '単語数無制限',
                    'クラウド同期・マルチデバイス',
                    '全学習モード利用可能',
                    '6つのスキャンモード',
                    'セマンティック検索',
                  ].map((item) => (
                    <li key={item} className="flex items-center gap-3 text-sm text-[var(--color-foreground)]">
                      <Icon name="check_circle" size={18} className="text-[#137fec] shrink-0" />
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
      <section className="py-24 md:py-32">
        <div className="max-w-4xl mx-auto px-5 md:px-8">
          <Reveal>
            <div className="relative rounded-[2rem] overflow-hidden">
              {/* Gradient background */}
              <div className="absolute inset-0 bg-gradient-to-br from-[#137fec] via-[#0d6ecc] to-[#0a4a8c]" />
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.15),transparent_60%)]" />

              <div className="relative px-8 py-16 md:px-16 md:py-24 text-center">
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.6 }}
                >
                  <h2 className="font-display text-3xl md:text-5xl font-extrabold text-white leading-tight">
                    今日から始めて、
                    <br />
                    合格に近づこう
                  </h2>
                  <p className="mt-4 text-white/75 text-base md:text-lg max-w-md mx-auto leading-relaxed">
                    ノートを撮るだけで、自分だけの単語帳が完成。
                    無料で今すぐ始められます。
                  </p>
                  <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
                    <StatusAwareCta
                      guestLabel="無料で始める"
                      authLabel="ダッシュボードを開く"
                      variant="secondary"
                      size="lg"
                    />
                  </div>
                  <p className="mt-4 text-xs text-white/50 flex items-center justify-center gap-1.5">
                    <Icon name="lock" size={12} />
                    クレジットカード不要
                  </p>
                </motion.div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ━━━ Footer ━━━ */}
      <footer className="border-t border-[var(--color-border)]">
        <div className="max-w-7xl mx-auto px-5 md:px-8 py-12">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-8">
            <div>
              <Link href="/lp" className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-[#137fec] flex items-center justify-center text-white">
                  <Icon name="school" size={16} />
                </div>
                <span className="font-display text-base font-extrabold text-[var(--color-foreground)]">MERKEN</span>
              </Link>
              <p className="text-xs text-[var(--color-muted)] mt-2 max-w-xs leading-relaxed">
                手入力ゼロの英単語帳。AIが写真から英単語を自動抽出して、クイズやフラッシュカードで学習。
              </p>
            </div>

            <div className="flex flex-wrap gap-x-8 gap-y-3 text-sm">
              <Link href="/features" className="text-[var(--color-muted)] hover:text-[var(--color-foreground)] transition-colors">機能</Link>
              <Link href="/pricing" className="text-[var(--color-muted)] hover:text-[var(--color-foreground)] transition-colors">料金</Link>
              <Link href="/privacy" className="text-[var(--color-muted)] hover:text-[var(--color-foreground)] transition-colors">プライバシー</Link>
              <Link href="/terms" className="text-[var(--color-muted)] hover:text-[var(--color-foreground)] transition-colors">利用規約</Link>
              <Link href="/contact" className="text-[var(--color-muted)] hover:text-[var(--color-foreground)] transition-colors">お問い合わせ</Link>
            </div>
          </div>

          <div className="mt-8 pt-8 border-t border-[var(--color-border)] flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-xs text-[var(--color-muted)]">
              &copy; {new Date().getFullYear()} MERKEN. All rights reserved.
            </p>
            <p className="text-xs text-[var(--color-muted)]">
              Built for Japanese English learners
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
