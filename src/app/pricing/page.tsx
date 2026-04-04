import type { Metadata } from 'next';
import { MarketingShell, StatusAwareCta } from '@/components/marketing';
import { Icon } from '@/components/ui/Icon';
import { STRIPE_CONFIG } from '@/lib/stripe/config';
import { pricingComparisonRows, pricingFaqs } from '@/lib/marketing/content';

export const metadata: Metadata = {
  title: '料金プラン | MERKEN',
  description: 'MERKENの料金プラン。無料で始めて、必要に応じてProで無制限スキャンとクラウド同期にアップグレード。',
  alternates: {
    canonical: '/pricing',
  },
  openGraph: {
    title: '料金プラン | MERKEN',
    description: '無料プランとProプランの違いを比較。英語学習のスタイルに合わせて選べます。',
    url: 'https://www.merken.jp/pricing',
    siteName: 'MERKEN',
    type: 'website',
    locale: 'ja_JP',
    images: [
      {
        url: 'https://www.merken.jp/icon-512.png',
        width: 512,
        height: 512,
        alt: 'MERKEN 料金プラン',
      },
    ],
  },
  twitter: {
    card: 'summary',
    title: '料金プラン | MERKEN',
    description: '無料から始める。必要に応じてProにアップグレード。',
    images: ['https://www.merken.jp/icon-512.png'],
  },
};

export default function PricingPage() {
  const proPlan = STRIPE_CONFIG.plans.pro;

  return (
    <MarketingShell active="pricing">
      <div className="max-w-6xl mx-auto px-4 py-10 space-y-10">
        <section className="card p-6 md:p-8">
          <div className="chip bg-[var(--color-primary-light)] text-[var(--color-primary)] text-xs mb-3 w-fit">
            <Icon name="payments" size={14} />
            シンプルな料金体系
          </div>
          <h1 className="font-display text-3xl md:text-4xl font-extrabold text-[var(--color-foreground)] leading-tight">
            まずは無料で、<br className="hidden sm:block" />
            必要なときにProへ
          </h1>
          <p className="text-[var(--color-muted)] mt-4 max-w-2xl leading-relaxed">
            学習量やデバイス利用に合わせて、柔軟にプランを選択できます。まずは無料で使い始めて、必要になったタイミングでアップグレードできます。
          </p>
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <article className="card p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-[var(--color-foreground)]">無料プラン</h2>
              <span className="text-2xl font-extrabold text-[var(--color-foreground)]">¥0</span>
            </div>
            <ul className="space-y-3 text-sm">
              <li className="flex items-center gap-2 text-[var(--color-muted)]">
                <Icon name="check" size={16} className="text-[var(--color-success)]" />
                1日{STRIPE_CONFIG.freePlan.dailyScanLimit}回までスキャン
              </li>
              <li className="flex items-center gap-2 text-[var(--color-muted)]">
                <Icon name="check" size={16} className="text-[var(--color-success)]" />
                ローカル保存（IndexedDB）
              </li>
              <li className="flex items-center gap-2 text-[var(--color-muted)]">
                <Icon name="check" size={16} className="text-[var(--color-success)]" />
                単語数上限 {STRIPE_CONFIG.freePlan.wordLimit}語
              </li>
            </ul>
            <div className="mt-6">
              <StatusAwareCta guestLabel="無料で始める" authLabel="ダッシュボードへ" variant="secondary" className="w-full" />
            </div>
          </article>

          <article className="card p-6 ring-2 ring-[var(--color-primary)]/25">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Icon name="auto_awesome" size={20} className="text-[var(--color-primary)]" />
                <h2 className="text-xl font-bold text-[var(--color-foreground)]">{proPlan.name}</h2>
              </div>
              <span className="text-2xl font-extrabold text-[var(--color-foreground)]">¥{proPlan.price}</span>
            </div>
            <ul className="space-y-3 text-sm">
              {proPlan.features.map((feature) => (
                <li key={feature} className="flex items-center gap-2 text-[var(--color-muted)]">
                  <Icon name="check" size={16} className="text-[var(--color-success)]" />
                  {feature}
                </li>
              ))}
            </ul>
            <p className="text-xs text-[var(--color-muted)] mt-5">
              ログイン中はダッシュボードの「プラン選択」からPro登録できます。
            </p>
            <div className="mt-4">
              <StatusAwareCta guestLabel="無料登録して始める" authLabel="ダッシュボードから登録" className="w-full" />
            </div>
          </article>
        </section>

        <section className="card p-6">
          <h2 className="font-display text-2xl font-bold text-[var(--color-foreground)] mb-4">プラン比較</h2>
          <div className="space-y-3">
            {pricingComparisonRows.map((row) => (
              <div key={row.feature} className="grid grid-cols-1 md:grid-cols-[1.2fr_1fr_1fr] gap-3 p-4 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)]">
                <p className="font-semibold text-[var(--color-foreground)]">{row.feature}</p>
                <p className="text-sm text-[var(--color-muted)]">
                  <span className="text-xs font-semibold text-[var(--color-muted)] mr-2">Free</span>
                  {row.free}
                </p>
                <p className="text-sm text-[var(--color-foreground)]">
                  <span className="text-xs font-semibold text-[var(--color-primary)] mr-2">Pro</span>
                  {row.pro}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="card p-6">
          <h2 className="font-display text-2xl font-bold text-[var(--color-foreground)] mb-4">よくある質問</h2>
          <div className="space-y-4">
            {pricingFaqs.map((faq) => (
              <article key={faq.question} className="rounded-[var(--radius-lg)] border border-[var(--color-border)] p-4 bg-[var(--color-surface)]">
                <h3 className="font-semibold text-[var(--color-foreground)]">{faq.question}</h3>
                <p className="text-sm text-[var(--color-muted)] mt-2 leading-relaxed">{faq.answer}</p>
              </article>
            ))}
          </div>
        </section>
      </div>
    </MarketingShell>
  );
}
