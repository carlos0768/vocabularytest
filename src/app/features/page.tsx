import type { Metadata } from 'next';
import { MarketingShell, StatusAwareCta } from '@/components/marketing';
import { Icon } from '@/components/ui/Icon';
import { marketingHighlights, scanModes, studyModes } from '@/lib/marketing/content';

export const metadata: Metadata = {
  title: '機能紹介 | MERKEN',
  description: 'MERKENの機能紹介。6つのスキャンモードと学習モードで、手入力ゼロの単語学習を実現します。',
  alternates: {
    canonical: '/features',
  },
  openGraph: {
    title: '機能紹介 | MERKEN',
    description: '6つのスキャンモードと複数の学習モードで、撮るだけの英単語学習。',
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

export default function FeaturesPage() {
  return (
    <MarketingShell active="features">
      <div className="max-w-6xl mx-auto px-4 py-10 space-y-10">
        <section className="card p-6 md:p-8">
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
          <h1 className="font-display text-3xl md:text-4xl font-extrabold text-[var(--color-foreground)] leading-tight">
            写真からそのまま、<br className="hidden sm:block" />
            自分専用の単語帳へ
          </h1>
          <p className="text-[var(--color-muted)] mt-4 leading-relaxed max-w-2xl">
            ノートやプリントを撮影するだけで、英単語を抽出して単語帳化。
            復習フローまでつながる設計で、作成から定着までを一気通貫で進められます。
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <StatusAwareCta guestLabel="無料で始める" authLabel="ダッシュボードを開く" size="lg" />
          </div>
        </section>

        <section>
          <h2 className="font-display text-2xl font-bold text-[var(--color-foreground)] mb-4">MERKENの強み</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {marketingHighlights.map((item) => (
              <article key={item.title} className="card p-5">
                <div className="w-11 h-11 rounded-xl bg-[var(--color-primary-light)] flex items-center justify-center mb-3">
                  <Icon name={item.icon} size={22} className="text-[var(--color-primary)]" />
                </div>
                <h3 className="font-bold text-[var(--color-foreground)]">{item.title}</h3>
                <p className="text-sm text-[var(--color-muted)] mt-2 leading-relaxed">{item.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section>
          <h2 className="font-display text-2xl font-bold text-[var(--color-foreground)] mb-4">6つのスキャンモード</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {scanModes.map((mode) => (
              <article key={mode.title} className="card p-5">
                <div className="w-10 h-10 rounded-full bg-[var(--color-primary-light)] flex items-center justify-center mb-3">
                  <Icon name={mode.icon} size={20} className="text-[var(--color-primary)]" />
                </div>
                <h3 className="font-semibold text-[var(--color-foreground)]">{mode.title}</h3>
                <p className="text-sm text-[var(--color-muted)] mt-2">{mode.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section>
          <h2 className="font-display text-2xl font-bold text-[var(--color-foreground)] mb-4">学習モード</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {studyModes.map((mode) => (
              <article key={mode.title} className="card p-5">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div className="w-10 h-10 rounded-xl bg-[var(--color-primary-light)] flex items-center justify-center">
                    <Icon name={mode.icon} size={20} className="text-[var(--color-primary)]" />
                  </div>
                  {mode.proOnly && (
                    <span className="chip chip-pro text-[11px] px-3 py-1">
                      <Icon name="auto_awesome" size={12} />
                      Pro
                    </span>
                  )}
                </div>
                <h3 className="font-semibold text-[var(--color-foreground)]">{mode.title}</h3>
                <p className="text-sm text-[var(--color-muted)] mt-2">{mode.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="card p-6 md:p-8">
          <h2 className="font-display text-2xl font-bold text-[var(--color-foreground)]">オフラインでも学習を継続</h2>
          <p className="text-[var(--color-muted)] mt-3 leading-relaxed">
            PWA対応により、ホーム画面追加でアプリのように利用可能。無料プランはローカル保存、Proはクラウド同期で複数端末に対応します。
          </p>
          <div className="mt-6">
            <StatusAwareCta guestLabel="無料プランを試す" authLabel="今すぐ学習する" variant="secondary" />
          </div>
        </section>
      </div>
    </MarketingShell>
  );
}
