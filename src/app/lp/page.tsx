'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRef, useState, useEffect } from 'react';
import { motion, useScroll, useTransform, useInView } from 'framer-motion';
import { Icon } from '@/components/ui/Icon';
import { StatusAwareCta } from '@/components/marketing/StatusAwareCta';

/* ═══════════════════════════════════════════════════════════════
   MERKEN Landing Page
   Aesthetic: Japanese editorial precision × cinematic SaaS motion
   ═══════════════════════════════════════════════════════════════ */

/* ──── Reusable reveal wrapper ──── */
function Reveal({
  children,
  delay = 0,
  className = '',
  y = 40,
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
      transition={{ duration: 0.8, delay, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  );
}

/* ──── Realistic phone mockup ──── */
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
      <div className="rounded-[2.8rem] border-[10px] border-[#1a1a1a] bg-[#1a1a1a] shadow-[inset_0_0_0_2px_#333,0_40px_60px_-15px_rgba(0,0,0,0.3),0_0_0_1px_rgba(0,0,0,0.1)] overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[120px] h-[28px] bg-[#1a1a1a] rounded-b-[18px] z-10" />
        <Image
          src={src}
          alt={alt}
          width={375}
          height={812}
          className="w-full h-auto"
          priority={priority}
        />
      </div>
    </div>
  );
}

/* ──── Floating badge (glass) ──── */
function FloatingBadge({
  icon,
  label,
  sublabel,
  color,
  className = '',
  delay = 1.2,
}: {
  icon: string;
  label: string;
  sublabel?: string;
  color: string;
  className?: string;
  delay?: number;
}) {
  return (
    <motion.div
      className={`absolute flex items-center gap-3 px-5 py-3 rounded-2xl bg-white/70 dark:bg-[#1e242b]/70 shadow-xl backdrop-blur-xl border border-white/50 ${className}`}
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay, duration: 0.5, ease: 'easeOut' }}
    >
      <div
        className="w-10 h-10 rounded-full flex items-center justify-center"
        style={{ backgroundColor: color + '15', color }}
      >
        <Icon name={icon} size={20} />
      </div>
      <div>
        {sublabel && (
          <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-muted)] mb-0.5">
            {sublabel}
          </p>
        )}
        <span className="text-sm font-bold text-[var(--color-foreground)] whitespace-nowrap">
          {label}
        </span>
      </div>
    </motion.div>
  );
}

/* ──── Polaroid photo card ──── */
function Polaroid({
  src,
  alt,
  caption,
  className = '',
  rotate = 0,
}: {
  src: string;
  alt: string;
  caption: string;
  className?: string;
  rotate?: number;
}) {
  return (
    <div
      className={`p-2 bg-white rounded-lg shadow-[0_20px_40px_-10px_rgba(0,0,0,0.3)] transition-transform duration-500 hover:rotate-0 hover:scale-105 ${className}`}
      style={{ transform: `rotate(${rotate}deg)` }}
    >
      <div className="relative w-full h-[240px] overflow-hidden rounded">
        <Image src={src} alt={alt} fill className="object-cover" />
      </div>
      <p className="text-xs text-gray-500 text-center mt-2 italic">{caption}</p>
    </div>
  );
}

/* ──── Section data ──── */
const scanModes = [
  { icon: 'document_scanner', title: 'すべての単語を抽出', desc: 'ページ全体の英単語を一括でリスト化。AIが難易度の高い単語を優先的に抽出。', color: '#137fec' },
  { icon: 'gesture', title: '丸で囲んだ単語', desc: '手書きの丸枠を認識し、その中の単語だけをピンポイントで抽出。', color: '#8b5cf6', featured: true },
  { icon: 'filter_alt', title: '英検レベルでフィルター', desc: '指定した級（5級〜1級）の単語のみを抽出。', color: '#22c55e' },
  { icon: 'link', title: '熟語・イディオム', desc: '複数語からなる慣用句をAIが文脈から判断し抽出。', color: '#ec4899' },
];

