import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { MarketingShell, ScrollFadeIn, StatusAwareCta } from '@/components/marketing';
import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/utils';
import {
  howItWorksSteps,
  lpScanModes,
  studyModes,
  progressFeatures,
} from '@/lib/marketing/content';

export const metadata: Metadata = {
  title: '機能紹介 | MERKEN',
  description:
    'MERKENの機能紹介。6つのスキャンモードと学習モードで、手入力ゼロの単語学習を実現します。',
  alternates: {
    canonical: '/features',
  },
  openGraph: {
    title: '機能紹介 | MERKEN',
    description:
      '6つのスキャンモードと複数の学習モードで、撮るだけの英単語学習。',
    url: 'https://www.merken.jp/features',
    siteName: 'MERKEN',
    type: 'website',
    locale: 'ja_JP',
    images: [
      {
        url: 'https://www.merken.jp/icon-512.png',
        width: 512,
        height: 512,
        alt: 'MERKEN 機能紹介',
      },
    ],
  },
  twitter: {
    card: 'summary',
    title: '機能紹介 | MERKEN',
    description: '撮るだけで単語帳作成。MERKENの機能をチェック。',
    images: ['https://www.merken.jp/icon-512.png'],
  },
};

/* ──────────────────────── Phone Frame ──────────────────────── */

function PhoneFrame({ src, alt }: { src: string; alt: string }) {
  return (
    <div className="relative mx-auto w-[220px] md:w-[260px]">
      {/* Phone bezel */}
      <div className="rounded-[2rem] border-[6px] border-[#1a1a1a] bg-[#1a1a1a] shadow-xl overflow-hidden">
        {/* Notch */}
        <div className="absolute top-[6px] left-1/2 -translate-x-1/2 w-20 h-5 bg-[#1a1a1a] rounded-b-xl z-10" />
        <Image
          src={src}
          alt={alt}
          width={375}
          height={812}
          className="w-full h-auto rounded-[1.5rem]"
          priority={src.includes('scan')}
        />
      </div>
    </div>
  );
}

/* ──────────────────────── Page ──────────────────────── */

