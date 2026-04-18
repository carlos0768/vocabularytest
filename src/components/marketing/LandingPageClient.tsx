'use client';

import Image from 'next/image';
import Link from 'next/link';
import { type ReactNode, useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/utils';
import { StatusAwareCta } from './StatusAwareCta';

const promisePoints = [
  {
    label: '入力の手間を消す',
    value: '撮るだけ',
    tone: 'from-[#dcfce7] to-[#f6fff2]',
  },
  {
    label: '紙の勉強をそのまま取り込む',
    value: 'ノート起点',
    tone: 'from-[#dbeafe] to-[#f8fbff]',
  },
  {
    label: '復習まで同じ場所で完結',
    value: '定着まで',
    tone: 'from-[#f3f4f6] to-[#ffffff]',
  },
];

const frictionCards = [
  {
    icon: 'draw',
    title: '覚えたい単語だけ抜き出すのが面倒',
    description: '教科書に印をつけても、単語帳に転記する段階で止まりやすい。',
  },
  {
    icon: 'ink_marker',
    title: 'テスト後の復習が一度きりで終わる',
    description: '間違えた単語を拾い直す場所がなく、次の試験まで埋もれてしまう。',
  },
  {
    icon: 'sync_problem',
    title: '作った単語帳が続かない',
    description: '作成と復習の画面が分かれていると、学習導線が途中で切れる。',
  },
];

const workflowSteps = [
  {
    step: '01',
    title: '紙の教材をそのまま撮影',
    description: 'ノート、プリント、教科書をカメラで取り込み。丸囲みや構成もそのまま学習素材になります。',
    accent: '#111418',
  },
  {
    step: '02',
    title: 'AIが単語と意味を整理',
    description: '英単語の抽出、日本語訳、復習しやすい単語帳の形まで自動で整えます。',
    accent: '#22c55e',
  },
  {
    step: '03',
    title: '同じ流れで復習まで進む',
    description: 'クイズ、カード、例文、進捗管理まで同じ場所で完結。作った瞬間から復習に入れます。',
    accent: '#2563eb',
  },
];

const scanModes = [
  {
    title: 'すべての単語',
    description: 'ページ全体からまとめて抽出。授業プリントや配布資料の取り込みに向いています。',
    icon: 'document_scanner',
    badge: '一括取り込み',
    accent: '#111418',
  },
  {
    title: '丸で囲んだ単語',
    description: '本当に覚えたい単語だけをピンポイントで抽出。テスト前の絞り込みに最適です。',
    icon: 'gesture',
    badge: '重点復習',
    accent: '#22c55e',
  },
  {
    title: '英検レベル',
    description: '級に合わせて語彙を絞り込み。教材はそのまま、学ぶ範囲だけ切り出せます。',
    icon: 'workspace_premium',
    badge: '検定対策',
    accent: '#2563eb',
  },
  {
    title: '熟語・イディオム',
    description: '単語だけでなく、意味のまとまりで覚えたい表現も拾いやすい設計です。',
    icon: 'link',
    badge: '表現定着',
    accent: '#f59e0b',
  },
];

const studyModes = [
  {
    title: '4択クイズ',
    description: '反応速度を落とさずに回せる主力モード。毎日の復習を止めません。',
    icon: 'quiz',
  },
  {
    title: '自己評価レビュー',
    description: '思い出せた感覚をその場で記録。復習タイミングの最適化につながります。',
    icon: 'neurology',
  },
  {
    title: 'フラッシュカード',
    description: '英日・日英を切り替えながら、短時間でも回しやすい形で確認できます。',
    icon: 'style',
  },
  {
    title: '例文クイズ',
    description: '単語単体ではなく文脈で覚える導線を持たせ、定着を深くします。',
    icon: 'short_text',
  },
];

const planCards = [
  {
    name: 'Free',
    price: '¥0',
    note: 'まず試したい人向け',
    features: ['1日3回までスキャン', '100語まで保存', '基本のクイズ学習'],
    muted: ['クラウド同期', '高度な学習モード'],
    panelClassName: 'bg-white text-[var(--color-foreground)]',
    accentClassName: 'text-[var(--color-muted)]',
    cta: { guestLabel: '無料で始める', authLabel: 'ダッシュボードへ', variant: 'secondary' as const },
  },
  {
    name: 'Pro',
    price: '¥300',
    note: '月額 / いつでも解約可',
    features: ['スキャン無制限', 'クラウド同期', 'マルチデバイス対応', '全学習モードを利用可能'],
    muted: ['紙の勉強をそのまま継続学習へ', '単語帳づくりを止めない導線'],
    panelClassName: 'bg-[#111418] text-white',
    accentClassName: 'text-white/60',
    cta: { guestLabel: 'Proで始める', authLabel: 'プランを確認', guestHref: '/signup', authHref: '/settings' },
  },
];

function Reveal({
  children,
  className,
  delay = 0,
  y = 32,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  y?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const visible = useInView(ref, { once: true, margin: '-96px' });

  return (
    <motion.div
      ref={ref}
      className={className}
      initial={{ opacity: 0, y }}
      animate={visible ? { opacity: 1, y: 0 } : undefined}
      transition={{ duration: 0.7, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white/85 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--color-muted)] backdrop-blur">
      <span className="h-1.5 w-1.5 rounded-full bg-[#22c55e]" />
      {children}
    </span>
  );
}

function DeviceFrame({
  src,
  alt,
  className,
  priority = false,
}: {
  src: string;
  alt: string;
  className?: string;
  priority?: boolean;
}) {
  return (
    <div className={cn('relative mx-auto w-[290px]', className)}>
      <div className="absolute inset-x-8 -bottom-8 h-14 rounded-full bg-black/20 blur-2xl" />
      <div className="relative overflow-hidden rounded-[2.4rem] border-[10px] border-[#101215] bg-[#101215] shadow-[0_32px_80px_-28px_rgba(0,0,0,0.45)]">
        <div className="absolute left-1/2 top-0 z-10 h-7 w-28 -translate-x-1/2 rounded-b-2xl bg-[#101215]" />
        <Image
          src={src}
          alt={alt}
          width={375}
          height={812}
          priority={priority}
          className="h-auto w-full"
        />
      </div>
    </div>
  );
}

function FloatingNote({
  title,
  value,
  icon,
  className,
}: {
  title: string;
  value: string;
  icon: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'rounded-[1.4rem] border border-black/10 bg-white/90 p-4 shadow-[0_20px_55px_-28px_rgba(0,0,0,0.35)] backdrop-blur',
        className
      )}
    >
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#f3f4f6] text-[var(--color-foreground)]">
          <Icon name={icon} size={20} />
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">{title}</p>
          <p className="mt-1 text-sm font-bold text-[var(--color-foreground)]">{value}</p>
        </div>
      </div>
    </div>
  );
}