const studyFeatures = [
  { icon: 'event_repeat', title: '最適タイミングで復習', desc: '正解した単語は間隔を広げ、間違えた単語はすぐに再出題。無駄なく効率的に記憶を定着させます。', color: '#8b5cf6' },
  { icon: 'quiz', title: '4択クイズ', desc: 'AIが自動生成したダミー選択肢から正解を選択。テンポよく進めながら記憶度を自動で記録。', color: '#137fec' },
  { icon: 'style', title: 'フラッシュカード', desc: 'カードをめくってサクサク確認。英→日、日→英の切替自在でスワイプ操作で直感的に学習。', color: '#f59e0b' },
  { icon: 'trending_up', title: '学習ログの蓄積', desc: '毎日の学習量・正答率・連続日数を自動で記録。成長を振り返ってモチベーションを維持。', color: '#22c55e' },
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
  const heroOpacity = useTransform(scrollYProgress, [0, 0.85], [1, 0]);

  /* Video player state */
  const [videoPlaying, setVideoPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoPlaying && videoRef.current) {
      videoRef.current.play();
    }
  }, [videoPlaying]);

  return (
    <div className="min-h-screen bg-[var(--color-background)] overflow-x-hidden">
      {/* ━━━ Navigation ━━━ */}
      <motion.nav
        className="fixed top-0 left-0 right-0 z-50 bg-white/70 dark:bg-[#0B0F19]/60 backdrop-blur-xl border-b border-white/40 dark:border-white/10"
        initial={{ y: -80 }}
        animate={{ y: 0 }}
        transition={{ delay: 0.2, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <Link href="/lp" className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[#137fec] flex items-center justify-center text-white shadow-[0_0_40px_-10px_rgba(19,127,236,0.5)]">
              <Icon name="school" size={20} />
            </div>
            <span className="font-display text-xl font-bold tracking-tight text-[var(--color-foreground)]">
              MERKEN
            </span>
          </Link>

          <div className="hidden md:flex items-center gap-8">
            <Link href="/features" className="text-sm font-medium text-[var(--color-muted)] hover:text-[#137fec] transition-colors">
              機能
            </Link>
            <Link href="/pricing" className="text-sm font-medium text-[var(--color-muted)] hover:text-[#137fec] transition-colors">
              料金
            </Link>
            <Link href="/login" className="text-sm font-medium text-[var(--color-muted)] hover:text-[var(--color-foreground)] transition-colors">
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
      <section ref={heroRef} className="relative min-h-[90dvh] flex items-center pt-20 overflow-hidden">
        {/* Background mesh */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/4 left-0 w-[500px] h-[500px] bg-[#137fec]/20 blur-[120px] rounded-full -translate-x-1/2" />
          <div className="absolute bottom-0 right-0 w-[600px] h-[600px] bg-[#8b5cf6]/20 blur-[150px] rounded-full translate-x-1/3 translate-y-1/3" />
        </div>

        <motion.div style={{ y: heroY, opacity: heroOpacity }} className="w-full">
          <div className="max-w-7xl mx-auto px-6 py-12 md:py-0">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
              {/* Text */}
              <div>
                <motion.div
                  className="flex flex-wrap gap-3 mb-8"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5, duration: 0.6 }}
                >
                  {[
                    { label: '手入力ゼロ', icon: 'bolt' },
                    { label: 'AI搭載', icon: 'auto_awesome' },
                    { label: 'マルチデバイス', icon: 'devices' },
                  ].map((chip) => (
                    <span
                      key={chip.label}
                      className="px-4 py-1.5 rounded-full bg-white/70 dark:bg-white/10 backdrop-blur-xl text-xs font-bold text-[var(--color-foreground)] flex items-center gap-1.5 shadow-sm border border-white/50 dark:border-white/10"
                    >
                      <Icon name={chip.icon} size={14} />
                      {chip.label}
                    </span>
                  ))}
                </motion.div>

                <motion.h1
                  className="font-display text-[clamp(2.5rem,6vw,4rem)] font-bold leading-[1.1] tracking-tight text-[var(--color-foreground)]"
                  initial={{ opacity: 0, y: 40 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                >
                  撮るだけで、
                  <br />
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#137fec] to-[#8b5cf6]">
                    自分だけの単語帳
                  </span>
                </motion.h1>

                <motion.p
                  className="mt-6 text-lg md:text-xl text-[var(--color-muted)] leading-relaxed max-w-xl"
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.6, duration: 0.7 }}
                >
                  ノートやプリントを撮影するだけで、AIが英単語を自動抽出。
                  <br className="hidden sm:block" />
                  4つのスキャンモードと2つの学習モードで、作成から定着までを一気通貫。
                </motion.p>

                <motion.div
                  className="mt-8 flex flex-col sm:flex-row items-center gap-4"
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
                    href="#demo"
                    className="group flex items-center gap-2 text-sm font-semibold text-[var(--color-muted)] hover:text-[#137fec] transition-colors"
                  >
                    <Icon name="play_circle" size={20} />
                    機能を見る
                    <Icon name="arrow_forward" size={16} className="group-hover:translate-x-1 transition-transform" />
                  </Link>
                </motion.div>

                <motion.p
                  className="mt-4 text-xs text-[var(--color-muted)] flex items-center gap-2"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 1, duration: 0.5 }}
                >
                  <Icon name="check_circle" size={14} className="text-[#22c55e]" />
                  クレジットカード不要
                  <span className="pl-2 border-l border-[var(--color-border)]">1分で開始</span>
                </motion.p>
              </div>

              {/* Hero phone */}
              <motion.div
                className="relative flex justify-center lg:justify-end"
                initial={{ opacity: 0, y: 80 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6, duration: 1, ease: [0.22, 1, 0.36, 1] }}
              >
                <Phone src="/lp/quiz-new.png" alt="MERKENクイズ画面" priority className="w-[280px] md:w-[320px]" />
                <FloatingBadge
                  icon="psychology"
                  label="AI自動抽出"
                  sublabel="Core Tech"
                  color="#8b5cf6"
                  className="-left-4 lg:-left-16 top-20 hidden md:flex animate-[float_6s_ease-in-out_infinite]"
                  delay={1.2}
                />
                <FloatingBadge
                  icon="repeat_on"
                  label="SM-2 反復学習"
                  sublabel="Algorithm"
                  color="#22c55e"
                  className="-right-4 bottom-32 hidden md:flex animate-[float_8s_ease-in-out_infinite_1s]"
                  delay={1.5}
                />
                {/* Shadow base */}
                <div className="absolute -bottom-10 left-1/2 -translate-x-1/2 w-3/4 h-10 bg-black/10 dark:bg-black/30 blur-[20px] rounded-[100%]" />
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

      {/* ━━━ Demo Video Section (Dark vibe shift) ━━━ */}
      <section id="demo" className="py-24 md:py-32 bg-[#0B0F19] text-white relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(at_40%_20%,rgba(19,127,236,0.25)_0px,transparent_50%),radial-gradient(at_80%_0%,rgba(139,92,246,0.25)_0px,transparent_50%)] opacity-50" />

        <div className="max-w-7xl mx-auto px-6 relative z-10">
          <Reveal className="mb-16 md:w-1/2">
            <h2 className="font-display text-3xl md:text-5xl font-bold tracking-tight mb-6">
              <span className="text-[#8b5cf6] border-b-4 border-[#8b5cf6]">丸囲みスキャン</span>
            </h2>
            <p className="text-slate-400 text-lg leading-relaxed">
              教科書やプリントの覚えたい単語をペンで丸で囲むだけ。MERKENのAIが文脈を読み取り、正確な和訳と共にリスト化します。
            </p>
          </Reveal>

          <div className="grid lg:grid-cols-12 gap-12 items-center">
            {/* Video area */}
            <Reveal delay={0.1} className="lg:col-span-7">
              <div
                className="aspect-video bg-black rounded-3xl overflow-hidden shadow-[0_0_50px_rgba(139,92,246,0.15)] border border-white/10 relative group cursor-pointer"
                onClick={() => setVideoPlaying(true)}
              >
                {!videoPlaying ? (
                  <>
                    <div className="absolute inset-0 bg-gradient-to-br from-[#137fec]/20 to-[#8b5cf6]/20" />
                    <video
                      className="w-full h-full object-cover opacity-60 group-hover:opacity-80 transition-opacity duration-500"
                      muted
                      playsInline
                      preload="metadata"
                      poster=""
                    >
                      <source src="/lp/instagram/camera-scan.mp4" type="video/mp4" />
                    </video>
                    {/* Play button */}
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-20 h-20 rounded-full bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center group-hover:scale-110 group-hover:bg-[#137fec]/90 transition-all duration-300">
                        <Icon name="play_arrow" size={40} className="text-white ml-1" />
                      </div>
                    </div>
                  </>
                ) : (
                  <video
                    ref={videoRef}
                    className="w-full h-full object-cover"
                    controls
                    autoPlay
                    playsInline
                  >
                    <source src="/lp/instagram/camera-scan.mp4" type="video/mp4" />
                  </video>
                )}
              </div>
            </Reveal>

            {/* Polaroid stack of real photos */}
            <Reveal delay={0.3} className="lg:col-span-5 relative h-[400px] hidden md:block">
              <Polaroid
                src="/lp/instagram/vocab-circled-3.jpg"
                alt="英単語帳 - 人間関係セクション"
                caption="Note_03.jpg"
                className="absolute right-10 top-10 w-[240px] z-10"
                rotate={8}
              />
              <Polaroid
                src="/lp/instagram/vocab-circled-2.jpg"
                alt="英単語帳 - 人・人生セクション"
                caption="Textbook_02.jpg"
                className="absolute right-24 top-20 w-[240px] z-20"
                rotate={-4}
              />
              <Polaroid
                src="/lp/instagram/vocab-circled-1.jpg"
                alt="英単語帳 - 丸囲みされた単語"
                caption="Print_01.jpg"
                className="absolute right-40 top-4 w-[260px] z-30 shadow-[0_20px_40px_-5px_rgba(0,0,0,0.5)]"
                rotate={-12}
              />
              <div className="absolute bottom-0 left-0 bg-[#0f172a]/60 backdrop-blur-xl px-6 py-4 rounded-xl border border-white/10 z-0">
                <p className="text-sm flex gap-2 items-center text-slate-200">
                  <Icon name="draw" size={18} className="text-[#137fec]" />
                  教科書の丸で囲んだ単語だけを
                  <br />
                  AIが認識して抽出
                </p>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ━━━ How it works ━━━ */}
      <section className="py-24 md:py-32 relative">
        <div className="absolute inset-0 bg-[length:40px_40px] bg-[linear-gradient(to_right,rgba(0,0,0,0.03)_1px,transparent_1px),linear-gradient(to_bottom,rgba(0,0,0,0.03)_1px,transparent_1px)] dark:bg-[linear-gradient(to_right,rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.03)_1px,transparent_1px)] pointer-events-none" />

        <div className="max-w-7xl mx-auto px-6 relative z-10">
          <Reveal className="text-center mb-20">
            <p className="text-[#137fec] font-bold uppercase tracking-[0.2em] text-sm mb-2">Workflow</p>
            <h2 className="font-display text-3xl md:text-4xl font-bold text-[var(--color-foreground)] tracking-tight">
              魔法のように、3ステップで完了
            </h2>
          </Reveal>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
            {[
              {
                step: '01',
                title: '撮影する',
                desc: 'ノート・プリント・教科書をカメラで撮影。HEIC形式も自動で変換対応。',
                icon: 'photo_camera',
                color: '#137fec',
              },
              {
                step: '02',
                title: '確認する',
                desc: 'AIが抽出した英単語と高精度な和訳を確認。編集・削除も自由自在。',
                icon: 'checklist_rtl',
                color: '#8b5cf6',
              },
              {
                step: '03',
                title: '学習する',
                desc: 'クイズ・カード・例文で定着。SM-2アルゴリズムが最適タイミングで復習を提示。',
                icon: 'menu_book',
                color: '#22c55e',
              },
            ].map((item, i) => (
              <Reveal key={item.step} delay={i * 0.15} className="relative group text-center">
                {/* Large background number */}
                <div className="text-[120px] font-extrabold text-[var(--color-border)]/30 absolute top-[-60px] left-1/2 -translate-x-1/2 z-0 tracking-tighter">
                  {item.step}
                </div>

                <div className="relative z-10 flex flex-col items-center">
                  <div
                    className="w-20 h-20 rounded-2xl bg-[var(--color-surface)] shadow-xl border border-[var(--color-border)] flex items-center justify-center mb-6 group-hover:-translate-y-2 transition-transform"
                    style={{ color: item.color }}
                  >
                    <Icon name={item.icon} size={40} />
                  </div>
                  <h3 className="font-display text-2xl font-bold text-[var(--color-foreground)] mb-4">{item.title}</h3>
                  <p className="text-[var(--color-muted)] leading-relaxed">{item.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ━━━ 6 Scan Modes ━━━ */}
      <section className="py-24 md:py-32 bg-[var(--color-surface)] overflow-hidden relative">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-20 items-center">
            {/* Real textbook photo */}
            <Reveal className="order-2 lg:order-1 flex justify-center relative">
              <div className="absolute inset-0 bg-[#137fec]/10 blur-[100px] rounded-full -z-10" />
              <div className="relative rounded-3xl overflow-hidden shadow-2xl border-4 border-white/20 max-w-[400px]">
                <Image
                  src="/lp/instagram/vocab-circled-4.jpg"
                  alt="丸囲みされた英単語帳"
                  width={600}
                  height={800}
                  className="w-full h-auto"
                />
                <div className="absolute bottom-4 left-4 right-4 bg-black/60 backdrop-blur-md rounded-xl px-4 py-3 border border-white/10">
                  <p className="text-white text-sm font-medium flex items-center gap-2">
                    <Icon name="auto_awesome" size={16} className="text-[#137fec]" />
                    AIが丸囲みを自動認識
                  </p>
                </div>
              </div>
            </Reveal>

            {/* Bento grid */}
            <div className="order-1 lg:order-2">
              <Reveal>
                <h2 className="font-display text-3xl lg:text-4xl font-bold text-[var(--color-foreground)] mb-4 tracking-tight leading-tight">
                  目的に合わせた
                  <br />
                  4つの<span className="text-[#137fec]">抽出モード</span>
                </h2>
                <p className="text-[var(--color-muted)] mb-10 text-lg">
                  あらゆる教材のスタイルに合わせて、最も効率的に単語を取り込むためのAIビジョン機能。
                </p>
              </Reveal>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {scanModes.map((mode, i) => (
                  <Reveal key={mode.title} delay={i * 0.08} y={20}>
                    <div
                      className={`group p-5 rounded-2xl bg-[var(--color-background)] border transition-all duration-300 hover:shadow-lg ${
                        mode.featured
                          ? 'border-[#137fec]/30 shadow-[0_4px_20px_-5px_rgba(19,127,236,0.15)]'
                          : 'border-[var(--color-border)] hover:shadow-md'
                      }`}
                    >
                      <div
                        className="w-10 h-10 rounded-full flex items-center justify-center mb-3 transition-transform duration-300 group-hover:scale-110"
                        style={{ backgroundColor: mode.color + '15', color: mode.color }}
                      >
                        <Icon name={mode.icon} size={20} />
                      </div>
                      <h4 className="font-bold text-[var(--color-foreground)] mb-1">
                        {mode.title}
                        {mode.featured && <span className="text-[#137fec] ml-1">★</span>}
                      </h4>
                      <p className="text-xs text-[var(--color-muted)] leading-relaxed">{mode.desc}</p>
                    </div>
                  </Reveal>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ━━━ Study Modes ━━━ */}
      <section className="py-24 md:py-32">
        <div className="max-w-7xl mx-auto px-6">
          <Reveal className="text-center mb-16">
            <h2 className="font-display text-3xl md:text-4xl font-bold text-[var(--color-foreground)] mb-4">
              忘却曲線に基づく<span className="text-[#8b5cf6]">最適な復習</span>
            </h2>
            <p className="text-[var(--color-muted)] max-w-2xl mx-auto">
              SM-2アルゴリズムが一人ひとりの記憶度を分析し、忘れかける最適なタイミングで復習を提示。
              <br className="hidden sm:block" />
              がむしゃらに繰り返すのではなく、科学的に効率よく定着させます。
            </p>
          </Reveal>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-4xl mx-auto">
            {studyFeatures.map((item, i) => (
              <Reveal key={item.title} delay={i * 0.1}>
                <div className="group p-8 rounded-3xl bg-[var(--color-surface)] border border-[var(--color-border)] h-full hover:shadow-xl hover:-translate-y-1 transition-all duration-300 relative overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-br from-transparent to-transparent group-hover:from-[var(--color-primary-light)] group-hover:to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  <div
                    className="w-12 h-12 rounded-full flex items-center justify-center mb-6 relative z-10 group-hover:scale-110 transition-transform"
                    style={{ backgroundColor: item.color + '15', color: item.color }}
                  >
                    <Icon name={item.icon} size={24} />
                  </div>
                  <h3 className="font-display text-xl font-bold text-[var(--color-foreground)] mb-3 relative z-10">
                    {item.title}
                  </h3>
                  <p className="text-sm text-[var(--color-muted)] leading-relaxed relative z-10">{item.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ━━━ Progress tracking (Dark) ━━━ */}
      <section className="py-24 md:py-32 bg-[#0B0F19] text-white relative overflow-hidden">
        <div className="absolute right-0 top-0 w-1/2 h-full bg-gradient-to-l from-[#137fec]/10 to-transparent pointer-events-none" />

        <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 md:grid-cols-2 gap-16 items-center">
          {/* Text */}
          <Reveal>
            <h2 className="font-display text-3xl lg:text-4xl font-bold tracking-tight mb-6">
              学習の進捗が
              <br />
              ひと目でわかる
            </h2>
            <p className="text-slate-400 mb-10 text-lg leading-relaxed">
              毎日の学習量、定着率、苦手な単語の傾向をダッシュボードで可視化。モチベーションの維持を強力にサポートします。
            </p>

            <ul className="space-y-6">
              {[
                { icon: 'check_circle', title: '習得済み・復習中・未学習を自動で分類', color: '#22c55e' },
                { icon: 'bar_chart', title: '今日の学習量と正答率をリアルタイム表示', color: '#137fec' },
                { icon: 'local_fire_department', title: '連続学習日数でモチベーション維持', color: '#f59e0b' },
                { icon: 'star', title: '苦手な単語をお気に入り登録して重点復習', color: '#ec4899' },
              ].map((item, i) => (
                <Reveal key={item.title} delay={0.1 + i * 0.1} y={20}>
                  <li className="flex items-start gap-4">
                    <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center shrink-0 mt-1">
                      <Icon name={item.icon} size={18} style={{ color: item.color }} />
                    </div>
                    <p className="text-sm text-slate-300 leading-relaxed pt-1.5">{item.title}</p>
                  </li>
                </Reveal>
              ))}
            </ul>
          </Reveal>

          {/* Quiz screenshot */}
          <Reveal delay={0.3} className="flex justify-center relative">
            <div className="absolute inset-0 bg-[#8b5cf6]/20 blur-[120px] rounded-full -z-10" />
            <Phone src="/lp/quiz-new.png" alt="クイズ画面" className="w-[260px] md:w-[300px]" />
          </Reveal>
        </div>
      </section>

      {/* ━━━ Pricing ━━━ */}
      <section className="py-24 md:py-32 bg-[var(--color-surface)]">
        <div className="max-w-4xl mx-auto px-6">
          <Reveal className="text-center mb-16">
            <h2 className="font-display text-3xl md:text-4xl font-bold text-[var(--color-foreground)] mb-4 tracking-tight">
              シンプルで明瞭な<span className="text-[#137fec]">料金プラン</span>
            </h2>
            <p className="text-[var(--color-muted)]">
              まずは無料で始めて、もっと使いたくなったらProへ。
            </p>
          </Reveal>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
            {/* Free */}
            <Reveal>
              <div className="card p-10 h-full rounded-[2rem] flex flex-col">
                <p className="text-2xl font-bold text-[var(--color-foreground)]">Free</p>
                <p className="mt-4 text-4xl font-display font-bold text-[var(--color-foreground)] tracking-tighter">
                  ¥0
                </p>
                <p className="text-sm text-[var(--color-muted)] mt-1 mb-8">ずっと無料</p>
                <ul className="space-y-4 flex-grow">
                  {[
                    '1日3回までスキャン',
                    '100単語まで保存',
                    'ローカル保存',
                    '基本クイズモード',
                  ].map((item) => (
                    <li key={item} className="flex items-center gap-3 text-sm text-[var(--color-foreground)]">
                      <Icon name="check" size={18} className="text-[var(--color-muted)] shrink-0" />
                      {item}
                    </li>
                  ))}
                  <li className="flex items-center gap-3 text-sm text-[var(--color-muted)] opacity-40">
                    <Icon name="close" size={18} className="shrink-0" />
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
            <Reveal delay={0.15}>
              <div className="relative p-10 h-full rounded-[2rem] flex flex-col overflow-hidden bg-[#0B0F19] text-white border border-[#137fec]/50 shadow-[0_20px_50px_-12px_rgba(19,127,236,0.25)]">
                <div className="absolute inset-0 bg-gradient-to-br from-[#137fec]/20 to-[#8b5cf6]/20 opacity-50" />
                {/* Badge */}
                <div className="absolute top-0 right-8 bg-gradient-to-b from-[#137fec] to-[#0b61b8] text-white text-[10px] font-bold uppercase px-4 py-2 rounded-b-lg tracking-widest shadow-lg">
                  Most Popular
                </div>

                <div className="relative z-10 flex flex-col h-full">
                  <p className="text-2xl font-bold">Pro</p>
                  <div className="mt-4 flex items-end gap-1">
                    <span className="text-4xl font-display font-bold tracking-tighter">¥300</span>
                    <span className="text-slate-400 text-sm mb-1">/月</span>
                  </div>
                  <p className="text-sm text-slate-400 mt-1 mb-8">いつでも解約OK</p>
                  <ul className="space-y-4 flex-grow">
                    {[
                      { text: 'スキャン無制限', bold: true, icon: 'check_circle', color: '#137fec' },
                      { text: '単語登録数 無制限', bold: true, icon: 'check_circle', color: '#137fec' },
                      { text: 'クラウド同期・マルチデバイス', bold: false, icon: 'check_circle', color: '#137fec' },
                      { text: '全学習モード解放', bold: true, icon: 'check_circle', color: '#137fec' },
                      { text: '全4つのスキャンモード', bold: false, icon: 'star', color: '#8b5cf6' },
                      { text: 'AIセマンティック検索', bold: false, icon: 'auto_awesome', color: '#8b5cf6' },
                    ].map((item) => (
                      <li key={item.text} className="flex items-center gap-3 text-sm text-slate-200">
                        <Icon name={item.icon} size={18} style={{ color: item.color }} className="shrink-0" />
                        <span className={item.bold ? 'font-bold' : ''}>{item.text}</span>
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
                      className="w-full justify-center bg-white text-[#0B0F19] hover:bg-slate-100"
                    />
                  </div>
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ━━━ Final CTA ━━━ */}
      <section className="py-24 md:py-32 px-6">
        <div className="max-w-5xl mx-auto">
          <Reveal>
            <div className="relative rounded-[2.5rem] overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-[#137fec] via-[#4338ca] to-[#8b5cf6]" />
              <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/4 pointer-events-none" />
              <div className="absolute bottom-0 left-0 w-64 h-64 bg-black/10 rounded-full blur-3xl translate-y-1/2 -translate-x-1/4 pointer-events-none" />

              <div className="relative z-10 px-8 py-16 md:px-16 md:py-24 text-center flex flex-col items-center">
                <Icon name="rocket_launch" size={48} className="text-white/80 mb-6 drop-shadow-md" />
                <h2 className="font-display text-3xl md:text-5xl font-bold text-white mb-6 tracking-tight leading-tight">
                  今日から始めて、
                  <br />
                  合格に近づこう。
                </h2>
                <p className="text-white/80 mb-10 max-w-lg mx-auto text-lg leading-relaxed">
                  手書きのノートも、分厚い教科書も。写真を撮るだけで、AIがあなた専用の最強の単語帳を構築します。
                </p>
                <StatusAwareCta
                  guestLabel="無料で始める"
                  authLabel="ダッシュボードを開く"
                  variant="secondary"
                  size="lg"
                />
                <p className="mt-6 text-xs text-white/50 flex items-center gap-1.5">
                  <Icon name="lock" size={12} />
                  クレジットカード不要
                </p>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ━━━ Footer ━━━ */}
      <footer className="border-t border-[var(--color-border)]">
        <div className="max-w-7xl mx-auto px-6 py-16">
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-10 mb-16">
            <div className="col-span-2">
              <Link href="/lp" className="flex items-center gap-2 mb-6">
                <div className="w-8 h-8 rounded-full bg-[#137fec] flex items-center justify-center text-white">
                  <Icon name="school" size={16} />
                </div>
                <span className="font-display text-xl font-bold text-[var(--color-foreground)]">MERKEN</span>
              </Link>
              <p className="text-sm text-[var(--color-muted)] leading-relaxed max-w-xs mb-6">
                手入力ゼロの英単語帳。AIが写真から英単語を自動抽出して、クイズやフラッシュカードで学習。
              </p>
              <p className="text-[10px] font-bold tracking-widest text-[var(--color-muted)] uppercase">
                Built for Japanese English learners.
              </p>
            </div>

            <div>
              <h4 className="font-bold text-[var(--color-foreground)] mb-4">プロダクト</h4>
              <ul className="space-y-3 text-sm text-[var(--color-muted)]">
                <li><Link href="/features" className="hover:text-[#137fec] transition-colors">機能</Link></li>
                <li><Link href="/pricing" className="hover:text-[#137fec] transition-colors">料金</Link></li>
              </ul>
            </div>

            <div>
              <h4 className="font-bold text-[var(--color-foreground)] mb-4">会社情報</h4>
              <ul className="space-y-3 text-sm text-[var(--color-muted)]">
                <li><Link href="/terms" className="hover:text-[#137fec] transition-colors">利用規約</Link></li>
                <li><Link href="/privacy" className="hover:text-[#137fec] transition-colors">プライバシー</Link></li>
                <li><Link href="/tokusho" className="hover:text-[#137fec] transition-colors">特商法表記</Link></li>
                <li><Link href="/contact" className="hover:text-[#137fec] transition-colors">お問い合わせ</Link></li>
              </ul>
            </div>
          </div>

          <div className="pt-8 border-t border-[var(--color-border)] flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-xs text-[var(--color-muted)]">
              &copy; {new Date().getFullYear()} MERKEN. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