export default function FeaturesPage() {
  return (
    <MarketingShell active="features">
      <div className="max-w-6xl mx-auto px-4 py-10 space-y-20">
        {/* ─── 1. Hero ─── */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <span className="chip bg-[var(--color-primary-light)] text-[var(--color-primary)] text-xs">
                <Icon name="bolt" size={14} />
                手入力ゼロ
              </span>
              <span className="chip bg-[var(--color-success-light)] text-[var(--color-success)] text-xs">
                <Icon name="school" size={14} />
                英語学習に最適化
              </span>
            </div>
            <h1 className="font-display text-3xl md:text-4xl lg:text-5xl font-extrabold text-[var(--color-foreground)] leading-tight">
              写真を撮るだけで、
              <br />
              自分だけの単語帳
            </h1>
            <p className="text-[var(--color-muted)] mt-4 leading-relaxed max-w-lg text-base md:text-lg">
              ノートやプリントを撮影するだけで、英単語を抽出して単語帳化。
              6つのスキャンモードと複数の学習モードで、作成から定着までを一気通貫で進められます。
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <StatusAwareCta
                guestLabel="無料で始める"
                authLabel="ダッシュボードを開く"
                size="lg"
              />
            </div>
          </div>

          <ScrollFadeIn className="flex justify-center" delay={200}>
            <PhoneFrame src="/screenshots/scan-page.png" alt="MERKENスキャン画面" />
          </ScrollFadeIn>
        </section>

        {/* ─── 2. 使い方3ステップ ─── */}
        <section>
          <ScrollFadeIn>
            <h2 className="font-display text-2xl md:text-3xl font-bold text-[var(--color-foreground)] text-center mb-2">
              3ステップではじめる
            </h2>
            <p className="text-[var(--color-muted)] text-center mb-8 max-w-lg mx-auto">
              撮影から学習まで、シンプルな3ステップ。
            </p>
          </ScrollFadeIn>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 relative">
            {/* Connector lines (desktop only) */}
            <div className="hidden md:block absolute top-14 left-[calc(33.3%+12px)] right-[calc(33.3%+12px)] h-[2px] bg-[var(--color-border)]" />

            {howItWorksSteps.map((step, i) => (
              <ScrollFadeIn key={step.number} delay={i * 120}>
                <article className="card p-6 text-center relative">
                  <div className="w-14 h-14 rounded-full bg-[var(--color-primary)] text-white flex items-center justify-center mx-auto mb-4 text-lg font-extrabold">
                    {step.number}
                  </div>
                  <div className="w-12 h-12 rounded-xl bg-[var(--color-primary-light)] flex items-center justify-center mx-auto mb-3">
                    <Icon
                      name={step.icon}
                      size={24}
                      className="text-[var(--color-primary)]"
                    />
                  </div>
                  <h3 className="font-bold text-lg text-[var(--color-foreground)]">
                    {step.title}
                  </h3>
                  <p className="text-sm text-[var(--color-muted)] mt-2 leading-relaxed">
                    {step.description}
                  </p>
                </article>
              </ScrollFadeIn>
            ))}
          </div>
        </section>

        {/* ─── 3. 6つのスキャンモード ─── */}
        <section>
          <ScrollFadeIn>
            <h2 className="font-display text-2xl md:text-3xl font-bold text-[var(--color-foreground)] text-center mb-2">
              6つのスキャンモード
            </h2>
            <p className="text-[var(--color-muted)] text-center mb-8 max-w-lg mx-auto">
              目的に合わせて抽出方法を選べる。MERKENならではの機能です。
            </p>
          </ScrollFadeIn>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* First mode - featured full-width card */}
            <ScrollFadeIn className="md:col-span-2">
              <article
                className="card p-6 md:p-8 grid grid-cols-1 md:grid-cols-[1fr_auto] gap-6 items-center"
                style={{ borderLeftWidth: 4, borderLeftColor: lpScanModes[0].color }}
              >
                <div>
                  <div className="flex items-center gap-3 mb-3">
                    <div
                      className="w-11 h-11 rounded-xl flex items-center justify-center"
                      style={{ backgroundColor: lpScanModes[0].color + '18', color: lpScanModes[0].color }}
                    >
                      <Icon name={lpScanModes[0].icon} size={22} />
                    </div>
                    <h3 className="font-bold text-lg text-[var(--color-foreground)]">
                      {lpScanModes[0].title}
                    </h3>
                  </div>
                  <p className="text-[var(--color-muted)] leading-relaxed">
                    {lpScanModes[0].description}
                  </p>
                  <p className="text-sm mt-3 flex items-center gap-2 text-[var(--color-muted)]">
                    <Icon name="lightbulb" size={16} className="text-[var(--color-warning)]" />
                    {lpScanModes[0].useCase}
                  </p>
                </div>
                <div className="hidden md:block">
                  <PhoneFrame src="/screenshots/scan-page.png" alt="スキャンモード選択画面" />
                </div>
              </article>
            </ScrollFadeIn>

            {/* Remaining 5 modes — zigzag full-width strips */}
            {lpScanModes.slice(1).map((mode, i) => {
              const isReversed = i % 2 === 1;
              return (
                <ScrollFadeIn key={mode.title} className="md:col-span-2" delay={i * 100}>
                  <article className="card p-0 overflow-hidden grid grid-cols-1 md:grid-cols-[2fr_3fr] gap-0">
                    {/* Visual panel */}
                    <div
                      className={cn(
                        'relative flex items-center justify-center py-8 md:py-10',
                        isReversed && 'md:order-2'
                      )}
                      style={{ background: `linear-gradient(135deg, ${mode.color}18, ${mode.color}08)` }}
                    >
                      <div
                        className="absolute w-20 h-20 rounded-full"
                        style={{ backgroundColor: mode.color + '15' }}
                      />
                      <div
                        className="absolute w-12 h-12 rounded-full translate-x-6 -translate-y-4"
                        style={{ backgroundColor: mode.color + '10' }}
                      />
                      <Icon name={mode.icon} size={44} style={{ color: mode.color }} className="relative z-10" />
                    </div>

                    {/* Text panel */}
                    <div className={cn('p-5 md:p-7 flex flex-col justify-center', isReversed && 'md:order-1')}>
                      <span
                        className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-0.5 rounded-full w-fit mb-3"
                        style={{ backgroundColor: mode.color + '15', color: mode.color }}
                      >
                        <Icon name={mode.icon} size={13} style={{ color: mode.color }} />
                        スキャンモード
                      </span>
                      <h3 className="font-display text-lg md:text-xl font-bold text-[var(--color-foreground)]">
                        {mode.title}
                      </h3>
                      <p className="text-sm text-[var(--color-muted)] mt-2 leading-relaxed">
                        {mode.description}
                      </p>
                      <div
                        className="mt-3 p-2.5 rounded-lg flex items-start gap-2"
                        style={{ backgroundColor: mode.color + '08' }}
                      >
                        <Icon name="lightbulb" size={16} style={{ color: mode.color }} className="mt-0.5 shrink-0" />
                        <p className="text-xs text-[var(--color-muted)]">{mode.useCase}</p>
                      </div>
                    </div>
                  </article>
                </ScrollFadeIn>
              );
            })}
          </div>
        </section>

        {/* ─── 4. 学習モード ─── */}
        <section>
          <ScrollFadeIn>
            <h2 className="font-display text-2xl md:text-3xl font-bold text-[var(--color-foreground)] text-center mb-2">
              4つの学習モード
            </h2>
            <p className="text-[var(--color-muted)] text-center mb-8 max-w-lg mx-auto">
              気分や目的に合わせて、最適な方法で学習できます。
            </p>
          </ScrollFadeIn>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {studyModes.map((mode, i) => (
              <ScrollFadeIn key={mode.title} delay={(i % 2) * 100}>
                <article className="card p-5 h-full">
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <div className="w-11 h-11 rounded-xl bg-[var(--color-primary-light)] flex items-center justify-center">
                      <Icon
                        name={mode.icon}
                        size={22}
                        className="text-[var(--color-primary)]"
                      />
                    </div>
                    {mode.proOnly && (
                      <span className="chip chip-pro text-[11px] px-3 py-1">
                        <Icon name="auto_awesome" size={12} />
                        Pro
                      </span>
                    )}
                  </div>
                  <h3 className="font-semibold text-[var(--color-foreground)]">
                    {mode.title}
                  </h3>
                  <p className="text-sm text-[var(--color-muted)] mt-2 leading-relaxed">
                    {mode.description}
                  </p>
                </article>
              </ScrollFadeIn>
            ))}
          </div>
        </section>

        {/* ─── 5. 進捗トラッキング ─── */}
        <section>
          <ScrollFadeIn>
            <div className="card p-6 md:p-8 bg-[var(--color-primary-light)] border-[var(--color-primary)]/20">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
                <div>
                  <h2 className="font-display text-2xl md:text-3xl font-bold text-[var(--color-foreground)] mb-2">
                    学習の進捗がひと目でわかる
                  </h2>
                  <p className="text-[var(--color-muted)] mb-6 leading-relaxed">
                    毎日の学習をデータで振り返り。モチベーションが続く仕組みがあります。
                  </p>
                  <ul className="space-y-4">
                    {progressFeatures.map((feature) => (
                      <li key={feature.text} className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-lg bg-[var(--color-surface)] flex items-center justify-center shrink-0">
                          <Icon
                            name={feature.icon}
                            size={18}
                            className="text-[var(--color-primary)]"
                          />
                        </div>
                        <span className="text-sm text-[var(--color-foreground)] leading-relaxed pt-1">
                          {feature.text}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="flex justify-center">
                  <PhoneFrame src="/screenshots/stats-page.png" alt="MERKEN統計画面" />
                </div>
              </div>
            </div>
          </ScrollFadeIn>
        </section>

        {/* ─── 6. 料金ティーザー ─── */}
        <section>
          <ScrollFadeIn>
            <h2 className="font-display text-2xl md:text-3xl font-bold text-[var(--color-foreground)] text-center mb-2">
              無料で始められる
            </h2>
            <p className="text-[var(--color-muted)] text-center mb-8 max-w-lg mx-auto">
              まずは無料プランで体験。もっと使いたくなったらProへ。
            </p>
          </ScrollFadeIn>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <ScrollFadeIn>
              <article className="card p-6 h-full">
                <h3 className="text-lg font-bold text-[var(--color-foreground)] mb-1">
                  無料プラン
                </h3>
                <p className="text-3xl font-extrabold text-[var(--color-foreground)]">
                  ¥0
                </p>
                <ul className="mt-4 space-y-2 text-sm text-[var(--color-muted)]">
                  <li className="flex items-center gap-2">
                    <Icon name="check" size={16} className="text-[var(--color-success)]" />
                    1日3回までスキャン
                  </li>
                  <li className="flex items-center gap-2">
                    <Icon name="check" size={16} className="text-[var(--color-success)]" />
                    ローカル保存
                  </li>
                  <li className="flex items-center gap-2">
                    <Icon name="check" size={16} className="text-[var(--color-success)]" />
                    基本クイズモード
                  </li>
                </ul>
              </article>
            </ScrollFadeIn>

            <ScrollFadeIn delay={100}>
              <article className="card p-6 ring-2 ring-[var(--color-primary)]/25 h-full">
                <div className="flex items-center gap-2 mb-1">
                  <Icon name="auto_awesome" size={18} className="text-[var(--color-primary)]" />
                  <h3 className="text-lg font-bold text-[var(--color-foreground)]">
                    Proプラン
                  </h3>
                </div>
                <p className="text-3xl font-extrabold text-[var(--color-foreground)]">
                  ¥500
                  <span className="text-sm font-normal text-[var(--color-muted)]">/月</span>
                </p>
                <ul className="mt-4 space-y-2 text-sm text-[var(--color-muted)]">
                  <li className="flex items-center gap-2">
                    <Icon name="check" size={16} className="text-[var(--color-success)]" />
                    スキャン無制限
                  </li>
                  <li className="flex items-center gap-2">
                    <Icon name="check" size={16} className="text-[var(--color-success)]" />
                    クラウド同期・マルチデバイス
                  </li>
                  <li className="flex items-center gap-2">
                    <Icon name="check" size={16} className="text-[var(--color-success)]" />
                    全学習モード利用可能
                  </li>
                </ul>
              </article>
            </ScrollFadeIn>
          </div>

          <ScrollFadeIn className="text-center mt-6">
            <Link
              href="/pricing"
              className="text-sm font-semibold text-[var(--color-primary)] hover:underline inline-flex items-center gap-1"
            >
              料金プランの詳細を見る
              <Icon name="arrow_forward" size={16} />
            </Link>
          </ScrollFadeIn>
        </section>

        {/* ─── 7. 最終CTA ─── */}
        <section>
          <ScrollFadeIn>
            <div className="rounded-[var(--radius-2xl)] bg-[var(--color-primary)] p-8 md:p-12 text-center text-white">
              <h2 className="font-display text-2xl md:text-3xl font-extrabold leading-tight">
                今日から始めて、
                <br className="sm:hidden" />
                合格に近づこう
              </h2>
              <p className="mt-3 text-white/80 max-w-md mx-auto leading-relaxed">
                ノートを撮るだけで、自分だけの単語帳が完成。
                無料で今すぐ始められます。
              </p>
              <div className="mt-6">
                <StatusAwareCta
                  guestLabel="無料で始める"
                  authLabel="ダッシュボードを開く"
                  variant="secondary"
                  size="lg"
                />
              </div>
            </div>
          </ScrollFadeIn>
        </section>
      </div>
    </MarketingShell>
  );
}