export function LandingPageClient() {
  return (
    <div className="overflow-x-hidden bg-[var(--color-background)] text-[var(--color-foreground)]">
      <div className="fixed inset-x-0 top-0 z-50 border-b border-black/5 bg-white/85 backdrop-blur-xl">
        <div className="mx-auto flex h-[4.5rem] max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#111418] text-white">
              <Icon name="school" size={20} />
            </div>
            <div>
              <p className="font-display text-lg font-extrabold leading-none">MERKEN</p>
              <p className="mt-1 text-[11px] leading-none text-[var(--color-muted)]">紙の勉強を、そのまま単語帳へ</p>
            </div>
          </Link>

          <div className="hidden items-center gap-8 md:flex">
            <Link href="#workflow" className="text-sm font-medium text-[var(--color-muted)] transition-colors hover:text-[var(--color-foreground)]">
              使い方
            </Link>
            <Link href="#modes" className="text-sm font-medium text-[var(--color-muted)] transition-colors hover:text-[var(--color-foreground)]">
              モード
            </Link>
            <Link href="#pricing" className="text-sm font-medium text-[var(--color-muted)] transition-colors hover:text-[var(--color-foreground)]">
              料金
            </Link>
            <Link href="/login" className="text-sm font-medium text-[var(--color-muted)] transition-colors hover:text-[var(--color-foreground)]">
              ログイン
            </Link>
          </div>

          <StatusAwareCta
            guestLabel="無料で始める"
            authLabel="ダッシュボードへ"
            size="sm"
            className="hidden sm:inline-flex"
          />
        </div>
      </div>

      <section className="relative overflow-hidden bg-[linear-gradient(180deg,#f6f1e8_0%,#ffffff_56%,#ffffff_100%)] pt-28">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -left-20 top-8 h-72 w-72 rounded-full bg-[#d9f99d]/60 blur-3xl" />
          <div className="absolute right-0 top-24 h-[28rem] w-[28rem] rounded-full bg-[#dbeafe] blur-3xl" />
          <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-black/10 to-transparent" />
        </div>

        <div className="mx-auto grid max-w-7xl gap-14 px-4 pb-16 sm:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:px-8 lg:pb-24">
          <div className="relative z-10">
            <Reveal>
              <SectionLabel>Landing Page</SectionLabel>
            </Reveal>

            <Reveal className="mt-6" delay={0.05}>
              <h1 className="max-w-4xl font-display text-[clamp(3rem,7vw,6.3rem)] font-extrabold leading-[0.96] tracking-[-0.05em] text-[#111418]">
                単語帳を
                <br />
                <span className="text-[#2563eb]">作る前に止まる</span>
                <br />
                勉強を終わらせない。
              </h1>
            </Reveal>

            <Reveal className="mt-6 max-w-2xl" delay={0.1}>
              <p className="text-base leading-8 text-[#4b5563] md:text-lg">
                MERKEN は、ノートやプリントの写真から英単語を整理し、そのまま復習までつなげる学習アプリです。
                紙の勉強とデジタルの復習を分断させず、単語帳づくりの面倒さを最初から消します。
              </p>
            </Reveal>

            <Reveal className="mt-8 flex flex-col gap-3 sm:flex-row" delay={0.16}>
              <StatusAwareCta
                guestLabel="無料で始める"
                authLabel="ダッシュボードを開く"
                size="lg"
                className="justify-center bg-[#111418] px-8"
              />
              <Link
                href="#workflow"
                className="inline-flex h-14 items-center justify-center rounded-2xl border border-black/10 bg-white px-6 text-base font-semibold text-[var(--color-foreground)] transition-transform hover:-translate-y-0.5"
              >
                どう変わるかを見る
              </Link>
            </Reveal>

            <Reveal className="mt-10 grid gap-3 sm:grid-cols-3" delay={0.22}>
              {promisePoints.map((point) => (
                <div
                  key={point.value}
                  className={cn(
                    'rounded-[1.6rem] border border-black/10 bg-gradient-to-br p-4 shadow-[0_18px_40px_-28px_rgba(17,20,24,0.28)]',
                    point.tone
                  )}
                >
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--color-muted)]">{point.label}</p>
                  <p className="mt-3 font-display text-2xl font-bold tracking-[-0.04em] text-[#111418]">{point.value}</p>
                </div>
              ))}
            </Reveal>
          </div>

          <div className="relative min-h-[40rem]">
            <Reveal className="relative z-10 pt-4 lg:pt-8" delay={0.08}>
              <motion.div
                animate={{ y: [0, -8, 0] }}
                transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
              >
                <DeviceFrame
                  src="/lp/home.png"
                  alt="MERKEN ホーム画面"
                  className="mr-0 ml-auto w-[300px] sm:w-[340px]"
                  priority
                />
              </motion.div>
            </Reveal>

            <Reveal className="absolute left-0 top-14 z-20 hidden w-[15.5rem] sm:block" delay={0.18}>
              <div className="overflow-hidden rounded-[1.5rem] border border-black/10 bg-white shadow-[0_26px_60px_-30px_rgba(17,20,24,0.4)]">
                <div className="relative aspect-[4/5]">
                  <Image
                    src="/lp/instagram/vocab-circled-1.jpg"
                    alt="丸で囲んだ英単語の紙教材"
                    fill
                    className="object-cover"
                  />
                </div>
                <div className="border-t border-black/10 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--color-muted)]">Paper Input</p>
                  <p className="mt-2 text-sm font-semibold text-[var(--color-foreground)]">丸をつけた単語だけを、そのまま抽出</p>
                </div>
              </div>
            </Reveal>

            <Reveal className="absolute -bottom-3 right-2 z-20 hidden w-64 sm:block" delay={0.25}>
              <div className="overflow-hidden rounded-[1.6rem] border border-black/10 bg-[#111418] p-5 text-white shadow-[0_26px_60px_-30px_rgba(17,20,24,0.55)]">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.22em] text-white/50">Review Flow</p>
                    <p className="mt-1 font-display text-2xl font-bold tracking-[-0.04em]">作るより先に、復習へ入る。</p>
                  </div>
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10">
                    <Icon name="auto_stories" size={22} />
                  </div>
                </div>
                <div className="mt-5 grid gap-3">
                  <FloatingNote title="Scan Mode" value="丸囲み / 一括 / 英検 / 熟語" icon="document_scanner" className="bg-white/95 text-[var(--color-foreground)]" />
                  <FloatingNote title="Study Mode" value="クイズから例文まで同じ流れで" icon="school" className="bg-[#1f2937] text-white [&_p]:text-white" />
                </div>
              </div>
            </Reveal>
          </div>
        </div>

        <div className="mx-auto max-w-7xl px-4 pb-16 sm:px-6 lg:px-8">
          <Reveal className="grid gap-4 md:grid-cols-3">
            {frictionCards.map((card) => (
              <div key={card.title} className="rounded-[1.8rem] border border-black/10 bg-white p-6 shadow-[0_18px_44px_-32px_rgba(17,20,24,0.35)]">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#f3f4f6]">
                  <Icon name={card.icon} size={22} />
                </div>
                <h2 className="mt-5 text-lg font-bold tracking-[-0.03em] text-[var(--color-foreground)]">{card.title}</h2>
                <p className="mt-3 text-sm leading-7 text-[#6b7280]">{card.description}</p>
              </div>
            ))}
          </Reveal>
        </div>
      </section>

      <section id="workflow" className="bg-[#111418] py-20 text-white sm:py-28">
        <div className="mx-auto grid max-w-7xl gap-14 px-4 sm:px-6 lg:grid-cols-[0.88fr_1.12fr] lg:px-8">
          <div>
            <Reveal>
              <SectionLabel>Workflow</SectionLabel>
            </Reveal>

            <Reveal className="mt-6" delay={0.05}>
              <h2 className="font-display text-4xl font-bold leading-tight tracking-[-0.04em] text-white md:text-5xl">
                紙の学習を、
                <br />
                作業ではなく
                <br />
                流れに変える。
              </h2>
            </Reveal>

            <Reveal className="mt-6 max-w-xl" delay={0.1}>
              <p className="text-base leading-8 text-white/68">
                MERKEN の役割は、単語を抽出することだけではありません。撮影、整理、復習、進捗確認までが一本の導線でつながるから、
                「後でやる」が発生しにくくなります。
              </p>
            </Reveal>

            <div className="mt-10 grid gap-4">
              {workflowSteps.map((step, index) => (
                <Reveal key={step.step} delay={0.12 + index * 0.08}>
                  <div className="rounded-[1.8rem] border border-white/10 bg-white/5 p-5 backdrop-blur">
                    <div className="flex items-start gap-4">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/8 font-display text-lg font-bold text-white">
                        {step.step}
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-white">{step.title}</h3>
                        <p className="mt-2 text-sm leading-7 text-white/60">{step.description}</p>
                      </div>
                    </div>
                    <div
                      className="mt-4 h-1.5 rounded-full"
                      style={{ background: `linear-gradient(90deg, ${step.accent}, transparent)` }}
                    />
                  </div>
                </Reveal>
              ))}
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-[1.08fr_0.92fr]">
            <Reveal className="overflow-hidden rounded-[2rem] border border-white/10 bg-white/6 p-3 shadow-[0_24px_70px_-36px_rgba(0,0,0,0.5)]" delay={0.1}>
              <div className="mb-3 flex items-center justify-between px-2 pt-2 text-xs font-semibold uppercase tracking-[0.2em] text-white/40">
                <span>Scan Preview</span>
                <span>Live Footage</span>
              </div>
              <div className="overflow-hidden rounded-[1.5rem]">
                <video
                  autoPlay
                  muted
                  loop
                  playsInline
                  className="aspect-[4/5] w-full object-cover"
                >
                  <source src="/lp/instagram/camera-scan.mp4" type="video/mp4" />
                </video>
              </div>
            </Reveal>

            <div className="grid gap-6">
              <Reveal delay={0.18}>
                <div className="rounded-[2rem] border border-white/10 bg-[#1b1f24] p-6">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/40">Instant Output</p>
                  <p className="mt-3 font-display text-3xl font-bold tracking-[-0.04em] text-white">撮った直後に、学習単位へ。</p>
                  <p className="mt-3 text-sm leading-7 text-white/60">
                    OCR の結果をただ並べるのではなく、後から見返せる単語帳としてそのまま整えます。
                  </p>
                </div>
              </Reveal>

              <Reveal delay={0.24}>
                <div className="rounded-[2rem] border border-white/10 bg-[#e5f6ff] p-4 text-[var(--color-foreground)]">
                  <div className="overflow-hidden rounded-[1.5rem] border border-black/10 bg-white">
                    <Image
                      src="/lp/wordlist.png"
                      alt="MERKEN 単語一覧画面"
                      width={900}
                      height={1500}
                      className="h-auto w-full"
                    />
                  </div>
                </div>
              </Reveal>
            </div>
          </div>
        </div>
      </section>

      <section id="modes" className="py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <Reveal>
            <SectionLabel>Modes</SectionLabel>
          </Reveal>

          <div className="mt-6 grid gap-10 lg:grid-cols-[1fr_1fr] lg:items-end">
            <Reveal>
              <h2 className="font-display text-4xl font-bold leading-tight tracking-[-0.04em] text-[var(--color-foreground)] md:text-5xl">
                教材の使い方に合わせて、
                <br />
                抽出方法まで選べる。
              </h2>
            </Reveal>
            <Reveal delay={0.08}>
              <p className="max-w-2xl text-base leading-8 text-[#6b7280]">
                ただ写真を OCR するだけでは、実際の勉強フローに噛み合いません。MERKEN は教材の使い方に合わせてモードを切り替えられるので、
                一括取り込みにも、テスト前の重点復習にも対応できます。
              </p>
            </Reveal>
          </div>

          <div className="mt-12 grid gap-5 lg:grid-cols-[1.08fr_0.92fr]">
            <Reveal>
              <div className="rounded-[2.4rem] border border-black/10 bg-[#f8fafc] p-5 shadow-[0_24px_60px_-40px_rgba(17,20,24,0.35)]">
                <div className="mb-5 flex items-center justify-between">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--color-muted)]">Featured</p>
                    <p className="mt-2 font-display text-3xl font-bold tracking-[-0.04em] text-[var(--color-foreground)]">丸で囲んだ単語を、そのまま復習リストへ。</p>
                  </div>
                  <div className="hidden h-14 w-14 items-center justify-center rounded-2xl bg-[#111418] text-white sm:flex">
                    <Icon name="gesture" size={28} />
                  </div>
                </div>
                <div className="overflow-hidden rounded-[1.7rem] border border-black/10 bg-white">
                  <Image
                    src="/lp/scan-modes-2.png"
                    alt="MERKEN スキャンモード画面"
                    width={1170}
                    height={2532}
                    className="h-auto w-full"
                  />
                </div>
              </div>
            </Reveal>

            <div className="grid gap-4">
              {scanModes.map((mode, index) => (
                <Reveal key={mode.title} delay={0.08 + index * 0.06}>
                  <div className="rounded-[1.9rem] border border-black/10 bg-white p-5 shadow-[0_18px_44px_-34px_rgba(17,20,24,0.35)]">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <span
                          className="inline-flex rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em]"
                          style={{ backgroundColor: `${mode.accent}14`, color: mode.accent }}
                        >
                          {mode.badge}
                        </span>
                        <h3 className="mt-4 text-xl font-bold tracking-[-0.03em] text-[var(--color-foreground)]">{mode.title}</h3>
                        <p className="mt-3 text-sm leading-7 text-[#6b7280]">{mode.description}</p>
                      </div>
                      <div
                        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl"
                        style={{ backgroundColor: `${mode.accent}14`, color: mode.accent }}
                      >
                        <Icon name={mode.icon} size={22} />
                      </div>
                    </div>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="bg-[linear-gradient(180deg,#ffffff_0%,#eef7ff_100%)] py-20 sm:py-28">
        <div className="mx-auto grid max-w-7xl gap-12 px-4 sm:px-6 lg:grid-cols-[0.96fr_1.04fr] lg:px-8">
          <div className="relative">
            <Reveal className="rounded-[2.2rem] bg-[#111418] p-6 text-white shadow-[0_28px_70px_-42px_rgba(17,20,24,0.55)] sm:p-8">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-white/45">Study System</p>
              <h2 className="mt-4 font-display text-4xl font-bold leading-tight tracking-[-0.04em]">
                作った単語帳を、
                <br />
                ちゃんと続く学習へ。
              </h2>
              <p className="mt-5 max-w-lg text-sm leading-7 text-white/65">
                MERKEN は単語帳生成ツールではなく、復習導線まで含めた学習面を持っています。思い出す、間違える、戻る、定着させるまでを一つの画面群で回せます。
              </p>

              <div className="mt-8 grid gap-4 sm:grid-cols-2">
                <div className="rounded-[1.6rem] border border-white/10 bg-white/6 p-4">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-white/40">Quiz Screen</p>
                  <div className="mt-3 overflow-hidden rounded-[1.2rem] border border-white/10">
                    <Image
                      src="/lp/quiz-new.png"
                      alt="MERKEN クイズ画面"
                      width={1170}
                      height={2532}
                      className="h-auto w-full"
                    />
                  </div>
                </div>
                <div className="rounded-[1.6rem] border border-white/10 bg-white/6 p-4">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-white/40">Stats Screen</p>
                  <div className="mt-3 overflow-hidden rounded-[1.2rem] border border-white/10">
                    <Image
                      src="/lp/stats.png"
                      alt="MERKEN 学習統計画面"
                      width={1170}
                      height={2532}
                      className="h-auto w-full"
                    />
                  </div>
                </div>
              </div>
            </Reveal>
          </div>

          <div className="grid gap-4 self-center">
            {studyModes.map((mode, index) => (
              <Reveal key={mode.title} delay={0.08 + index * 0.06}>
                <div className="rounded-[1.9rem] border border-black/10 bg-white p-6 shadow-[0_18px_44px_-34px_rgba(17,20,24,0.35)]">
                  <div className="flex items-start gap-4">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#eff6ff] text-[#2563eb]">
                      <Icon name={mode.icon} size={22} />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold tracking-[-0.03em] text-[var(--color-foreground)]">{mode.title}</h3>
                      <p className="mt-2 text-sm leading-7 text-[#6b7280]">{mode.description}</p>
                    </div>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section id="pricing" className="py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <Reveal className="max-w-3xl">
            <SectionLabel>Pricing</SectionLabel>
          </Reveal>

          <div className="mt-6 grid gap-8 lg:grid-cols-[0.82fr_1.18fr]">
            <Reveal>
              <h2 className="font-display text-4xl font-bold leading-tight tracking-[-0.04em] text-[var(--color-foreground)] md:text-5xl">
                まず無料で使って、
                <br />
                本気で回すなら Pro。
              </h2>
              <p className="mt-6 max-w-xl text-base leading-8 text-[#6b7280]">
                英単語の取り込みが習慣になるかを最初に試せます。毎日スキャンして複数端末で回したくなった段階で、Pro に切り替える設計です。
              </p>
            </Reveal>

            <div className="grid gap-5 md:grid-cols-2">
              {planCards.map((plan, index) => (
                <Reveal key={plan.name} delay={0.08 + index * 0.08}>
                  <div className={cn('rounded-[2.2rem] border border-black/10 p-7 shadow-[0_24px_60px_-40px_rgba(17,20,24,0.35)]', plan.panelClassName)}>
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="font-display text-2xl font-bold tracking-[-0.03em]">{plan.name}</p>
                        <p className={cn('mt-2 text-sm', plan.accentClassName)}>{plan.note}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-display text-4xl font-bold tracking-[-0.05em]">{plan.price}</p>
                        {plan.name === 'Pro' && <p className="mt-1 text-xs uppercase tracking-[0.18em] text-white/45">per month</p>}
                      </div>
                    </div>

                    <div className="mt-8 space-y-3">
                      {plan.features.map((feature) => (
                        <div key={feature} className="flex items-start gap-3">
                          <div className={cn('mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full', plan.name === 'Pro' ? 'bg-white/12' : 'bg-[#f3f4f6]')}>
                            <Icon name="check" size={16} className={plan.name === 'Pro' ? 'text-white' : 'text-[var(--color-foreground)]'} />
                          </div>
                          <p className="text-sm leading-7">{feature}</p>
                        </div>
                      ))}
                    </div>

                    <div className="mt-6 space-y-2 border-t border-black/10 pt-5">
                      {plan.muted.map((item) => (
                        <p key={item} className={cn('text-sm leading-7', plan.accentClassName)}>
                          {item}
                        </p>
                      ))}
                    </div>

                    <div className="mt-8">
                      <StatusAwareCta
                        guestLabel={plan.cta.guestLabel}
                        authLabel={plan.cta.authLabel}
                        guestHref={plan.cta.guestHref}
                        authHref={plan.cta.authHref}
                        variant={plan.cta.variant ?? 'primary'}
                        className={cn(
                          'w-full justify-center',
                          plan.name === 'Pro' && 'bg-white text-[#111418] hover:bg-white/92'
                        )}
                      />
                    </div>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="px-4 pb-16 sm:px-6 sm:pb-24 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <Reveal>
            <div className="relative overflow-hidden rounded-[2.8rem] bg-[#111418] px-6 py-14 text-white shadow-[0_32px_90px_-40px_rgba(17,20,24,0.6)] sm:px-10 sm:py-[4.5rem] lg:px-14">
              <div className="pointer-events-none absolute inset-0">
                <div className="absolute -left-10 top-0 h-40 w-40 rounded-full bg-[#22c55e]/20 blur-3xl" />
                <div className="absolute right-0 top-0 h-52 w-52 rounded-full bg-[#2563eb]/25 blur-3xl" />
              </div>

              <div className="relative z-10 grid gap-10 lg:grid-cols-[1.06fr_0.94fr] lg:items-center">
                <div>
                  <SectionLabel>Final CTA</SectionLabel>
                  <h2 className="mt-6 font-display text-4xl font-bold leading-tight tracking-[-0.04em] text-white md:text-5xl">
                    単語帳づくりの面倒さを、
                    <br />
                    今日で終わらせる。
                  </h2>
                  <p className="mt-5 max-w-2xl text-base leading-8 text-white/68">
                    覚えたい単語に印をつける。写真を撮る。そこから先は MERKEN に任せる。紙の勉強を続ける人ほど、差が出るLPに仕上げています。
                  </p>
                </div>

                <div className="flex flex-col gap-4 lg:items-end">
                  <StatusAwareCta
                    guestLabel="無料で始める"
                    authLabel="ダッシュボードを開く"
                    size="lg"
                    className="w-full justify-center bg-white text-[#111418] sm:w-auto sm:px-10"
                  />
                  <p className="text-sm text-white/45">クレジットカード不要。まずは Free から試せます。</p>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>
    </div>
  );
}

export default LandingPageClient;
